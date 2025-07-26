import { Router } from 'express';
import { validateRequest } from '@/middleware/validation';
import { placeSpotOrderHandler, placeSpotOrderParamsSchema, placeSpotOrderBodySchema } from './place-order';
import { getSpotBalancesHandler, getSpotBalancesParamsSchema } from './balances';
import { getSpotOrdersHandler, getSpotOrdersParamsSchema, getSpotOrdersQuerySchema } from './orders';
import { getSpotMetadataHandler } from './metadata';
import { getSpotTokensHandler } from './tokens';

const router = Router({ mergeParams: true });

/**
 * Place spot orders
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/spot/orders
 */
router.post(
  '/orders',
  validateRequest({
    params: placeSpotOrderParamsSchema,
    body: placeSpotOrderBodySchema,
  }),
  placeSpotOrderHandler
);

/**
 * Get spot orders
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/spot/orders
 */
router.get(
  '/orders',
  validateRequest({
    params: getSpotOrdersParamsSchema,
    query: getSpotOrdersQuerySchema,
  }),
  getSpotOrdersHandler
);

/**
 * Get spot balances
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/spot/balances
 */
router.get(
  '/balances',
  validateRequest({
    params: getSpotBalancesParamsSchema,
  }),
  getSpotBalancesHandler
);

/**
 * Get spot metadata (available trading pairs)
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/spot/metadata
 */
router.get(
  '/metadata',
  getSpotMetadataHandler
);

/**
 * Get available spot tokens
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/spot/tokens
 */
router.get(
  '/tokens',
  getSpotTokensHandler
);

export default router;