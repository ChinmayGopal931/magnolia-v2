import { Router, Request, Response } from 'express';
import { dexConfig } from '@/config/dex.config';
import { driftClientConfig } from '@/services/drift-client';
import { ApiResponse } from '@/types/common';

const router = Router();

/**
 * Get current network environment and DEX configurations
 * GET /api/config
 */
router.get('/', async (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: {
      environment: dexConfig.getEnvironment(),
      isTestnet: dexConfig.isTestnet(),
      hyperliquid: {
        apiUrl: dexConfig.getHyperliquidConfig().apiUrl,
        webAppUrl: dexConfig.getHyperliquidConfig().webAppUrl,
        chain: dexConfig.getHyperliquidConfig().chain,
      },
      drift: {
        programId: driftClientConfig.getProgramId(),
        rpcUrl: driftClientConfig.getRpcUrl(),
        dataApiUrl: driftClientConfig.getDataApiUrl(),
        env: driftClientConfig.getEnv(),
        webAppUrl: dexConfig.getDriftConfig().webAppUrl,
      },
    },
  };
  
  res.json(response);
});

/**
 * Get Drift SDK configuration
 * GET /api/config/drift-sdk
 */
router.get('/drift-sdk', async (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: driftClientConfig.getSDKConfig(),
  };
  
  res.json(response);
});

/**
 * Get Hyperliquid configuration
 * GET /api/config/hyperliquid
 */
router.get('/hyperliquid', async (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: dexConfig.getHyperliquidConfig(),
  };
  
  res.json(response);
});

export default router;