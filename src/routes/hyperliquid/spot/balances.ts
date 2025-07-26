import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext, ApiError, ErrorCode } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schemas for getting spot balances
 */
export const getSpotBalancesParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export type GetSpotBalancesParams = z.infer<typeof getSpotBalancesParamsSchema>;

/**
 * Get spot balances
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/spot/balances
 */
export const getSpotBalancesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    
    // Get spot balances from Hyperliquid
    const balances = await hyperliquidService.getSpotBalances(
      ctx,
      Number(dexAccountId)
    );
    
    const response: ApiResponse = {
      success: true,
      data: balances,
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};