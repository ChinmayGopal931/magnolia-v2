import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse, RequestContext } from '@/types/common';
import { DatabaseRepository } from '@/db/repository';
import { z } from 'zod';

const hyperliquidService = new HyperliquidService();
const db = new DatabaseRepository();

/**
 * Validation schemas
 */
export const getTradingInfoParamsSchema = z.object({
  dexAccountId: z.string().transform(Number),
});

export const getTradingInfoQuerySchema = z.object({
  asset: z.string(),
});

/**
 * Get trading info (active asset data) for a specific asset
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/trading-info?asset=BTC
 */
export const getTradingInfoHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    const { asset } = req.query;
    
    // Verify access to dex account
    const dexAccount = await db.getDexAccount(Number(dexAccountId));
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      res.status(403).json({
        success: false,
        error: 'Access denied to this account'
      });
      return;
    }
    
    // Get active asset data
    const activeAssetData = await hyperliquidService.getActiveAssetData(
      dexAccount.address,
      asset as string
    );
    
    // Get current position if any
    const axios = (await import('axios')).default;
    const apiUrl = process.env.NETWORK_ENV === 'mainnet' 
      ? 'https://api.hyperliquid.xyz' 
      : 'https://api.hyperliquid-testnet.xyz';
    
    // Use master address for positions (agent wallets trade on behalf of master wallets)
    const masterAddress = (dexAccount as any).metadata?.masterAddress || dexAccount.address;
    
    const clearinghouseState = await axios.post(`${apiUrl}/info`, {
      type: 'clearinghouseState',
      user: masterAddress
    });
    
    const positions = clearinghouseState.data;
    const position = positions.assetPositions?.find((p: any) => {
      return p.position?.coin === asset;
    });
    
    const response: ApiResponse = {
      success: true,
      data: {
        activeAssetData,
        currentPosition: position?.position || null,
        hasPosition: !!position && position.position?.szi !== '0'
      },
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
  return;
};

/**
 * Get all positions and margin summary
 * GET /api/hyperliquid/dex-accounts/:dexAccountId/positions
 */
export const getPositionsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    
    // Verify access to dex account
    const dexAccount = await db.getDexAccount(Number(dexAccountId));
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      res.status(403).json({
        success: false,
        error: 'Access denied to this account'
      });
      return;
    }
    
    // Get clearinghouse state (positions and margin)
    // const clearinghouseResponse = await hyperliquidService.getOpenOrdersFromAPI(dexAccount.address);
    // Use the info client directly
    const axios = (await import('axios')).default;
    const apiUrl = process.env.NETWORK_ENV === 'mainnet' 
      ? 'https://api.hyperliquid.xyz' 
      : 'https://api.hyperliquid-testnet.xyz';
    
    // Use master address for positions (agent wallets trade on behalf of master wallets)
    const masterAddress = (dexAccount as any).metadata?.masterAddress || dexAccount.address;
    
    const clearinghouseState = await axios.post(`${apiUrl}/info`, {
      type: 'clearinghouseState',
      user: masterAddress
    });
    
    const response: ApiResponse = {
      success: true,
      data: clearinghouseState.data,
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};