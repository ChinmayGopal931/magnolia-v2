import { Request, Response, NextFunction } from 'express';
import { ApiResponse, RequestContext } from '@/types/common';
import { logger } from '@/utils/logger';
import { runFundingOptimizationJob } from '@/jobs/funding-optimization-job';
import { getScheduler } from '@/jobs/scheduler';

/**
 * Manually trigger funding optimization job
 * POST /api/jobs/funding-optimization
 */
export const fundingOptimizationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    
    logger.info('Manual funding optimization job triggered', { userId: ctx.userId });
    
    const startTime = Date.now();
    
    // Run the funding optimization job
    await runFundingOptimizationJob();
    
    const executionTime = Date.now() - startTime;
    
    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Funding optimization job completed successfully',
        executionTime: `${executionTime}ms`,
        triggeredBy: ctx.userId,
        timestamp: new Date().toISOString(),
      },
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get job scheduler status
 * GET /api/jobs/status
 */
export const getJobStatusHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const scheduler = getScheduler();
    const status = scheduler.getStatus();
    
    const response: ApiResponse = {
      success: true,
      data: {
        scheduler: status,
        timestamp: new Date().toISOString(),
      },
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};