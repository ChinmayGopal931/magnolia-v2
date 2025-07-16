import { Request, Response, NextFunction } from 'express';
import { DriftService } from '@/services/drift';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const driftService = new DriftService();

/**
 * Validation schemas for getting transaction history
 */
export const getTransactionHistoryParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const getTransactionHistoryQuerySchema = z.object({
  type: z.enum(['deposit', 'withdrawal']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.string().transform(Number).optional(),
});

export type GetTransactionHistoryParams = z.infer<typeof getTransactionHistoryParamsSchema>;
export type GetTransactionHistoryQuery = z.infer<typeof getTransactionHistoryQuerySchema>;

/**
 * Get transaction history (deposits and withdrawals)
 * GET /api/drift/dex-accounts/:dexAccountId/transactions
 */
export const getTransactionHistoryHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    const { type, startDate, endDate, limit } = req.query;
    
    const result = await driftService.getTransactionHistory(
      ctx,
      Number(dexAccountId),
      {
        type: type as 'deposit' | 'withdrawal' | undefined,
        startDate: startDate as string,
        endDate: endDate as string,
        limit: limit ? Number(limit) : undefined,
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