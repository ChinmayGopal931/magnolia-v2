import { Request, Response, NextFunction } from 'express';
import { DriftService } from '@/services/drift';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const driftService = new DriftService();

/**
 * Validation schema for creating/updating DEX accounts
 */
export const createDexAccountSchema = z.object({
  address: z.string(),
  accountType: z.enum(['master', 'subaccount']),
  subaccountId: z.number().optional(),
  metadata: z.any().optional(),
});

export type CreateDexAccountRequest = z.infer<typeof createDexAccountSchema>;

/**
 * Create or update a DEX account (subaccount)
 * POST /api/drift/dex-accounts
 */
export const createDexAccountHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const result = await driftService.createOrUpdateDexAccount(ctx, req.body);
    
    const response: ApiResponse = {
      success: true,
      data: result,
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};