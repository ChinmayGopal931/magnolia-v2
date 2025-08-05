import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { DatabaseRepository } from '@/db/repository';
import { ApiResponse, RequestContext, ApiError, ErrorCode } from '@/types/common';
import { logger } from '@/utils/logger';

const db = new DatabaseRepository();

export const deletePositionParamsSchema = z.object({
  id: z.string().transform(Number),
});

export type DeletePositionParams = z.infer<typeof deletePositionParamsSchema>;

/**
 * Delete a position from the database without affecting exchange positions
 * This is useful for clearing trade history while keeping actual positions on exchanges
 */
export const deletePositionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { id: positionId } = req.params;
    
    logger.info('Deleting position from database', { 
      positionId, 
      userId: ctx.userId 
    });
    
    // Get position to verify ownership
    const position = await db.getPositionWithSnapshots(Number(positionId));
    
    if (!position) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Position not found', 404);
    }
    
    if (position.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'You do not have permission to delete this position', 403);
    }
    
    // Delete position and all related data
    // Note: position_snapshots will be deleted automatically due to CASCADE on foreign key
    await db.deletePosition(Number(positionId));
    
    logger.info('Position deleted successfully', {
      positionId,
      userId: ctx.userId,
      positionName: position.name,
      positionType: position.positionType,
      snapshotCount: position.snapshots.length
    });
    
    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Position deleted successfully',
        deletedPosition: {
          id: position.id,
          name: position.name,
          positionType: position.positionType,
          status: position.status,
          deletedAt: new Date().toISOString()
        }
      }
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};