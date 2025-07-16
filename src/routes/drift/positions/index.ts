import { Router } from 'express';
import { validateRequest } from '@/middleware/validation';
import { createDeltaNeutralPositionHandler, createDeltaNeutralPositionSchema } from './post';

const router = Router();

/**
 * POST /api/drift/positions/delta-neutral
 * Create delta neutral position
 */
router.post(
  '/delta-neutral',
  validateRequest({ body: createDeltaNeutralPositionSchema }),
  createDeltaNeutralPositionHandler
);

export default router;