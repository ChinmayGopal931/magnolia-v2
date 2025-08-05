import { Request, Response, NextFunction } from 'express';
import { DatabaseRepository } from '@/db/repository';
import { ApiResponse, RequestContext } from '@/types/common';

const db = new DatabaseRepository();

/**
 * Get all linked wallets for the authenticated user
 * GET /api/auth/wallets
 */
export const getWalletsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    
    const wallets = await db.getUserWallets(ctx.userId!);
    
    const response: ApiResponse = {
      success: true,
      data: {
        wallets: wallets.map(w => ({
          id: w.id,
          address: w.walletAddress,
          type: w.walletType,
          isPrimary: w.isPrimary,
          linkedAt: w.linkedAt,
        })),
      },
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};