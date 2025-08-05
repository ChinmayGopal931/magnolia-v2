import { Request, Response, NextFunction } from 'express';
import { DatabaseRepository } from '@/db/repository';
import { ApiResponse, RequestContext } from '@/types/common';
import { z } from 'zod';
import { logger } from '@/utils/logger';

const db = new DatabaseRepository();

/**
 * Validation schema for getting positions
 */
export const getPositionsQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'liquidated']).optional(),
  page: z.string().transform(Number).optional(),
  pageSize: z.string().transform(Number).optional(),
});

export type GetPositionsQuery = z.infer<typeof getPositionsQuerySchema>;

/**
 * Get user's positions across all platforms
 * GET /api/positions
 */
export const getPositionsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { status, page = 1, pageSize = 20 } = req.query;
    
    logger.info('Fetching positions', {
      userId: ctx.userId,
      status,
      page,
      pageSize
    });
    
    // Get positions from database
    const positions = await db.getUserPositions(ctx.userId!, {
      status: status as string,
    });
    
    // Fetch detailed snapshots for each position
    const positionsWithDetails = await Promise.all(
      positions.map(async (position) => {
        const snapshots = await db.getPositionSnapshots(position.id);
        
        const legs = snapshots.map(snapshot => {
          return {
            id: snapshot.id,
            dex: snapshot.dexType,
            symbol: snapshot.symbol,
            side: snapshot.side,
            entryPrice: snapshot.entryPrice,
            currentPrice: snapshot.currentPrice,
            markPrice: snapshot.markPrice,
            liquidationPrice: snapshot.liquidationPrice,
            size: snapshot.size,
            notionalValue: snapshot.notionalValue,
          };
        });
        
        return {
          id: position.id,
          name: position.name,
          positionType: position.positionType,
          status: position.status,
          totalPnl: position.totalPnl,
          closedPnl: position.closedPnl,
          legs,
          metadata: position.metadata,
          createdAt: position.createdAt,
          closedAt: position.closedAt,
          updatedAt: position.updatedAt,
        };
      })
    );
    
    // Apply pagination
    const startIndex = (Number(page) - 1) * Number(pageSize);
    const endIndex = startIndex + Number(pageSize);
    const paginatedPositions = positionsWithDetails.slice(startIndex, endIndex);
    
    const response: ApiResponse = {
      success: true,
      data: {
        positions: paginatedPositions,
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          total: positionsWithDetails.length,
          totalPages: Math.ceil(positionsWithDetails.length / Number(pageSize)),
        },
      },
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};