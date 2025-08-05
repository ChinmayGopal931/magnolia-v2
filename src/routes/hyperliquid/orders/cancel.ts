import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schemas for canceling orders
 */
export const cancelOrderParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const cancelOrderBodySchema = z.object({
  cancels: z.array(z.object({
    assetSymbol: z.string().min(1), // Asset symbol (e.g., "BTC", "ETH")
    assetIndex: z.number().int().nonnegative(), // Asset index (numeric ID)
    orderId: z.string(),
  })),
  signature: z.string().optional(),
  nonce: z.string().optional(),
});

export const cancelByCloidBodySchema = z.object({
  cancels: z.array(z.object({
    assetSymbol: z.string().min(1), // Asset symbol (e.g., "BTC", "ETH")
    assetIndex: z.number().int().nonnegative(), // Asset index (numeric ID)
    cloid: z.string(),
  })),
  signature: z.string().optional(),
  nonce: z.string().optional(),
});

export type CancelOrderParams = z.infer<typeof cancelOrderParamsSchema>;
export type CancelOrderBody = z.infer<typeof cancelOrderBodySchema>;
export type CancelByCloidBody = z.infer<typeof cancelByCloidBodySchema>;

/**
 * Cancel orders
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/orders/cancel
 */
export const cancelOrderHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    
    const result = await hyperliquidService.cancelOrder(
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

/**
 * Cancel orders by client order ID
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/orders/cancel-by-cloid
 */
export const cancelOrderByCloidHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    
    const result = await hyperliquidService.cancelOrderByCloid(
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