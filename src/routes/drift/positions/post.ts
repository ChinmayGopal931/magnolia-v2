import { Request, Response, NextFunction } from 'express';
import { DriftService } from '@/services/drift';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';

const driftService = new DriftService();

/**
 * Validation schema for creating delta neutral position
 */
export const createDeltaNeutralPositionSchema = z.object({
  name: z.string().min(1).max(255),
  driftOrderId: z.number().int().positive(),
  hyperliquidOrderId: z.number().int().positive(),
  metadata: z.record(z.any()).optional(),
});

export type CreateDeltaNeutralPositionBody = z.infer<typeof createDeltaNeutralPositionSchema>;

/**
 * Create delta neutral position
 * POST /api/drift/positions/delta-neutral
 */
export const createDeltaNeutralPositionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    
    const result = await driftService.createDeltaNeutralPosition(
      ctx,
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