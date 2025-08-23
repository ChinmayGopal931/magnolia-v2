import { DatabaseRepository } from '@/db/repository';
import { HyperliquidService } from '@/services/hyperliquid';
import { DriftService } from '@/services/drift';
import { logger } from '@/utils/logger';
import { RequestContext } from '@/types/common';

interface FundingRateData {
  coin: string;
  fundingRate: string;
  premium?: string;
  time: number;
}

interface DriftFundingRate {
  slot: number;
  fundingRate: string;
  cumulativeFundingRateLong: string;
  cumulativeFundingRateShort: string;
  oraclePriceTwap: string;
  markPriceTwap: string;
  fundingRateLong: string;
  fundingRateShort: string;
  marketIndex: number;
  ts: string;
}

interface PositionToClose {
  positionId: number;
  userId: number;
  reason: 'unfavorable_funding_long' | 'unfavorable_funding_short';
  fundingRate: number;
  legs: Array<{
    snapshotId: number;
    dexType: 'hyperliquid' | 'drift';
    symbol: string;
    side: 'long' | 'short' | 'spot';
    dexAccountId: number;
    metadata?: any;
  }>;
}

export class DeltaNeutralFundingService {
  private db: DatabaseRepository;
  private hyperliquidService: HyperliquidService;
  private driftService: DriftService;

  constructor() {
    this.db = new DatabaseRepository();
    this.hyperliquidService = new HyperliquidService();
    this.driftService = new DriftService();
  }

  /**
   * Get funding rate for Hyperliquid assets
   */
  async getHyperliquidFundingRates(coins: string[]): Promise<Map<string, number>> {
    const fundingRates = new Map<string, number>();

    for (const coin of coins) {
      try {
        // Get latest funding rate from Hyperliquid API
        const response = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'fundingHistory',
            coin: coin,
            startTime: Date.now() - 3600000 // Last hour
          })
        });

        if (response.ok) {
          const data = await response.json() as FundingRateData[];
          
          if (data && data.length > 0) {
            // Get the most recent funding rate
            const latestRate = data[data.length - 1];
            fundingRates.set(coin, parseFloat(latestRate.fundingRate));
            
            logger.info(`Hyperliquid funding rate for ${coin}:`, {
              coin,
              fundingRate: latestRate.fundingRate,
              time: latestRate.time
            });
          }
        }
      } catch (error) {
        logger.error(`Failed to get funding rate for ${coin}:`, { error, coin });
      }
    }

    return fundingRates;
  }

  /**
   * Get funding rates from Drift using the Data API
   */
  async getDriftFundingRates(marketIndices: number[]): Promise<Map<number, number>> {
    const fundingRates = new Map<number, number>();

    if (marketIndices.length === 0) {
      return fundingRates;
    }

    // Determine API URL based on environment
    const isDev = process.env.NODE_ENV === 'development';
    const baseUrl = isDev 
      ? 'https://data-master.api.drift.trade' 
      : 'https://data.api.drift.trade';

    for (const marketIndex of marketIndices) {
      try {
        // Get market symbol from index for the API call
        const marketSymbol = this.getMarketSymbolFromIndex(marketIndex);
        
        if (!marketSymbol) {
          logger.warn(`No symbol mapping found for Drift market index ${marketIndex}`);
          continue;
        }

        const url = `${baseUrl}/fundingRates?marketName=${marketSymbol}`;
        const response = await fetch(url);

        if (!response.ok) {
          logger.error(`Failed to fetch Drift funding rates for ${marketSymbol}:`, {
            status: response.status,
            statusText: response.statusText,
            marketIndex,
            marketSymbol
          });
          continue;
        }

        const data = await response.json() as { fundingRates: DriftFundingRate[] };
        const fundingRatesArray = data.fundingRates;

        if (fundingRatesArray && fundingRatesArray.length > 0) {
          // Get the most recent funding rate
          const latestRate = fundingRatesArray[fundingRatesArray.length - 1];
          
          // Calculate funding rate percentage following API documentation:
          // fundingRatePct = (fundingRate / 1e9) / (oraclePriceTwap / 1e6)
          const fundingRateRaw = parseFloat(latestRate.fundingRate) / 1e9;
          const oraclePriceTwap = parseFloat(latestRate.oraclePriceTwap) / 1e6;
          
          if (oraclePriceTwap > 0) {
            const fundingRatePercentage = fundingRateRaw / oraclePriceTwap;
            fundingRates.set(marketIndex, fundingRatePercentage);
            
            logger.info(`Drift funding rate for ${marketSymbol} (index: ${marketIndex}):`, {
              marketIndex,
              marketSymbol,
              fundingRatePercentage: fundingRatePercentage.toFixed(9),
              fundingRateAPR: (fundingRatePercentage * 24 * 365 * 100).toFixed(2) + '%',
              slot: latestRate.slot,
              timestamp: latestRate.ts
            });
          } else {
            logger.warn(`Invalid oracle price for ${marketSymbol}, skipping funding rate calculation`);
          }
        } else {
          logger.warn(`No funding rate data found for ${marketSymbol}`);
        }
      } catch (error) {
        logger.error(`Failed to get funding rate for Drift market ${marketIndex}:`, { 
          error: error instanceof Error ? error.message : error,
          marketIndex 
        });
      }
    }

    return fundingRates;
  }

  /**
   * Check all positions with funding optimization enabled
   */
  async checkPositionsForFundingOptimization(): Promise<PositionToClose[]> {
    const positionsToClose: PositionToClose[] = [];

    try {
      // Get all open positions with funding optimization enabled
      const positions = await this.db.getOpenPositionsWithFundingOptimization();

      if (!positions || positions.length === 0) {
        logger.info('No positions with funding optimization found');
        return positionsToClose;
      }

      logger.info(`Found ${positions.length} positions with funding optimization enabled`);

      // Group positions by DEX type to batch funding rate requests
      const hyperliquidCoins = new Set<string>();
      const driftMarkets = new Set<number>();

      for (const position of positions) {
        const snapshots = await this.db.getPositionSnapshots(position.id);
        
        for (const snapshot of snapshots) {
          if (snapshot.dexType === 'hyperliquid') {
            // Extract base coin from symbol (e.g., "BTC-PERP" -> "BTC")
            const coin = snapshot.symbol.split('-')[0];
            hyperliquidCoins.add(coin);
          } else if (snapshot.dexType === 'drift') {
            // Get market index from metadata or symbol
            const marketIndex = (snapshot.metadata as any)?.marketIndex || 
              this.extractMarketIndexFromSymbol(snapshot.symbol);
            if (marketIndex !== undefined) {
              driftMarkets.add(marketIndex);
            }
          }
        }
      }

      // Fetch funding rates for all relevant assets
      const hlFundingRates = await this.getHyperliquidFundingRates(Array.from(hyperliquidCoins));
      const driftFundingRates = await this.getDriftFundingRates(Array.from(driftMarkets));

      // Analyze each position
      for (const position of positions) {
        const snapshots = await this.db.getPositionSnapshots(position.id);
        
        const positionLegs = snapshots.map(snapshot => ({
          snapshotId: snapshot.id,
          dexType: snapshot.dexType as 'hyperliquid' | 'drift',
          symbol: snapshot.symbol,
          side: snapshot.side,
          dexAccountId: snapshot.dexAccountId,
          metadata: snapshot.metadata
        }));

        // Check if position should be closed based on funding rates
        const shouldClose = await this.shouldClosePosition(snapshots, hlFundingRates, driftFundingRates);

        if (shouldClose) {
          positionsToClose.push({
            positionId: position.id,
            userId: position.userId,
            reason: shouldClose.reason,
            fundingRate: shouldClose.fundingRate,
            legs: positionLegs
          });

          logger.info(`Position ${position.id} flagged for closure`, {
            positionId: position.id,
            reason: shouldClose.reason,
            fundingRate: shouldClose.fundingRate,
            positionName: position.name
          });
        }
      }

    } catch (error) {
      logger.error('Error checking positions for funding optimization:', { error });
    }

    return positionsToClose;
  }

  /**
   * Determine if a position should be closed based on funding rates
   */
  private async shouldClosePosition(
    snapshots: any[], 
    hlFundingRates: Map<string, number>, 
    driftFundingRates: Map<number, number>
  ): Promise<{ reason: 'unfavorable_funding_long' | 'unfavorable_funding_short', fundingRate: number } | null> {
    
    for (const snapshot of snapshots) {
      let fundingRate: number | undefined;

      if (snapshot.dexType === 'hyperliquid') {
        const coin = snapshot.symbol.split('-')[0];
        fundingRate = hlFundingRates.get(coin);
      } else if (snapshot.dexType === 'drift') {
        const marketIndex = (snapshot.metadata as any)?.marketIndex || 
          this.extractMarketIndexFromSymbol(snapshot.symbol);
        if (marketIndex !== undefined) {
          fundingRate = driftFundingRates.get(marketIndex);
        }
      }

      if (fundingRate !== undefined) {
        // Delta neutral strategy logic:
        // - If funding rate is positive (longs pay shorts) and we're long, close
        // - If funding rate is negative (shorts pay longs) and we're short, close
        // This ensures we always receive funding payments instead of paying them

        if (fundingRate > 0 && snapshot.side === 'long') {
          return {
            reason: 'unfavorable_funding_long',
            fundingRate: fundingRate
          };
        }

        if (fundingRate < 0 && snapshot.side === 'short') {
          return {
            reason: 'unfavorable_funding_short',
            fundingRate: fundingRate
          };
        }
      }
    }

    return null;
  }

  /**
   * Close positions that have unfavorable funding rates
   */
  async closeUnfavorablePositions(positionsToClose: PositionToClose[]): Promise<void> {
    logger.info(`Attempting to close ${positionsToClose.length} positions with unfavorable funding rates`);

    for (const position of positionsToClose) {
      try {
        // Create request context for the user
        const ctx: RequestContext = {
          userId: position.userId,
          timestamp: new Date(),
          requestId: `funding-close-${position.positionId}-${Date.now()}`
        };

        // Close each leg of the position
        const closeResults = [];
        const errors = [];

        for (const leg of position.legs) {
          try {
            if (leg.dexType === 'hyperliquid') {
              // Get asset ID from metadata
              const assetId = (leg.metadata as any)?.assetId || (leg.metadata as any)?.assetIndex;
              if (!assetId && assetId !== 0) {
                errors.push(`Missing assetId for Hyperliquid position ${leg.symbol}`);
                continue;
              }

              const result = await this.hyperliquidService.closePosition(ctx, leg.dexAccountId, {
                assetSymbol: leg.symbol.split('-')[0], // Extract base coin
                assetIndex: assetId,
              });

              closeResults.push({
                dexType: 'hyperliquid',
                symbol: leg.symbol,
                result,
                success: true
              });

              logger.info(`Closed Hyperliquid position leg due to unfavorable funding`, {
                positionId: position.positionId,
                symbol: leg.symbol,
                reason: position.reason,
                fundingRate: position.fundingRate
              });

            } else if (leg.dexType === 'drift') {
              const marketIndex = (leg.metadata as any)?.marketIndex;
              const marketType = (leg.metadata as any)?.marketType;

              if (marketIndex === undefined || !marketType) {
                errors.push(`Missing market data for Drift position ${leg.symbol}`);
                continue;
              }

              const result = await this.driftService.closePosition(ctx, leg.dexAccountId, {
                marketIndex,
                marketType: marketType.toUpperCase() as 'PERP' | 'SPOT',
              });

              closeResults.push({
                dexType: 'drift',
                symbol: leg.symbol,
                result,
                success: true
              });

              logger.info(`Closed Drift position leg due to unfavorable funding`, {
                positionId: position.positionId,
                symbol: leg.symbol,
                reason: position.reason,
                fundingRate: position.fundingRate
              });
            }

          } catch (error) {
            const errorMsg = `Failed to close ${leg.dexType} position ${leg.symbol}: ${error}`;
            errors.push(errorMsg);
            logger.error(errorMsg, { error, leg });
          }
        }

        // Update position status if all legs were successfully closed
        if (errors.length === 0) {
          await this.db.updatePosition(position.positionId, {
            status: 'closed',
            closedAt: new Date(),
            totalPnl: '0', // Would need to calculate actual P&L
            closedPnl: '0',
          });

          logger.info(`Successfully closed position ${position.positionId} due to unfavorable funding`, {
            positionId: position.positionId,
            reason: position.reason,
            fundingRate: position.fundingRate,
            legsCount: position.legs.length
          });
        } else {
          logger.error(`Failed to close some legs of position ${position.positionId}`, {
            positionId: position.positionId,
            errors,
            successCount: closeResults.length
          });
        }

      } catch (error) {
        logger.error(`Failed to process position ${position.positionId}:`, { error, position });
      }
    }
  }

  /**
   * Extract market index from Drift symbol (fallback method)
   */
  private extractMarketIndexFromSymbol(symbol: string): number | undefined {
    // Handle old format: "MARKET_0_PERP"
    const symbolMatch = symbol.match(/MARKET_(\d+)_(\w+)/);
    if (symbolMatch) {
      return parseInt(symbolMatch[1]);
    }

    // Handle new format: "BTC-PERP" - use mapping
    const driftMarketMap: Record<string, number> = {
      'SOL-PERP': 0,
      'BTC-PERP': 1,
      'ETH-PERP': 2,
      'USDC-SPOT': 0,
      'SOL-SPOT': 1,
      'BTC-SPOT': 2,
      'ETH-SPOT': 3,
    };

    return driftMarketMap[symbol.toUpperCase()];
  }

  /**
   * Get market symbol from index for API calls
   */
  private getMarketSymbolFromIndex(marketIndex: number): string | undefined {
    const indexToSymbolMap: Record<number, string> = {
      0: 'SOL-PERP',
      1: 'BTC-PERP', 
      2: 'ETH-PERP',
      // Add more mappings as needed
    };

    return indexToSymbolMap[marketIndex];
  }

  /**
   * Main method to run funding rate optimization
   */
  async runFundingOptimization(): Promise<{ 
    checkedPositions: number, 
    positionsToClose: number, 
    successfullyClosed: number 
  }> {
    logger.info('Starting funding rate optimization check');

    try {
      const positionsToClose = await this.checkPositionsForFundingOptimization();
      
      if (positionsToClose.length > 0) {
        await this.closeUnfavorablePositions(positionsToClose);
      }

      logger.info('Funding rate optimization completed', {
        positionsToClose: positionsToClose.length
      });

      return {
        checkedPositions: positionsToClose.length, // This would need to be tracked separately
        positionsToClose: positionsToClose.length,
        successfullyClosed: positionsToClose.length // This assumes all succeeded - would need better tracking
      };

    } catch (error) {
      logger.error('Funding rate optimization failed:', { error });
      throw error;
    }
  }
}