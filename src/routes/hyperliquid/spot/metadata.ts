import { Request, Response, NextFunction } from 'express';
import { HyperliquidService } from '@/services/hyperliquid';
import { ApiResponse } from '@/types/common';

const hyperliquidService = new HyperliquidService();

/**
 * Get spot metadata including available trading pairs
 * GET /api/hyperliquid/spot/metadata
 */
export const getSpotMetadataHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const metadata = await hyperliquidService.getSpotMetadata();
    
    // Extract canonical pairs (actual tradeable pairs)
    const canonicalPairs = metadata.universe?.filter((asset: any) => asset.isCanonical) || [];
    
    // Extract token information
    const tokens = metadata.tokens?.map((token: any) => ({
      index: token.index,
      name: token.name,
      szDecimals: token.szDecimals,
      weiDecimals: token.weiDecimals,
      tokenId: token.tokenId,
      isCanonical: token.isCanonical,
      evmContract: token.evmContract,
      fullName: token.fullName,
    })) || [];
    
    // Format the response to be more user-friendly
    const formattedMetadata = {
      canonicalPairs: canonicalPairs.map((asset: any) => {
        const [baseTokenIndex, quoteTokenIndex] = asset.tokens;
        const baseToken = tokens.find((t: any) => t.index === baseTokenIndex);
        const quoteToken = tokens.find((t: any) => t.index === quoteTokenIndex);
        
        return {
          index: asset.index,
          assetId: 10000 + asset.index, // Spot assets use 10000 + index
          name: asset.name,
          baseToken: baseToken?.name || 'Unknown',
          quoteToken: quoteToken?.name || 'Unknown',
          isCanonical: asset.isCanonical,
        };
      }),
      totalPairs: metadata.universe?.length || 0,
      tokens: tokens.slice(0, 20), // Show first 20 tokens
      note: 'On testnet, only PURR/USDC is canonical (tradeable). Other pairs marked with @ are non-canonical.',
    };
    
    const response: ApiResponse = {
      success: true,
      data: formattedMetadata,
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};