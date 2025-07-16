import { Router } from 'express';
import { validateRequest } from '@/middleware/validation';
import { getOrdersHandler, getOrdersParamsSchema, getOrdersQuerySchema } from './get';
import { placeOrderHandler, placeOrderParamsSchema, placeOrderBodySchema } from './post';
import { 
  cancelOrderHandler, 
  cancelOrderByCloidHandler,
  cancelOrderParamsSchema,
  cancelOrderBodySchema,
  cancelByCloidBodySchema 
} from './cancel';

const router = Router({ mergeParams: true });

/**
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/orders
 * Get open orders
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
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/orders
 * Place orders
 */
router.post(
  '/',
  validateRequest({
    params: placeOrderParamsSchema,
    body: placeOrderBodySchema,
  }),
  placeOrderHandler
);

/**
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/orders/cancel
 * Cancel orders
 */
router.post(
  '/cancel',
  validateRequest({
    params: cancelOrderParamsSchema,
    body: cancelOrderBodySchema,
  }),
  cancelOrderHandler
);

/**
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/orders/cancel-by-cloid
 * Cancel orders by client order ID
 */
router.post(
  '/cancel-by-cloid',
  validateRequest({
    params: cancelOrderParamsSchema,
    body: cancelByCloidBodySchema,
  }),
  cancelOrderByCloidHandler
);

export default router;