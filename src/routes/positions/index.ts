import { Router } from 'express';
import { authenticateUser } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { getPositionsHandler, getPositionsQuerySchema } from './get';
import { createPositionHandler, createPositionBodySchema } from './post';
import { createCustomOrderPositionHandler, createCustomOrderPositionBodySchema } from './custom-order';
import { closePositionHandler, closePositionParamsSchema, closePositionBodySchema } from './close';
import { deletePositionHandler, deletePositionParamsSchema } from './delete';

const router = Router();

/**
 * Apply authentication middleware to all position routes
 */
router.use(authenticateUser);

/**
 * GET /api/positions
 * Get all positions for the authenticated user
 */
router.get(
  '/',
  validateRequest({
    query: getPositionsQuerySchema,
  }),
  getPositionsHandler
);

/**
 * POST /api/positions
 * Create a new position with multiple legs
 */
router.post(
  '/',
  validateRequest({
    body: createPositionBodySchema,
  }),
  createPositionHandler
);

/**
 * POST /api/positions/custom-order
 * Create a new position from orders already executed on the frontend
 */
router.post(
  '/custom-order',
  validateRequest({
    body: createCustomOrderPositionBodySchema,
  }),
  createCustomOrderPositionHandler
);

/**
 * POST /api/positions/:id/close
 * Close a position and all its legs
 */
router.post(
  '/:id/close',
  validateRequest({
    params: closePositionParamsSchema,
    body: closePositionBodySchema,
  }),
  closePositionHandler
);

/**
 * DELETE /api/positions/:id
 * Delete a position from database without affecting exchange positions
 */
router.delete(
  '/:id',
  validateRequest({
    params: deletePositionParamsSchema,
  }),
  deletePositionHandler
);

export default router;