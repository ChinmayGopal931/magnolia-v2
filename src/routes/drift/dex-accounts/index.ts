import { Router } from 'express';
import { validateRequest } from '@/middleware/validation';
import { getDexAccountsHandler } from './get';
import { createDexAccountHandler, createDexAccountSchema } from './post';

const router = Router();

/**
 * GET /api/drift/dex-accounts
 * Get user's Drift DEX accounts
 */
router.get('/', getDexAccountsHandler);

/**
 * POST /api/drift/dex-accounts
 * Create or update a DEX account (subaccount)
 */
router.post(
  '/',
  validateRequest({ body: createDexAccountSchema }),
  createDexAccountHandler
);

export default router;