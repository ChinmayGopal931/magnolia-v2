import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schema for getting orders
 */
export const getOrdersParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const getOrdersQuerySchema = z.object({
  asset: z.string().optional(),
  status: z.enum(['pending', 'open', 'filled', 'cancelled', 'rejected', 'failed']).optional(),
});

export type GetOrdersParams = z.infer<typeof getOrdersParamsSchema>;
export type GetOrdersQuery = z.infer<typeof getOrdersQuerySchema>;

/**
 * Get open orders
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/orders
 */
export const getOrdersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    const { asset, status } = req.query;
    
    const result = await hyperliquidService.getOrders(
      ctx,
      Number(dexAccountId),
      {
        asset: asset as string,
        status: status as 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired' | undefined,
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