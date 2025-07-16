import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schema for creating positions
 */
export const createPositionBodySchema = z.object({
  name: z.string(),
  positionType: z.enum(['single', 'delta_neutral']),
  snapshots: z.array(z.object({
    orderId: z.number(),
    symbol: z.string(),
    side: z.enum(['long', 'short']),
    entryPrice: z.string(),
    size: z.string(),
  })),
  metadata: z.any().optional(),
});

export type CreatePositionBody = z.infer<typeof createPositionBodySchema>;

/**
 * Create a new position
 * POST /api/hyperliquid/positions
 */
export const createPositionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    
    const result = await hyperliquidService.createPosition(
      ctx,
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