import { Router, Request, Response } from 'express';
import { dexConfig } from '@/config/dex.config';
import { driftClientConfig } from '@/services/drift-client';
import { ApiResponse } from '@/types/common';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const router = Router();

/**
 * Get the backend delegate wallet address
 */
function getDelegateAddress(): string | null {
  const privateKeyString = process.env.MAGNOLIA_SOLANA_PRIVATE_KEY;
  if (!privateKeyString) {
    return null;
  }
  
  try {
    const privateKeyBytes = bs58.decode(privateKeyString);
    const keypair = Keypair.fromSecretKey(privateKeyBytes);
    return keypair.publicKey.toString();
  } catch (error) {
    console.error('Failed to derive delegate address:', error);
    return null;
  }
}

/**
 * Get current network environment and DEX configurations
 * GET /api/config
 */
router.get('/', async (_req: Request, res: Response) => {
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
        delegateAddress: getDelegateAddress(),
      },
    },
  };
  
  res.json(response);
});

/**
 * Get Drift SDK configuration
 * GET /api/config/drift-sdk
 */
router.get('/drift-sdk', async (_req: Request, res: Response) => {
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
router.get('/hyperliquid', async (_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: dexConfig.getHyperliquidConfig(),
  };
  
  res.json(response);
});

export default router;