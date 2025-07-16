import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schema for creating/updating DEX accounts
 */
export const createDexAccountSchema = z.object({
  action: z.enum(['create_and_approve', 'create_only']).optional(),
  masterAddress: z.string().optional(),
  agentName: z.string().optional(),
  agentAddress: z.string().optional(),
  agentPrivateKey: z.string().optional(),
  signature: z.union([
    z.string(),
    z.object({
      r: z.string(),
      s: z.string(),
      v: z.number()
    })
  ]).optional(),
  nonce: z.string().optional(),
  actionData: z.any().optional(),
  metadata: z.any().optional(),
});

export type CreateDexAccountRequest = z.infer<typeof createDexAccountSchema>;

/**
 * Create or update a DEX account (agent wallet)
 * POST /api/hyperliquid/dex-accounts
 */
export const createDexAccountHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    
    if (req.body.action === 'create_and_approve') {
      const result = await hyperliquidService.createAndApproveAgentWallet(
        ctx,
        {
          masterAddress: req.body.masterAddress!,
          agentName: req.body.agentName || 'Hyper-rektAgent',
          agentAddress: req.body.agentAddress,
          agentPrivateKey: req.body.agentPrivateKey,
          signature: req.body.signature!,
          nonce: req.body.nonce!,
          actionData: req.body.actionData,
        }
      );
      
      const response: ApiResponse = {
        success: true,
        data: result,
      };
      
      res.json(response);
    } else {
      const result = await hyperliquidService.createOrUpdateDexAccount(ctx, req.body);
      
      const response: ApiResponse = {
        success: true,
        data: result,
      };
      
      res.json(response);
    }
  } catch (error) {
    next(error);
  }
};