import { Router } from 'express';
import { authenticateUser } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { linkWalletHandler, linkWalletSchema } from './link-wallet';
import { getWalletsHandler } from './get-wallets';

const router = Router();

/**
 * GET /api/auth/wallets
 * Get all linked wallets for the authenticated user
 * Requires authentication
 */
router.get(
  '/wallets',
  authenticateUser,
  getWalletsHandler
);

/**
 * POST /api/auth/link-wallet
 * Link a new wallet to existing user account
 * Requires authentication
 */
router.post(
  '/link-wallet',
  authenticateUser,
  validateRequest({
    body: linkWalletSchema,
  }),
  linkWalletHandler
);

export default router;