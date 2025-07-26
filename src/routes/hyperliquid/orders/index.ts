import { Router, Request, Response, NextFunction } from 'express';
import { validateRequest } from '@/middleware/validation';
import { authenticateUser } from '@/middleware/auth';
import { HyperliquidService } from '@/services/hyperliquid';
import { RequestContext } from '@/types/common';
import { getOrdersHandler, getOrdersParamsSchema, getOrdersQuerySchema } from './get';
import { placeOrderHandler, placeOrderParamsSchema, placeOrderBodySchema } from './post';
import { 
  cancelOrderHandler, 
  cancelOrderByCloidHandler,
  cancelOrderParamsSchema,
  cancelOrderBodySchema,
  cancelByCloidBodySchema 
} from './cancel';
import {
  closePositionHandler,
  closePositionParamsSchema,
  closePositionBodySchema
} from './close-position';

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

/**
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/orders/close-position
 * Close a position with a market order
 */
router.post(
  '/close-position',
  validateRequest({
    params: closePositionParamsSchema,
    body: closePositionBodySchema,
  }),
  closePositionHandler
);

/**
 * POST /api/hyperliquid/dex-accounts/:dexAccountId/orders/test-sdk
 * Test placing orders using the SDK
 */
router.post(
  '/test-sdk',
  authenticateUser,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const hyperliquidService = new HyperliquidService();
      const { dexAccountId } = req.params;
      const orderData = req.body;
      const ctx = req.context as RequestContext;

      const result = await hyperliquidService.placeOrderWithSDK(
        ctx,
        parseInt(dexAccountId),
        orderData
      );

      res.json({
        success: true,
        data: result,
        message: 'Order placed using SDK'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;