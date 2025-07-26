import { Router } from 'express';
import { authenticateUser } from '@/middleware/auth';
import { rateLimiter } from '@/middleware/rateLimiter';
import { validateRequest } from '@/middleware/validation';

// Import sub-routers
import dexAccountsRouter from './dex-accounts';
import ordersRouter from './orders';
import positionsRouter from './positions';
import fillsRouter from './fills';
import transactionsRouter from './transactions';
import spotRouter from './spot';
import {
  getTradingInfoHandler,
  getTradingInfoParamsSchema,
  getTradingInfoQuerySchema,
  getPositionsHandler
} from './trading-info';

const router = Router();

/**
 * Apply middleware to all Hyperliquid routes
 */
router.use(authenticateUser);
router.use(rateLimiter);

/**
 * Mount sub-routers
 */
// DEX Accounts routes
router.use('/dex-accounts', dexAccountsRouter);

// Orders routes (nested under dex-accounts)
router.use('/dex-accounts/:dexAccountId/orders', ordersRouter);

// Fills routes (nested under dex-accounts)
router.use('/dex-accounts/:dexAccountId/fills', fillsRouter);

// Transactions routes (handles deposits, withdrawals, and history)
router.use('/dex-accounts/:dexAccountId', transactionsRouter);

// Positions routes
router.use('/positions', positionsRouter);

// Trading info routes
router.get(
  '/dex-accounts/:dexAccountId/trading-info',
  validateRequest({
    params: getTradingInfoParamsSchema,
    query: getTradingInfoQuerySchema,
  }),
  getTradingInfoHandler
);

// Get positions directly from Hyperliquid API
router.get(
  '/dex-accounts/:dexAccountId/clearinghouse-state',
  validateRequest({
    params: getTradingInfoParamsSchema,
  }),
  getPositionsHandler
);

// Spot trading routes (nested under dex-accounts)
router.use('/dex-accounts/:dexAccountId/spot', spotRouter);

export default router;