import { Request, Response, NextFunction } from 'express';
import { DriftService } from '@/services/drift';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';
import { logger } from '@/utils/logger';

const driftService = new DriftService();

/**
 * Validation schema for placing orders via backend
 */
export const placeDelegateOrderParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const placeDelegateOrderBodySchema = z.object({
  marketIndex: z.number().min(0),
  marketType: z.enum(['PERP', 'SPOT']),
  direction: z.enum(['long', 'short']),
  baseAssetAmount: z.string(),
  orderType: z.enum(['market', 'limit', 'trigger_market', 'trigger_limit', 'oracle']),
  price: z.string().optional(),
  reduceOnly: z.boolean().optional().default(false),
  postOnly: z.boolean().optional().default(false),
  immediateOrCancel: z.boolean().optional().default(false),
  maxTs: z.string().optional(),
  triggerPrice: z.string().optional(),
  triggerCondition: z.enum(['above', 'below']).optional(),
  oraclePriceOffset: z.string().optional(),
  auctionDuration: z.number().optional(),
  auctionStartPrice: z.string().optional(),
  auctionEndPrice: z.string().optional(),
  userOrderId: z.number().optional(),
});

export type PlaceDelegateOrderParams = z.infer<typeof placeDelegateOrderParamsSchema>;
export type PlaceDelegateOrderBody = z.infer<typeof placeDelegateOrderBodySchema>;

/**
 * Place order using backend wallet on behalf of user
 * POST /api/drift/dex-accounts/:dexAccountId/orders/place-delegate
 */
export const placeDelegateOrderHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    const orderParams = req.body;
    
    logger.info('Placing delegate order', {
      userId: ctx.userId,
      dexAccountId,
      marketIndex: orderParams.marketIndex,
      direction: orderParams.direction,
      size: orderParams.baseAssetAmount,
      orderType: orderParams.orderType,
    });
    
    // Place order using backend wallet
    const result = await driftService.placeDelegateOrder(
      ctx,
      Number(dexAccountId),
      orderParams
    );
    
    const response: ApiResponse = {
      success: true,
      data: result,
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to place delegate order', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    next(error);
  }
};