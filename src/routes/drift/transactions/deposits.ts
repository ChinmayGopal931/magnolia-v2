import { Request, Response, NextFunction } from 'express';
import { DriftService } from '@/services/drift';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const driftService = new DriftService();

/**
 * Validation schemas for recording deposits
 */
export const recordDepositParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const recordDepositBodySchema = z.object({
  marketIndex: z.number(),
  amount: z.string(),
  tokenSymbol: z.string(),
  txSignature: z.string(),
  tokenMint: z.string().optional(),
});

export type RecordDepositParams = z.infer<typeof recordDepositParamsSchema>;
export type RecordDepositBody = z.infer<typeof recordDepositBodySchema>;

/**
 * Record deposit transaction
 * POST /api/drift/dex-accounts/:dexAccountId/deposits
 */
export const recordDepositHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    
    const result = await driftService.recordDeposit(
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