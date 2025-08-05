import { Request, Response, NextFunction } from 'express';
import { DriftService } from '@/services/drift';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const driftService = new DriftService();

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
    marketIndex: z.number().int().nonnegative(),
    marketType: z.enum(['PERP', 'SPOT']),
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
 * PATCH /api/drift/positions/:positionId
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
      // Handle position closing
      result = await driftService.closePositionWithMarketData(
        ctx,
        Number(positionId),
        {
          marketIndex: body.closeData.marketIndex,
          marketType: body.closeData.marketType,
          size: body.closeData.size,
          closedPnl: body.closeData.closedPnl,
        }
      );
    } else {
      // Handle general position update
      result = await driftService.updatePosition(
        ctx,
        Number(positionId),
        {
          status: body.status,
          totalPnl: body.totalPnl,
          closedPnl: body.status === 'closed' ? body.totalPnl : undefined,
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