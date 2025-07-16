import { Router } from 'express';
import { validateRequest } from '@/middleware/validation';
import { recordDepositHandler, recordDepositParamsSchema, recordDepositBodySchema } from './deposits';
import { recordWithdrawalHandler, recordWithdrawalParamsSchema, recordWithdrawalBodySchema } from './withdrawals';
import { getTransactionHistoryHandler, getTransactionHistoryParamsSchema, getTransactionHistoryQuerySchema } from './history';

const router = Router({ mergeParams: true });

/**
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/deposits
 * Record deposit transaction
 */
router.post(
  '/deposits',
  validateRequest({
    params: recordDepositParamsSchema,
    body: recordDepositBodySchema,
  }),
  recordDepositHandler
);

/**
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/withdrawals
 * Record withdrawal transaction
 */
router.post(
  '/withdrawals',
  validateRequest({
    params: recordWithdrawalParamsSchema,
    body: recordWithdrawalBodySchema,
  }),
  recordWithdrawalHandler
);

/**
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/transactions
 * Get transaction history (deposits and withdrawals)
 */
router.get(
  '/',
  validateRequest({
    params: getTransactionHistoryParamsSchema,
    query: getTransactionHistoryQuerySchema,
  }),
  getTransactionHistoryHandler
);

export default router;