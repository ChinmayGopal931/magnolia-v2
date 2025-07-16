import { Router } from 'express';
import { validateRequest } from '@/middleware/validation';
import { getDexAccountsHandler } from './get';
import { createDexAccountHandler, createDexAccountSchema } from './post';

const router = Router();

/**
 * GET /api/hyperliquid/dex-accounts
 * Get user's DEX accounts
 */
router.get('/', getDexAccountsHandler);

/**
 * POST /api/hyperliquid/dex-accounts
 * Create or update a DEX account (agent wallet)
 */
router.post(
  '/',
  validateRequest({ body: createDexAccountSchema }),
  createDexAccountHandler
);

export default router;