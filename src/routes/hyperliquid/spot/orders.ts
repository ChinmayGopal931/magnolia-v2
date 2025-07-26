import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schemas for getting spot orders
 */
export const getSpotOrdersParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const getSpotOrdersQuerySchema = z.object({
  asset: z.string().optional(), // e.g., "PURR/USDC"
  status: z.enum(['open', 'filled', 'cancelled']).optional(),
  includeApiOrders: z.boolean().optional(),
});

export type GetSpotOrdersParams = z.infer<typeof getSpotOrdersParamsSchema>;
export type GetSpotOrdersQuery = z.infer<typeof getSpotOrdersQuerySchema>;

/**
 * Get spot orders
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/spot/orders
 */
export const getSpotOrdersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    const query = req.query as GetSpotOrdersQuery;
    
    // Transform spot asset pair to base asset
    let asset = query.asset;
    if (asset && asset.includes('/')) {
      [asset] = asset.split('/');
    }
    
    // Get spot orders
    const orders = await hyperliquidService.getSpotOrders(
      ctx,
      Number(dexAccountId),
      {
        ...query,
        asset,
      }
    );
    
    const response: ApiResponse = {
      success: true,
      data: orders,
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};