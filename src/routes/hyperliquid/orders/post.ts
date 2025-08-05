import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schemas for placing orders
 */
export const placeOrderParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const placeOrderBodySchema = z.object({
  orders: z.array(z.object({
    assetSymbol: z.string().min(1), // Asset symbol (e.g., "BTC", "ETH")
    assetIndex: z.number().int().nonnegative(), // Asset index (numeric ID)
    side: z.enum(['buy', 'sell']),
    orderType: z.enum(['market', 'limit', 'trigger_market', 'trigger_limit', 'oracle']),
    size: z.string(),
    price: z.string().optional(),
    reduceOnly: z.boolean().optional(),
    postOnly: z.boolean().optional(),
    timeInForce: z.enum(['Alo', 'Ioc', 'Gtc']).optional(),
    triggerPrice: z.string().optional(),
    triggerCondition: z.enum(['tp', 'sl']).optional(),
    oraclePriceOffset: z.string().optional(),
    auctionStartPrice: z.string().optional(),
    auctionEndPrice: z.string().optional(),
    auctionDuration: z.number().optional(),
    clientOrderId: z.string().optional(),
  })),
  grouping: z.string().optional(),
  builderFee: z.number().optional(),
  signature: z.string().optional(),
  nonce: z.string().optional(),
});

export type PlaceOrderParams = z.infer<typeof placeOrderParamsSchema>;
export type PlaceOrderBody = z.infer<typeof placeOrderBodySchema>;

/**
 * Place orders
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/orders
 */
export const placeOrderHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    
    // Use non-SDK implementation
    const result = await hyperliquidService.placeOrder(
      ctx,
      Number(dexAccountId),
      req.body
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