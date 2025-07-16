import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schemas for updating positions
 */
export const updatePositionParamsSchema = z.object({
  positionId: z.string().transform(Number),
});

export const updatePositionBodySchema = z.object({
  status: z.enum(['open', 'closed', 'liquidated']).optional(),
  totalPnl: z.string().optional(),
  metadata: z.any().optional(),
});

export type UpdatePositionParams = z.infer<typeof updatePositionParamsSchema>;
export type UpdatePositionBody = z.infer<typeof updatePositionBodySchema>;

/**
 * Update position
 * PATCH /api/hyperliquid/positions/:positionId
 */
export const updatePositionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { positionId } = req.params;
    
    const result = await hyperliquidService.updatePosition(
      ctx,
      Number(positionId),
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