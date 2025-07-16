import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schemas for recording deposits
 */
export const recordDepositParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const recordDepositBodySchema = z.object({
  amount: z.string(),
  tokenSymbol: z.string(),
  txHash: z.string(),
  fromAddress: z.string(),
});

export type RecordDepositParams = z.infer<typeof recordDepositParamsSchema>;
export type RecordDepositBody = z.infer<typeof recordDepositBodySchema>;

/**
 * Record deposit transaction
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/deposits
 */
export const recordDepositHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    
    const result = await hyperliquidService.recordDeposit(
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