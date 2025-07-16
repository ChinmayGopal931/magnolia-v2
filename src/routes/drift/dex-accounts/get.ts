import { Request, Response, NextFunction } from 'express';
import { DriftService } from '@/services/drift';
import { ApiResponse, RequestContext } from '@/types/common';

const driftService = new DriftService();

/**
 * Get user's Drift DEX accounts
 * GET /api/drift/dex-accounts
 */
export const getDexAccountsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const result = await driftService.getUserDexAccounts(ctx);
    
    const response: ApiResponse = {
      success: true,
      data: result,
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};