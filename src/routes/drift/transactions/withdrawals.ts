import { Request, Response, NextFunction } from 'express';
import { DriftService } from '@/services/drift';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const driftService = new DriftService();

/**
 * Validation schemas for recording withdrawals
 */
export const recordWithdrawalParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const recordWithdrawalBodySchema = z.object({
  marketIndex: z.number(),
  amount: z.string(),
  tokenSymbol: z.string(),
  txSignature: z.string(),
  destinationAddress: z.string(),
});

export type RecordWithdrawalParams = z.infer<typeof recordWithdrawalParamsSchema>;
export type RecordWithdrawalBody = z.infer<typeof recordWithdrawalBodySchema>;

/**
 * Record withdrawal transaction
 * POST /api/drift/dex-accounts/:dexAccountId/withdrawals
 */
export const recordWithdrawalHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    
    const result = await driftService.recordWithdrawal(
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