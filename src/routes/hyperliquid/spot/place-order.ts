import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schemas for placing spot orders
 */
export const placeSpotOrderParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const placeSpotOrderBodySchema = z.object({
  orders: z.array(z.object({
    assetSymbol: z.string().min(1), // e.g., "PURR/USDC", "BTC/USDC"
    assetIndex: z.number().int().min(10000), // Spot pairs have ID >= 10000
    side: z.enum(['buy', 'sell']),
    orderType: z.enum(['market', 'limit']),
    size: z.string(),
    price: z.string().optional(),
    postOnly: z.boolean().optional(),
    timeInForce: z.enum(['Alo', 'Ioc', 'Gtc']).optional(),
    clientOrderId: z.string().optional(),
  })),
  grouping: z.string().optional(),
  builderFee: z.number().optional(),
  signature: z.string().optional(),
  nonce: z.string().optional(),
});

export type PlaceSpotOrderParams = z.infer<typeof placeSpotOrderParamsSchema>;
export type PlaceSpotOrderBody = z.infer<typeof placeSpotOrderBodySchema>;

/**
 * Place spot orders
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/spot/orders
 */
export const placeSpotOrderHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    
    // Transform spot orders to include spot asset IDs
    const spotOrders = req.body.orders.map((order: any) => {
      // If assetId is provided, use it directly
      if (order.assetId) {
        return {
          ...order,
          isSpot: true, // Flag to indicate this is a spot order
        };
      }
      
      // Otherwise, parse spot pair (e.g., "PURR/USDC" -> "PURR") for backward compatibility
      const [baseAsset] = order.asset.split('/');
      
      return {
        ...order,
        asset: baseAsset, // Just the base asset symbol
        isSpot: true, // Flag to indicate this is a spot order
      };
    });
    
    // Use the existing placeOrder method with spot flag
    const result = await hyperliquidService.placeSpotOrder(
      ctx,
      Number(dexAccountId),
      {
        ...req.body,
        orders: spotOrders,
      }
    );
    
    const response: ApiResponse = {
      success: true,
      data: result,
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};