import { Router } from 'express';
import { authenticateUser } from '@/middleware/auth';
import { fundingOptimizationHandler, getJobStatusHandler } from './funding-optimization';

const router = Router();

/**
 * Apply authentication middleware to all job routes
 */
router.use(authenticateUser);

/**
 * POST /api/jobs/funding-optimization
 * Manually trigger funding optimization job
 */
router.post('/funding-optimization', fundingOptimizationHandler);

/**
 * GET /api/jobs/status
 * Get job scheduler status
 */
router.get('/status', getJobStatusHandler);

export default router;