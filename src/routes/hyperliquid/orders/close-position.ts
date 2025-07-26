import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schemas for closing positions
 */
export const closePositionParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const closePositionBodySchema = z.object({
  asset: z.string(),
  size: z.string().optional(), // Optional: if not provided, will close the entire position
});

export type ClosePositionParams = z.infer<typeof closePositionParamsSchema>;
export type ClosePositionBody = z.infer<typeof closePositionBodySchema>;

/**
 * Close a position
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/orders/close-position
 */
export const closePositionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    
    const result = await hyperliquidService.closePosition(
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