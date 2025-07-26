import { Router } from 'express';
import { validateRequest } from '@/middleware/validation';
import { getOrdersHandler, getOrdersParamsSchema, getOrdersQuerySchema } from './get';
import { updateOrdersHandler, updateOrdersParamsSchema, updateOrdersBodySchema } from './post';
import { 
  placeDelegateOrderHandler, 
  placeDelegateOrderParamsSchema, 
  placeDelegateOrderBodySchema 
} from './place-delegate';

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

/**
 * POST /api/drift/dex-accounts/:dexAccountId/orders/place-delegate
 * Place orders using backend wallet on behalf of user
 */
router.post(
  '/place-delegate',
  validateRequest({
    params: placeDelegateOrderParamsSchema,
    body: placeDelegateOrderBodySchema,
  }),
  placeDelegateOrderHandler
);

export default router;