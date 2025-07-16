import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';

const hyperliquidService = new HyperliquidService();

/**
 * Get user's DEX accounts
 * GET /api/hyperliquid/dex-accounts
 */
export const getDexAccountsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const result = await hyperliquidService.getUserDexAccounts(ctx);
    
    const response: ApiResponse = {
      success: true,
      data: result,
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};