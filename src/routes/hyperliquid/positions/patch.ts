import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();

/**
 * Validation schemas for updating positions
 */
export const updatePositionParamsSchema = z.object({
  positionId: z.string().regex(/^\d+$/).transform(Number),
});

export const updatePositionBodySchema = z.object({
  action: z.enum(['close', 'update']).optional(),
  // For closing positions
  closeData: z.object({
    assetId: z.number().int().nonnegative(), // Required asset ID for closing
    size: z.string().regex(/^\d+(\.\d+)?$/).optional(), // Optional size to close
    closedPnl: z.string().regex(/^-?\d+(\.\d+)?$/), // Final P&L (can be negative)
  }).optional(),
  // For general updates
  status: z.enum(['open', 'closed', 'liquidated']).optional(),
  totalPnl: z.string().regex(/^-?\d+(\.\d+)?$/).optional(),
  metadata: z.record(z.any()).optional(),
}).refine(
  (data) => {
    // If action is 'close', closeData must be provided
    if (data.action === 'close' && !data.closeData) {
      return false;
    }
    return true;
  },
  {
    message: "closeData is required when action is 'close'",
    path: ['closeData'],
  }
);

export type UpdatePositionParams = z.infer<typeof updatePositionParamsSchema>;
export type UpdatePositionBody = z.infer<typeof updatePositionBodySchema>;

/**
 * Update position
 * PATCH /api/hyperliquid/positions/:positionId
 */
export const updatePositionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { positionId } = req.params;
    const body = req.body as UpdatePositionBody;
    
    let result;
    
    if (body.action === 'close' && body.closeData) {
      // Handle position closing with required asset ID
      result = await hyperliquidService.closePositionWithAssetId(
        ctx,
        Number(positionId),
        {
          assetId: body.closeData.assetId,
          size: body.closeData.size,
          closedPnl: body.closeData.closedPnl,
        }
      );
    } else {
      // Handle general position update
      result = await hyperliquidService.updatePosition(
        ctx,
        Number(positionId),
        {
          status: body.status,
          totalPnl: body.totalPnl,
          metadata: body.metadata,
        }
      );
    }
    
    const response: ApiResponse = {
      success: true,
      data: result,
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};