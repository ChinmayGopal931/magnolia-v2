import { Request, Response, NextFunction } from 'express';
import { DriftService } from '@/services/drift';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const driftService = new DriftService();

/**
 * Validation schemas for updating orders
 */
export const updateOrdersParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const updateOrdersBodySchema = z.object({
  orders: z.array(z.object({
    driftOrderId: z.string().optional(),
    clientOrderId: z.string().optional(),
    marketIndex: z.number(),
    marketType: z.enum(['PERP', 'SPOT']),
    direction: z.enum(['long', 'short']),
    baseAssetAmount: z.string(),
    price: z.string().optional(),
    filledAmount: z.string().optional(),
    avgFillPrice: z.string().optional(),
    status: z.enum(['pending', 'open', 'filled', 'cancelled', 'rejected', 'failed']),
    orderType: z.enum(['market', 'limit', 'trigger_market', 'trigger_limit', 'oracle']),
    reduceOnly: z.boolean().optional(),
    postOnly: z.boolean().optional(),
    immediateOrCancel: z.boolean().optional(),
    maxTs: z.string().optional(),
    triggerPrice: z.string().optional(),
    triggerCondition: z.enum(['above', 'below']).optional(),
    oraclePriceOffset: z.string().optional(),
    auctionDuration: z.number().optional(),
    auctionStartPrice: z.string().optional(),
    auctionEndPrice: z.string().optional(),
    rawParams: z.any().optional(),
  })),
});

export type UpdateOrdersParams = z.infer<typeof updateOrdersParamsSchema>;
export type UpdateOrdersBody = z.infer<typeof updateOrdersBodySchema>;

/**
 * Update orders from frontend
 * POST /api/drift/dex-accounts/:dexAccountId/orders
 */
export const updateOrdersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    
    const result = await driftService.updateOrders(
      ctx,
      Number(dexAccountId),
      req.body.orders
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