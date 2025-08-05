import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schema for creating positions
 */
export const createPositionBodySchema = z.object({
  name: z.string().min(1).max(255),
  positionType: z.enum(['single', 'delta_neutral']),
  snapshots: z.array(z.object({
    orderId: z.number().int().positive(),
    assetId: z.number().int().nonnegative(), // Required asset ID
    symbol: z.string().min(1), // Still required for display/tracking
    side: z.enum(['long', 'short', 'spot']), // Added 'spot' option
    entryPrice: z.string().regex(/^\d+(\.\d+)?$/), // Validate numeric string
    size: z.string().regex(/^\d+(\.\d+)?$/), // Validate numeric string
    liquidationPrice: z.string().regex(/^\d+(\.\d+)?$/).optional(), // Optional liquidation price
  })).min(1), // At least one snapshot required
  metadata: z.record(z.any()).optional(), // More specific than z.any()
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