import { Router } from 'express';
import { validateRequest } from '@/middleware/validation';
import { getOrdersHandler, getOrdersParamsSchema, getOrdersQuerySchema } from './get';
import { updateOrdersHandler, updateOrdersParamsSchema, updateOrdersBodySchema } from './post';

const router = Router({ mergeParams: true });

/**
 * GET /api/drift/dex-accounts/:dexAccountId/orders
 * Get orders
 */
router.get(
  '/',
  validateRequest({
    params: getOrdersParamsSchema,
    query: getOrdersQuerySchema,
  }),
  getOrdersHandler
);

/**
 * POST /api/drift/dex-accounts/:dexAccountId/orders
 * Update orders from frontend
 */
router.post(
  '/',
  validateRequest({
    params: updateOrdersParamsSchema,
    body: updateOrdersBodySchema,
  }),
  updateOrdersHandler
);

export default router;