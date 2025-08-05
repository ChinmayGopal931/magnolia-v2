import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { DatabaseRepository } from '@/db/repository';
import { ApiResponse, RequestContext, ApiError, ErrorCode } from '@/types/common';
import { logger } from '@/utils/logger';
import { HyperliquidService } from '@/services/hyperliquid';
import { DriftService } from '@/services/drift';

const db = new DatabaseRepository();
const hyperliquidService = new HyperliquidService();
const driftService = new DriftService();

export const closePositionParamsSchema = z.object({
  id: z.string().transform(Number),
});

export const closePositionBodySchema = z.object({
  legs: z.array(z.object({
    snapshotId: z.number().describe('The snapshot ID for this leg'),
    // For Hyperliquid positions
    assetId: z.number().optional().describe('Hyperliquid asset ID'),
    // For Drift positions
    marketIndex: z.number().optional().describe('Drift market index'),
    marketType: z.enum(['PERP', 'SPOT']).optional().describe('Drift market type'),
  })).optional().describe('Optional: provide specific IDs for each leg'),
});

export type ClosePositionParams = z.infer<typeof closePositionParamsSchema>;
export type ClosePositionBody = z.infer<typeof closePositionBodySchema>;

export const closePositionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { id: positionId } = req.params;
    const body = req.body as ClosePositionBody;
    
    logger.info('Closing position', { positionId, userId: ctx.userId });
    
    // Get position details with snapshots
    const position = await db.getPositionWithSnapshots(Number(positionId));
    
    if (!position || position.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Position not found', 404);
    }
    
    // Check if already closed
    if (position.status !== 'open') {
      throw new ApiError(ErrorCode.INVALID_REQUEST, `Position is already ${position.status}`, 400);
    }
    
    // Close each leg of the position on the respective exchanges
    const closeResults = [];
    const errors = [];
    
    // Create a map of leg overrides if provided
    const legOverrides = new Map<number, any>();
    if (body.legs) {
      body.legs.forEach(leg => {
        legOverrides.set(leg.snapshotId, leg);
      });
    }
    
    for (const snapshot of position.snapshots) {
      try {
        // Get any overrides for this leg
        const override = legOverrides.get(snapshot.id);
        
        logger.info('Closing position leg', {
          dexType: snapshot.dexType,
          symbol: snapshot.symbol,
          side: snapshot.side,
          size: snapshot.size,
          dexAccountId: snapshot.dexAccountId,
          hasOverride: !!override
        });
        
        if (snapshot.dexType === 'hyperliquid') {
          // Close position on Hyperliquid
          // Get market type from metadata
          const marketType = (snapshot.metadata as any)?.marketType;
          
          // For spot positions, always use the spot assetId from metadata
          // For perp positions, allow override or use metadata
          let assetId: number | undefined;
          if (marketType === 'spot') {
            // For spot, always use the stored spot assetId
            assetId = (snapshot.metadata as any)?.assetId || (snapshot.metadata as any)?.assetIndex;
            if (override?.assetId && override.assetId !== assetId) {
              logger.warn('Override assetId does not match stored spot assetId, using stored value', {
                overrideAssetId: override.assetId,
                storedAssetId: assetId,
                marketType,
                symbol: snapshot.symbol,
              });
            }
          } else {
            // For perp, use override if provided, otherwise metadata
            assetId = override?.assetId || (snapshot.metadata as any)?.assetId || (snapshot.metadata as any)?.assetIndex;
          }
          
          logger.info('Resolving asset ID for Hyperliquid position', {
            override: override,
            metadataAssetId: (snapshot.metadata as any)?.assetId,
            metadataAssetIndex: (snapshot.metadata as any)?.assetIndex,
            resolvedAssetId: assetId,
            marketType,
            symbol: snapshot.symbol,
            metadata: snapshot.metadata,
          });
          
          // If no assetId is available, we need to determine it based on market type
          if (!assetId && snapshot.metadata) {
            
            // For spot positions, we need the frontend to provide the correct assetId
            if (marketType === 'spot') {
              logger.error('Spot position without assetId', {
                symbol: snapshot.symbol,
                metadata: snapshot.metadata,
                snapshotId: snapshot.id
              });
              throw new ApiError(
                ErrorCode.INVALID_REQUEST,
                `Spot position ${snapshot.symbol} requires assetId. For spot assets, use assetId = 10000 + index. Please provide the correct assetId in the request body for snapshot ${snapshot.id}.`
              );
            }
          }
          
          
          // Ensure we have assetId before attempting to close
          if (!assetId && assetId !== 0) {
            throw new ApiError(
              ErrorCode.INVALID_REQUEST,
              `Missing assetId for Hyperliquid position ${snapshot.symbol}. Please provide assetId in the request body for snapshot ${snapshot.id}.`
            );
          }
          
          const result = await hyperliquidService.closePosition(ctx, snapshot.dexAccountId, {
            assetSymbol: snapshot.symbol,
            assetIndex: assetId,
            size: snapshot.size // Will close the entire position
          });
          
          closeResults.push({
            dexType: 'hyperliquid',
            symbol: snapshot.symbol,
            result,
            success: true
          });
          
          logger.info('Hyperliquid position closed successfully', {
            symbol: snapshot.symbol,
            result
          });
          
        } else if (snapshot.dexType === 'drift') {
          // Handle both formats: "MARKET_0_PERP" or "BTC-PERP"
          let marketIndex: number;
          let marketType: 'PERP' | 'SPOT';
          
          // First check if we have overrides from request body
          if (override?.marketIndex !== undefined && override?.marketType) {
            marketIndex = override.marketIndex;
            marketType = override.marketType;
            logger.info('Using provided market info from request', {
              marketIndex,
              marketType,
              symbol: snapshot.symbol
            });
          } else {
            // Fall back to parsing from symbol or metadata
            const symbolMatch = snapshot.symbol.match(/MARKET_(\d+)_(\w+)/);
            if (symbolMatch) {
              // Old format: "MARKET_0_PERP"
              marketIndex = parseInt(symbolMatch[1]);
              marketType = symbolMatch[2] as 'PERP' | 'SPOT';
            } else {
              // New format: "BTC-PERP" or "BTC-SPOT"
              // Get metadata which should contain marketType
              const metadata = snapshot.metadata as any;
              const storedMarketType = metadata?.marketType;
              const storedMarketIndex = metadata?.marketIndex;
              
              // Use stored market index if available
              if (storedMarketIndex !== undefined) {
                marketIndex = storedMarketIndex;
                marketType = storedMarketType?.toUpperCase() as 'PERP' | 'SPOT';
              } else {
                if (!storedMarketType) {
                  throw new ApiError(ErrorCode.INVALID_REQUEST, 
                    `Cannot determine market type for Drift position: ${snapshot.symbol}. Please provide marketIndex and marketType in request body.`);
                }
                
                // Map asset symbols to Drift market indexes (fallback only)
                const driftMarketMap: Record<string, number> = {
                  'BTC-PERP': 1,  // Based on the frontend logs showing BTC-PERP has contract_index: 1
                  'ETH-PERP': 2,
                  'SOL-PERP': 0,
                  // Add more mappings as needed
                  'BTC-SPOT': 1,
                  'ETH-SPOT': 2,
                  'SOL-SPOT': 0,
                  'USDC-SPOT': 0, // USDC is usually market 0 for spot
                };
                
                const marketKey = `${snapshot.symbol}`.toUpperCase();
                marketIndex = driftMarketMap[marketKey];
                
                if (marketIndex === undefined) {
                  logger.error('Unknown Drift market symbol', {
                    symbol: snapshot.symbol,
                    marketKey,
                    availableMarkets: Object.keys(driftMarketMap)
                  });
                  throw new ApiError(ErrorCode.INVALID_REQUEST, 
                    `Unknown Drift market: ${snapshot.symbol}. Please provide marketIndex in request body.`);
                }
                
                marketType = storedMarketType.toUpperCase() as 'PERP' | 'SPOT';
              }
            }
          }
          
          const result = await driftService.closePosition(ctx, snapshot.dexAccountId, {
            marketIndex,
            marketType,
            size: snapshot.size
          });
          
          closeResults.push({
            dexType: 'drift',
            symbol: snapshot.symbol,
            result,
            success: true
          });
          
          logger.info('Drift position closed successfully', {
            symbol: snapshot.symbol,
            result
          });
        }
        
      } catch (error) {
        logger.error('Failed to close position leg', {
          dexType: snapshot.dexType,
          symbol: snapshot.symbol,
          error: error instanceof Error ? error.message : error
        });
        
        errors.push({
          dexType: snapshot.dexType,
          symbol: snapshot.symbol,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Only update position status if all legs were successfully closed
    if (errors.length === 0) {
      logger.info('All position legs closed successfully, updating database', { positionId });
      
      // Calculate total P&L from entry vs exit prices
      let totalPnl = 0;
      
      // For now, we'll set P&L to 0 and let the user update it manually
      // In a production system, you would fetch the actual exit prices from the exchanges
      // and calculate P&L based on entry price, exit price, and position size
      
      // Update position status
      const updatedPosition = await db.updatePosition(Number(positionId), {
        status: 'closed',
        closedAt: new Date(),
        totalPnl: totalPnl.toString(),
        closedPnl: totalPnl.toString(),
      });
      
      // Get updated position with snapshots
      const updatedSnapshots = await db.getPositionSnapshots(Number(positionId));
      
      const legs = updatedSnapshots.map(snapshot => {
        return {
          id: snapshot.id,
          dex: snapshot.dexType,
          symbol: snapshot.symbol,
          side: snapshot.side,
          entryPrice: snapshot.entryPrice,
          currentPrice: snapshot.currentPrice,
          markPrice: snapshot.markPrice,
          liquidationPrice: snapshot.liquidationPrice,
          size: snapshot.size,
          notionalValue: snapshot.notionalValue,
        };
      });
      
      const closedPosition = {
        id: updatedPosition.id,
        name: updatedPosition.name,
        positionType: updatedPosition.positionType,
        status: updatedPosition.status,
        totalPnl: updatedPosition.totalPnl,
        closedPnl: updatedPosition.closedPnl,
        legs,
        metadata: updatedPosition.metadata,
        createdAt: updatedPosition.createdAt,
        closedAt: updatedPosition.closedAt,
        updatedAt: updatedPosition.updatedAt,
      };
      
      const response: ApiResponse = {
        success: true,
        data: {
          position: closedPosition,
          closeResults,
          message: 'All positions closed successfully'
        },
      };
      
      res.json(response);
    } else {
      // Some positions failed to close
      logger.error('Failed to close all position legs', {
        positionId,
        errors,
        closeResults
      });
      
      // Return partial success with errors
      const response: ApiResponse = {
        success: false,
        data: {
          position: {
            id: position.id,
            name: position.name,
            status: position.status, // Still 'open' since not all legs closed
            positionType: position.positionType,
          },
          closeResults,
          errors,
          message: 'Failed to close some position legs. Position remains open.'
        },
        error: 'Some position legs could not be closed'
      };
      
      res.status(400).json(response);
    }
  } catch (error) {
    next(error);
  }
};