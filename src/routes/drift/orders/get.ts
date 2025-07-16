import { Request, Response, NextFunction } from 'express';
import { DriftService } from '@/services/drift';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const driftService = new DriftService();

/**
 * Validation schemas for getting orders
 */
export const getOrdersParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const getOrdersQuerySchema = z.object({
  marketIndex: z.string().transform(Number).optional(),
  marketType: z.enum(['PERP', 'SPOT']).optional(),
  status: z.enum(['pending', 'open', 'filled', 'cancelled', 'rejected', 'failed']).optional(),
});

export type GetOrdersParams = z.infer<typeof getOrdersParamsSchema>;
export type GetOrdersQuery = z.infer<typeof getOrdersQuerySchema>;

/**
 * Get orders
 * GET /api/drift/dex-accounts/:dexAccountId/orders
 */
export const getOrdersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    const { marketIndex, marketType, status } = req.query;
    
    const result = await driftService.getOrders(
      ctx,
      Number(dexAccountId),
      {
        marketIndex: marketIndex ? Number(marketIndex) : undefined,
        marketType: marketType as string,
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