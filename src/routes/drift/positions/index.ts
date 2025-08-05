import { Router } from 'express';
import { validateRequest } from '@/middleware/validation';
import { createDeltaNeutralPositionHandler, createDeltaNeutralPositionSchema } from './post';
import { getPositionsHandler, getPositionsQuerySchema } from './get';
import { updatePositionHandler, updatePositionParamsSchema, updatePositionBodySchema } from './patch';

const router = Router();

/**
 * GET /api/drift/positions
 * Get user's Drift positions
 */
router.get(
  '/',
  validateRequest({ query: getPositionsQuerySchema }),
  getPositionsHandler
);

/**
 * POST /api/drift/positions/delta-neutral
 * Create delta neutral position
 */
router.post(
  '/delta-neutral',
  validateRequest({ body: createDeltaNeutralPositionSchema }),
  createDeltaNeutralPositionHandler
);

/**
 * PATCH /api/drift/positions/:positionId
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