import { Router } from 'express';
import { validateRequest } from '@/middleware/validation';
import { getFillsHandler, getFillsParamsSchema, getFillsQuerySchema } from './get';

const router = Router({ mergeParams: true });

/**
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/fills
 * Get order fills/trades
 */
router.get(
  '/',
  validateRequest({
    params: getFillsParamsSchema,
    query: getFillsQuerySchema,
  }),
  getFillsHandler
);

export default router;