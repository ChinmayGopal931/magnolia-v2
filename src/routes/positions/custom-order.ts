import { Request, Response, NextFunction } from 'express';
import { DatabaseRepository } from '@/db/repository';
import { ApiResponse, RequestContext, ApiError, ErrorCode } from '@/types/common';
import { z } from 'zod';
import { logger } from '@/utils/logger';
import { HyperliquidService } from '@/services/hyperliquid';
import { DriftService } from '@/services/drift';

const db = new DatabaseRepository();
const hyperliquidService = new HyperliquidService();
const driftService = new DriftService();

/**
 * Validation schema for hybrid order legs
 * - Lighter orders: Already executed on frontend (require execution data)
 * - Hyperliquid/Drift orders: Will be placed via backend API (require order parameters)
 */
const hybridOrderLegSchema = z.object({
  // Platform information
  dexType: z.enum(['hyperliquid', 'drift', 'lighter']),
  dexAccountId: z.number(),
  
  // Market information
  marketType: z.enum(['perp', 'spot']),
  symbol: z.string(),
  side: z.enum(['long', 'short', 'spot']),
  
  // Execution details (required for Lighter, optional for others)
  entryPrice: z.string().optional(), // Required for Lighter, optional for Hyperliquid/Drift
  size: z.string(),
  filledAmount: z.string().optional(), // Amount that was actually filled (Lighter only)
  
  // Order identification
  orderId: z.string().optional(), // External order ID from the exchange
  clientOrderId: z.string().optional(), // Client-side order identifier
  
  // Platform-specific fields
  // For Hyperliquid
  assetId: z.number().optional(),
  
  // For Drift  
  marketIndex: z.number().optional(),
  
  // For Lighter
  marketId: z.number().optional(), // uint8 (0-255) for Lighter
  clientOrderIndex: z.number().optional(), // Unique identifier for Lighter orders
  accountIndex: z.number().optional(), // Lighter account index
  apiKeyIndex: z.number().optional(), // API key index used for signing (0-254)
  nonce: z.string().optional(), // Nonce used for transaction signing
  timeInForce: z.string().optional(), // Lighter time in force
  orderType: z.string().optional(), // Order type (LIMIT, MARKET, etc.)
  
  // Optional execution metadata
  avgFillPrice: z.string().optional(),
  signature: z.string().optional(), // Transaction signature
  transactionHash: z.string().optional(), // Transaction hash
  executionMetadata: z.record(z.any()).optional(), // Additional execution data
});

/**
 * Validation schema for creating positions from executed orders
 */
export const createCustomOrderPositionBodySchema = z.object({
  name: z.string().min(1, "Position name is required"),
  asset: z.string().min(1, "Asset is required"), // The underlying asset for all legs
  legs: z.array(hybridOrderLegSchema).min(2).max(2), // Exactly 2 legs for delta neutral
  metadata: z.record(z.any()).optional(),
});

export type CreateCustomOrderPositionBody = z.infer<typeof createCustomOrderPositionBodySchema>;

/**
 * Create a new delta neutral position with hybrid order execution:
 * - Lighter orders: Already executed on frontend (execution data provided)
 * - Hyperliquid/Drift orders: Placed via backend API (order parameters provided)
 * POST /api/positions/custom-order
 */
export const createCustomOrderPositionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const validated = createCustomOrderPositionBodySchema.parse(req.body);
    
    // Validate that at least one leg is Lighter (frontend-executed)
    const lighterLegs = validated.legs.filter(leg => leg.dexType === 'lighter');
    if (lighterLegs.length === 0) {
      throw new ApiError(
        ErrorCode.INVALID_REQUEST,
        'This endpoint requires at least one Lighter order. Use /api/positions for standard Hyperliquid/Drift-only positions.'
      );
    }
    
    // Validate Lighter legs have execution data
    for (const leg of lighterLegs) {
      if (!leg.entryPrice) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          `entryPrice is required for Lighter orders (${leg.symbol})`
        );
      }
      if (leg.marketId === undefined) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          `marketId is required for Lighter orders (${leg.symbol})`
        );
      }
      if (leg.accountIndex === undefined) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          `accountIndex is required for Lighter orders (${leg.symbol})`
        );
      }
    }
    
    logger.info('Creating hybrid position with Lighter frontend-executed orders', {
      userId: ctx.userId,
      name: validated.name,
      asset: validated.asset,
      legCount: validated.legs.length,
      platforms: validated.legs.map(leg => leg.dexType),
      lighterLegs: lighterLegs.length,
    });
    
    // Start a database transaction
    const result = await db.transaction(async () => {
      // 1. Verify DEX account ownership for all legs
      const dexAccountIds = [...new Set(validated.legs.map(leg => leg.dexAccountId))];
      
      for (const accountId of dexAccountIds) {
        const account = await db.getDexAccount(accountId);
        if (!account || account.userId !== ctx.userId) {
          throw new ApiError(
            ErrorCode.FORBIDDEN,
            `Access denied to DEX account ${accountId}`
          );
        }
      }
      
      // 2. Validate delta neutral position requirements
      const hasLong = validated.legs.some(leg => leg.side === 'long' || leg.side === 'spot');
      const hasShort = validated.legs.some(leg => leg.side === 'short');
      
      if (!hasLong || !hasShort) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          'Delta neutral positions must have one long/spot leg and one short leg'
        );
      }
      
      // 3. Validate all legs use the same underlying asset
      const assetSymbols = validated.legs.map(leg => {
        // Extract base asset from symbol (e.g., "ETH" from "ETH-PERP")
        const baseAsset = leg.symbol.split('-')[0].toUpperCase();
        return baseAsset;
      });
      
      const uniqueAssets = [...new Set(assetSymbols)];
      if (uniqueAssets.length > 1) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          `All legs must use the same underlying asset. Found: ${uniqueAssets.join(', ')}`
        );
      }
      
      // Verify the asset matches what was specified
      if (uniqueAssets[0] !== validated.asset.toUpperCase()) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          `Asset mismatch: specified ${validated.asset} but legs use ${uniqueAssets[0]}`
        );
      }
      
      // 4. Validate position combinations
      const longLeg = validated.legs.find(leg => leg.side === 'long' || leg.side === 'spot');
      const shortLeg = validated.legs.find(leg => leg.side === 'short');
      
      if (!longLeg || !shortLeg) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          'Delta neutral positions must have one long/spot leg and one short leg'
        );
      }
      
      // Validate spot positions can only use 'spot' side
      if (longLeg.marketType === 'spot' && longLeg.side !== 'spot') {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          'Spot market positions must use side: "spot"'
        );
      }
      
      // Spot can only be on the long side of delta neutral
      if (shortLeg.marketType === 'spot') {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          'Cannot short spot markets. Spot positions can only be on the long side.'
        );
      }
      
      // 5. Handle mixed order execution: place backend orders and record frontend orders
      interface ExecutedOrder {
        dexType: 'hyperliquid' | 'drift' | 'lighter';
        dexAccountId: number;
        marketType: string;
        symbol: string;
        side: 'long' | 'short' | 'spot';
        entryPrice: string;
        size: string;
        orderId?: number;
        orderType: 'hyperliquid' | 'drift' | 'lighter';
        orderResult?: any;
        assetId?: number;
        marketIndex?: number;
        marketId?: number;
        clientOrderIndex?: number;
        accountIndex?: number;
        apiKeyIndex?: number;
        nonce?: string;
        timeInForce?: string;
        signature?: string;
        executionMetadata?: any;
      }
      const executedOrders: ExecutedOrder[] = [];
      const orderRecords: Array<{ 
        leg: any, 
        dbOrderId?: number 
      }> = [];
      
      for (const leg of validated.legs) {
        try {
          logger.info('Processing leg for position', {
            dexType: leg.dexType,
            symbol: leg.symbol,
            side: leg.side,
            size: leg.size,
            isLighter: leg.dexType === 'lighter'
          });
          
          if (leg.dexType === 'hyperliquid') {
            // Place order on Hyperliquid via backend API
            if (leg.assetId === undefined) {
              throw new ApiError(
                ErrorCode.INVALID_REQUEST,
                `assetId is required for Hyperliquid orders. Please provide assetId for ${leg.symbol}`
              );
            }
            
            // Place order on Hyperliquid
            const orderResult = await hyperliquidService.placeOrder(ctx, leg.dexAccountId, {
              orders: [{
                assetSymbol: leg.symbol,
                assetIndex: leg.assetId,
                asset: leg.symbol,
                assetId: leg.assetId,
                side: leg.side === 'long' || leg.side === 'spot' ? 'buy' : 'sell',
                orderType: 'market',
                size: leg.size,
                reduceOnly: false,
                isSpot: leg.marketType === 'spot',
              }],
            });
            
            // Get execution data
            const orderStatus = orderResult.statuses?.[0];
            let avgFillPrice = '0';
            let orderId = 0;
            
            if (orderStatus?.filled) {
              avgFillPrice = orderStatus.filled.avgPx || '0';
            } else if (orderStatus?.resting) {
              orderId = orderStatus.resting.oid;
              // Get reference price for resting orders
              try {
                const priceResponse = await hyperliquidService.getAssetPrices();
                const priceData = priceResponse.get(leg.assetId);
                if (priceData) {
                  avgFillPrice = priceData.midPx?.toString() || priceData.markPx?.toString() || '0';
                }
              } catch (err) {
                logger.error('Failed to get reference price', { error: err });
              }
            }
            
            logger.info('Hyperliquid order placed successfully', {
              orderId,
              avgFillPrice,
              symbol: leg.symbol,
              orderStatus,
            });
            
            executedOrders.push({
              ...leg,
              orderId: orderId,
              orderType: 'hyperliquid',
              entryPrice: avgFillPrice !== '0' ? avgFillPrice : '2500', // Use default if no price
              orderResult
            });
            
          } else if (leg.dexType === 'drift') {
            // Place order on Drift via backend API
            if (leg.marketIndex === undefined) {
              throw new ApiError(
                ErrorCode.INVALID_REQUEST,
                `marketIndex is required for Drift orders. Please provide marketIndex for ${leg.symbol}`
              );
            }
            
            // Place order on Drift
            const orderResult = await driftService.placeOrder(ctx, leg.dexAccountId, {
              marketIndex: leg.marketIndex,
              marketType: leg.marketType === 'perp' ? 'PERP' : 'SPOT',
              direction: leg.side === 'short' ? 'short' : 'long',
              amount: leg.size,
              orderType: 'market',
            });
            
            // Get execution data
            const fillPrice = orderResult.averagePrice || orderResult.price || leg.entryPrice || '0';
            
            logger.info('Drift order placed successfully', {
              orderId: orderResult.orderId,
              fillPrice,
              txSignature: orderResult.txSignature,
            });
            
            executedOrders.push({
              ...leg,
              orderId: orderResult.orderId,
              orderType: 'drift',
              entryPrice: fillPrice !== '0' ? fillPrice : '2500', // Use default if no price
              orderResult
            });
            
          } else if (leg.dexType === 'lighter') {
            // Lighter order already executed on frontend - just record the data
            if (!leg.entryPrice) {
              throw new ApiError(
                ErrorCode.INVALID_REQUEST,
                `entryPrice is required for Lighter orders (already executed). Please provide entryPrice for ${leg.symbol}`
              );
            }
            
            logger.info('Recording Lighter order executed on frontend', {
              symbol: leg.symbol,
              entryPrice: leg.entryPrice,
              marketId: leg.marketId,
              accountIndex: leg.accountIndex
            });
            
            executedOrders.push({
              ...leg,
              orderId: leg.clientOrderIndex,
              orderType: 'lighter',
              entryPrice: leg.entryPrice,
              orderResult: leg.executionMetadata || {}
            });
          }
          
        } catch (error) {
          logger.error('Failed to process leg', {
            dexType: leg.dexType,
            symbol: leg.symbol,
            error: error instanceof Error ? error.message : error,
            errorStack: error instanceof Error ? error.stack : undefined,
            legDetails: leg,
          });
          
          // Cancel any previously placed orders
          for (const executedOrder of executedOrders) {
            try {
              if (executedOrder.orderType === 'hyperliquid' && executedOrder.orderId) {
                await hyperliquidService.cancelOrder(
                  ctx,
                  executedOrder.dexAccountId,
                  {
                    cancels: [{
                      asset: executedOrder.symbol,
                      assetId: executedOrder.assetId,
                      orderId: executedOrder.orderId.toString()
                    }]
                  }
                );
              } else if (executedOrder.orderType === 'drift' && executedOrder.orderId) {
                await driftService.cancelOrder(
                  ctx,
                  executedOrder.dexAccountId,
                  executedOrder.orderId
                );
              }
              // Note: Cannot cancel Lighter orders as they're already executed
            } catch (cancelError) {
              logger.error('Failed to cancel order during rollback', {
                orderId: executedOrder.orderId,
                error: cancelError
              });
            }
          }
          
          throw error;
        }
      }
      
      // Create database records for all executed orders
      for (const executedOrder of executedOrders) {
        let dbOrderId: number | undefined;
        
        try {
          if (executedOrder.dexType === 'hyperliquid') {
            const dbOrder = await db.createHyperliquidOrder({
              dexAccountId: executedOrder.dexAccountId,
              userId: ctx.userId!,
              assetSymbol: executedOrder.symbol,
              assetIndex: executedOrder.assetId!,
              hlOrderId: executedOrder.orderId?.toString(),
              clientOrderId: executedOrder.clientOrderId,
              side: executedOrder.side === 'long' || executedOrder.side === 'spot' ? 'buy' : 'sell',
              orderType: 'market',
              size: executedOrder.size,
              filledSize: executedOrder.filledAmount || executedOrder.size,
              price: executedOrder.entryPrice,
              avgFillPrice: executedOrder.avgFillPrice || executedOrder.entryPrice,
              status: 'filled',
              rawResponse: executedOrder.orderResult,
            });
            dbOrderId = dbOrder.id;
            
          } else if (executedOrder.dexType === 'drift') {
            const dbOrder = await db.createDriftOrder({
              dexAccountId: executedOrder.dexAccountId,
              userId: ctx.userId!,
              driftOrderId: executedOrder.orderId?.toString(),
              clientOrderId: executedOrder.clientOrderId,
              marketIndex: executedOrder.marketIndex!,
              marketType: executedOrder.marketType === 'perp' ? 'PERP' : 'SPOT',
              direction: executedOrder.side === 'short' ? 'short' : 'long',
              baseAssetAmount: executedOrder.size,
              filledAmount: executedOrder.filledAmount || executedOrder.size,
              price: executedOrder.entryPrice,
              avgFillPrice: executedOrder.avgFillPrice || executedOrder.entryPrice,
              status: 'filled',
              orderType: 'market',
              rawParams: executedOrder.orderResult,
            });
            dbOrderId = dbOrder.id;
            
          } else if (executedOrder.dexType === 'lighter') {
            const dbOrder = await db.createLighterOrder({
              dexAccountId: executedOrder.dexAccountId,
              userId: ctx.userId!,
              lighterOrderId: executedOrder.orderId?.toString(),
              clientOrderIndex: executedOrder.clientOrderIndex,
              marketId: executedOrder.marketId!,
              side: executedOrder.side === 'long' || executedOrder.side === 'spot' ? 'buy' : 'sell',
              orderType: executedOrder.orderType || 'ORDER_TYPE_MARKET',
              baseAmount: executedOrder.size,
              filledAmount: executedOrder.filledAmount || executedOrder.size,
              price: executedOrder.entryPrice,
              avgFillPrice: executedOrder.avgFillPrice || executedOrder.entryPrice,
              status: 'filled',
              timeInForce: executedOrder.timeInForce,
              accountIndex: executedOrder.accountIndex!,
              apiKeyIndex: executedOrder.apiKeyIndex,
              nonce: executedOrder.nonce,
              signature: executedOrder.signature,
              rawParams: executedOrder.orderResult,
            });
            dbOrderId = dbOrder.id;
          }
          
          logger.info('Created order record', {
            dexType: executedOrder.dexType,
            dbOrderId,
            symbol: executedOrder.symbol,
            side: executedOrder.side,
            size: executedOrder.size,
            entryPrice: executedOrder.entryPrice,
          });
          
        } catch (dbError) {
          logger.error('Failed to create order record', {
            error: dbError,
            dexType: executedOrder.dexType,
            symbol: executedOrder.symbol,
          });
        }
        
        orderRecords.push({
          leg: executedOrder,
          dbOrderId,
        });
      }
      
      // 6. Create the position (always delta_neutral)
      const position = await db.createPosition({
        userId: ctx.userId!,
        positionType: 'delta_neutral',
        name: validated.name,
        metadata: {
          asset: validated.asset,
          executionMethod: 'frontend', // Mark as frontend-executed
          ...validated.metadata,
        },
      });
      
      // 7. Create position snapshots for each leg using executed order data
      const snapshots = await Promise.all(
        orderRecords.map(async (record) => {
          const executedOrder = record.leg;
          
          // Calculate notional value using actual fill price
          const size = parseFloat(executedOrder.size);
          const entryPrice = parseFloat(executedOrder.entryPrice);
          const notionalValue = (size * entryPrice).toString();
          
          return await db.createPositionSnapshot({
            positionId: position.id,
            dexType: executedOrder.dexType,
            dexAccountId: executedOrder.dexAccountId,
            symbol: executedOrder.symbol,
            side: executedOrder.side,
            entryPrice: executedOrder.entryPrice,
            currentPrice: executedOrder.entryPrice, // Initially same as entry
            size: executedOrder.size,
            notionalValue,
            hyperliquidOrderId: executedOrder.dexType === 'hyperliquid' && record.dbOrderId ? record.dbOrderId : undefined,
            driftOrderId: executedOrder.dexType === 'drift' && record.dbOrderId ? record.dbOrderId : undefined,
            lighterOrderId: executedOrder.dexType === 'lighter' && record.dbOrderId ? record.dbOrderId : undefined,
            metadata: {
              marketType: executedOrder.marketType,
              assetId: executedOrder.assetId,
              marketIndex: executedOrder.marketIndex,
              marketId: executedOrder.marketId,
              clientOrderIndex: executedOrder.clientOrderIndex,
              accountIndex: executedOrder.accountIndex,
              apiKeyIndex: executedOrder.apiKeyIndex,
              nonce: executedOrder.nonce,
              timeInForce: executedOrder.timeInForce,
              orderType: executedOrder.orderType === 'lighter' ? executedOrder.orderType : 'market',
              executionMethod: executedOrder.dexType === 'lighter' ? 'frontend' : 'backend',
              executionMetadata: executedOrder.executionMetadata,
              transactionHash: executedOrder.transactionHash,
              signature: executedOrder.signature,
              filledAmount: executedOrder.filledAmount,
              avgFillPrice: executedOrder.avgFillPrice,
            },
          });
        })
      );
      
      // 8. Return the complete position with snapshots
      return {
        ...position,
        legs: snapshots.map(snapshot => ({
          id: snapshot.id,
          dex: snapshot.dexType,
          marketType: orderRecords.find(
            record => record.leg.dexAccountId === snapshot.dexAccountId
          )?.leg.marketType,
          symbol: snapshot.symbol,
          side: snapshot.side,
          entryPrice: snapshot.entryPrice,
          currentPrice: snapshot.currentPrice,
          size: snapshot.size,
          notionalValue: snapshot.notionalValue,
          metadata: snapshot.metadata,
        })),
      };
    });
    
    logger.info('Hybrid position created successfully', {
      positionId: result.id,
      userId: ctx.userId,
      lighterLegsCount: validated.legs.filter(leg => leg.dexType === 'lighter').length,
      backendLegsCount: validated.legs.filter(leg => leg.dexType !== 'lighter').length,
    });
    
    const response: ApiResponse = {
      success: true,
      data: result,
    };
    
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};