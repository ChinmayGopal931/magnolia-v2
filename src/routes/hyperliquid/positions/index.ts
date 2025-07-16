import { Router } from 'express';
import { validateRequest } from '@/middleware/validation';
import { getPositionsHandler, getPositionsQuerySchema } from './get';
import { createPositionHandler, createPositionBodySchema } from './post';
import { updatePositionHandler, updatePositionParamsSchema, updatePositionBodySchema } from './patch';

const router = Router();

/**
 * GET /api/hyperliquid/positions
 * Get user's positions
 */
router.get(
  '/',
  validateRequest({ query: getPositionsQuerySchema }),
  getPositionsHandler
);

/**
 * POST /api/hyperliquid/positions
 * Create a new position
 */
router.post(
  '/',
  validateRequest({ body: createPositionBodySchema }),
  createPositionHandler
);

/**
 * PATCH /api/hyperliquid/positions/:positionId
 * Update position
 */
router.patch(
  '/:positionId',
  validateRequest({
    params: updatePositionParamsSchema,
    body: updatePositionBodySchema,
  }),
  updatePositionHandler
);

export default router;