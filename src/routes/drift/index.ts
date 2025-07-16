import { Router } from 'express';
import { authenticateUser } from '@/middleware/auth';
import { rateLimiter } from '@/middleware/rateLimiter';

// Import sub-routers
import dexAccountsRouter from './dex-accounts';
import ordersRouter from './orders';
import positionsRouter from './positions';
import transactionsRouter from './transactions';

const router = Router();

/**
 * Apply middleware to all Drift routes
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

// Transactions routes (handles deposits, withdrawals, and history)
router.use('/dex-accounts/:dexAccountId', transactionsRouter);

// Positions routes
router.use('/positions', positionsRouter);

export default router;