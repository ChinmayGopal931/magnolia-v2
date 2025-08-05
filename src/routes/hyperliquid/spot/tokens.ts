import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse } from '@/types/common';

const hyperliquidService = new HyperliquidService();

/**
 * Get available spot tokens
 * GET /api/hyperliquid/spot/tokens
 */
export const getSpotTokensHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const metadata = await hyperliquidService.getSpotMetadata();
    
    // Extract and format token information
    const tokens = metadata.tokens?.map((token: any) => ({
      index: token.index,
      name: token.name,
      fullName: token.fullName,
      szDecimals: token.szDecimals,
      weiDecimals: token.weiDecimals,
      isCanonical: token.isCanonical,
      hasEvmContract: !!token.evmContract,
      evmAddress: token.evmContract?.address || null,
    })) || [];
    
    // Find which tokens are used in canonical pairs
    const canonicalPairs = metadata.universe?.filter((asset: any) => asset.isCanonical) || [];
    const tokensInCanonicalPairs = new Set<number>();
    
    canonicalPairs.forEach((pair: any) => {
      if (pair.tokens && Array.isArray(pair.tokens)) {
        pair.tokens.forEach((tokenIndex: number) => {
          tokensInCanonicalPairs.add(tokenIndex);
        });
      }
    });
    
    // Mark tokens that are actively traded
    const enrichedTokens = tokens.map((token: any) => ({
      ...token,
      isActivelyTraded: tokensInCanonicalPairs.has(token.index),
    }));
    
    const response: ApiResponse = {
      success: true,
      data: {
        totalTokens: tokens.length,
        canonicalTokens: tokens.filter((t: any) => t.isCanonical).length,
        activelyTradedTokens: tokensInCanonicalPairs.size,
        tokens: enrichedTokens.slice(0, 50), // Return first 50 tokens
      },
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};