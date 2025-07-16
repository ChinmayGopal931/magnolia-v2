import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schemas for getting fills
 */
export const getFillsParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const getFillsQuerySchema = z.object({
  limit: z.string().transform(Number).optional(),
  startDate: z.string().transform((val) => new Date(val)).optional(),
  endDate: z.string().transform((val) => new Date(val)).optional(),
  asset: z.string().optional(),
});

export type GetFillsParams = z.infer<typeof getFillsParamsSchema>;
export type GetFillsQuery = z.infer<typeof getFillsQuerySchema>;

/**
 * Get order fills/trades
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/fills
 */
export const getFillsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    const { limit, startDate, endDate, asset } = req.query;
    
    const result = await hyperliquidService.getFills(
      ctx,
      Number(dexAccountId),
      {
        limit: limit ? Number(limit) : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        asset: asset as string,
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