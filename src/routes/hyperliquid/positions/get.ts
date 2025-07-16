import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schema for getting positions
 */
export const getPositionsQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'liquidated']).optional(),
  positionType: z.enum(['single', 'delta_neutral']).optional(),
});

export type GetPositionsQuery = z.infer<typeof getPositionsQuerySchema>;

/**
 * Get user's positions
 * GET /api/hyperliquid/positions
 */
export const getPositionsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { status, positionType } = req.query;
    
    const result = await hyperliquidService.getUserPositions(
      ctx,
      {
        status: status as string,
        positionType: positionType as string,
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