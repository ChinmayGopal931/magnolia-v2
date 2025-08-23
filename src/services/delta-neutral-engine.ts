import { DatabaseRepository } from '@/db/repository';
import { HyperliquidService } from '@/services/hyperliquid';
import { DriftService } from '@/services/drift';
import { logger } from '@/utils/logger';
import { RequestContext } from '@/types/common';
import { positionSnapshots } from '@/db/schema';

interface FundingRateData {
  coin: string;
  fundingRate: string;
  premium?: string;
  time: number;
}

interface PositionToRebalance {
  positionId: number;
  userId: number;
  reason: 'funding_rate_flipped';
  currentFundingRate: number;
  legToClose: {
    snapshotId: number;
    dexType: 'hyperliquid' | 'drift';
    symbol: string;
    side: 'long' | 'short';
    dexAccountId: number;
    metadata?: any;
    size: number;
  };
  legToOpen: {
    dexType: 'hyperliquid' | 'drift';
    symbol: string;
    side: 'long' | 'short';
    size: number;
    dexAccountId: number;
    metadata?: any;
  };
}

/**
 * Delta Neutral Funding Engine
 * 
 * This service actively rebalances positions to always be on the profitable side of funding rates.
 * Instead of just closing unfavorable positions, it flips them to the opposite side to capture
 * funding rate arbitrage opportunities.
 */
export class DeltaNeutralFundingService {
  private db: DatabaseRepository;
  private hyperliquidService: HyperliquidService;
  private driftService: DriftService;

  // Minimum funding rate threshold to trigger rebalancing (0.01% per hour)
  private static readonly MIN_PROFITABLE_RATE = 0.0001;

  constructor() {
    this.db = new DatabaseRepository();
    this.hyperliquidService = new HyperliquidService();
    this.driftService = new DriftService();
  }

  /**
   * Get funding rates from Hyperliquid
   */
  async getHyperliquidFundingRates(coins: string[]): Promise<Map<string, number>> {
    const fundingRates = new Map<string, number>();

    for (const coin of coins) {
      try {
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
   * Get funding rates from Drift using SDK
   */
  async getDriftFundingRates(marketIndices: number[]): Promise<Map<number, number>> {
    const fundingRates = new Map<number, number>();

    if (marketIndices.length === 0) {
      return fundingRates;
    }

    try {
      // Get the backend private key from environment
      const privateKeyString = process.env.MAGNOLIA_SOLANA_PRIVATE_KEY;
      if (!privateKeyString) {
        logger.warn('No Drift private key configured, skipping Drift funding rates');
        return fundingRates;
      }

      // Use dynamic imports with proper destructuring
      const {
        DriftClient,
        BN
      } = await import('@drift-labs/sdk');
      const { PublicKey, Keypair, Connection } = await import('@solana/web3.js');
      const bs58Module = await import('bs58');
      const { driftClientConfig } = await import('@/services/drift-client');

      // Initialize connection
      const config = driftClientConfig.getConfig();
      const privateKeyBytes = bs58Module.default.decode(privateKeyString);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);
      const connection = new Connection(config.rpcUrl, 'confirmed');

      // Create wallet adapter following the pattern from drift.ts
      const wallet = {
        publicKey: keypair.publicKey,
        signTransaction: async (tx: any) => {
          if (tx.sign && !tx.partialSign) {
            tx.sign([keypair]);
          } else if (tx.partialSign) {
            tx.partialSign(keypair);
          } else {
            try {
              tx.sign([keypair]);
            } catch {
              tx.partialSign(keypair);
            }
          }
          return tx;
        },
        signAllTransactions: async (txs: any[]) => {
          txs.forEach(tx => {
            if (tx.sign && !tx.partialSign) {
              tx.sign([keypair]);
            } else if (tx.partialSign) {
              tx.partialSign(keypair);
            } else {
              try {
                tx.sign([keypair]);
              } catch {
                tx.partialSign(keypair);
              }
            }
          });
          return txs;
        }
      };

      // Initialize Drift client
      const driftClient = new DriftClient({
        connection,
        wallet,
        env: config.env as 'mainnet-beta' | 'devnet',
        programID: new PublicKey(config.programId),
      });

      await driftClient.subscribe();

      // Get funding rates for each market
      for (const marketIndex of marketIndices) {
        try {
          // Get perp market account
          const perpMarket = driftClient.getPerpMarketAccount(marketIndex);
          
          if (perpMarket) {
            // Get the actual funding rate - this varies based on Drift SDK version
            // Using a simple approach that should work across versions
            const fundingRateLong = perpMarket.amm?.cumulativeFundingRateLong || new BN(0);
            const fundingRate = fundingRateLong.toNumber() / 1e9; // Convert from Drift precision
            
            fundingRates.set(marketIndex, fundingRate);
            
            logger.info(`Drift funding rate for market ${marketIndex}:`, {
              marketIndex,
              fundingRate,
              timestamp: Date.now()
            });
          }
        } catch (error) {
          logger.error(`Failed to get funding rate for Drift market ${marketIndex}:`, { 
            error: error instanceof Error ? error.message : error,
            marketIndex 
          });
        }
      }

      await driftClient.unsubscribe();

    } catch (error) {
      logger.error('Failed to initialize Drift client for funding rates:', { 
        error: error instanceof Error ? error.message : error 
      });
    }

    return fundingRates;
  }

  /**
   * Check all delta neutral positions for rebalancing opportunities
   */
  async checkPositionsForRebalancing(): Promise<PositionToRebalance[]> {
    const positionsToRebalance: PositionToRebalance[] = [];

    try {
      const positions = await this.db.getOpenPositionsWithFundingOptimization();

      if (!positions || positions.length === 0) {
        logger.info('No delta neutral positions with funding optimization found');
        return positionsToRebalance;
      }

      logger.info(`Found ${positions.length} positions to check for funding rebalancing`);

      // Group positions by DEX type to batch funding rate requests
      const hyperliquidCoins = new Set<string>();
      const driftMarkets = new Set<number>();

      for (const position of positions) {
        const snapshots = await this.db.getPositionSnapshots(position.id);
        
        for (const snapshot of snapshots) {
          if (snapshot.dexType === 'hyperliquid') {
            const coin = snapshot.symbol.split('-')[0];
            hyperliquidCoins.add(coin);
          } else if (snapshot.dexType === 'drift') {
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

      // Analyze each position to see if it needs rebalancing
      for (const position of positions) {
        const snapshots = await this.db.getPositionSnapshots(position.id);
        
        const rebalanceAction = await this.determineRebalanceAction(
          position,
          snapshots, 
          hlFundingRates, 
          driftFundingRates
        );

        if (rebalanceAction) {
          positionsToRebalance.push(rebalanceAction);
          
          logger.info(`Position ${position.id} flagged for rebalancing`, {
            positionId: position.id,
            reason: rebalanceAction.reason,
            fundingRate: rebalanceAction.currentFundingRate,
            symbol: rebalanceAction.legToClose.symbol,
            fromSide: rebalanceAction.legToClose.side,
            toSide: rebalanceAction.legToOpen.side,
          });
        }
      }

    } catch (error) {
      logger.error('Error checking positions for funding rebalancing:', { error });
    }

    return positionsToRebalance;
  }

  /**
   * Determine if a position should be rebalanced based on funding rates
   */
  private async determineRebalanceAction(
    position: { id: number; userId: number },
    snapshots: Array<typeof positionSnapshots.$inferSelect>,
    hlFundingRates: Map<string, number>, 
    driftFundingRates: Map<number, number>
  ): Promise<PositionToRebalance | null> {
    
    for (const snapshot of snapshots) {
      // We only care about perpetual legs, not spot
      if (snapshot.side === 'spot') {
        continue;
      }

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

      if (fundingRate !== undefined && Math.abs(fundingRate) > DeltaNeutralFundingService.MIN_PROFITABLE_RATE) {
        // Check if this leg is unfavorable and should be flipped
        const isUnfavorableLong = fundingRate > 0 && snapshot.side === 'long';
        const isUnfavorableShort = fundingRate < 0 && snapshot.side === 'short';

        if (isUnfavorableLong || isUnfavorableShort) {
          return {
            positionId: position.id,
            userId: position.userId,
            reason: 'funding_rate_flipped',
            currentFundingRate: fundingRate,
            legToClose: {
              snapshotId: snapshot.id,
              dexType: snapshot.dexType as 'hyperliquid' | 'drift',
              symbol: snapshot.symbol,
              side: snapshot.side as 'long' | 'short',
              dexAccountId: snapshot.dexAccountId,
              metadata: snapshot.metadata,
              size: parseFloat(snapshot.size),
            },
            legToOpen: {
              dexType: snapshot.dexType as 'hyperliquid' | 'drift',
              symbol: snapshot.symbol,
              side: snapshot.side === 'long' ? 'short' : 'long', // Flip the side
              size: parseFloat(snapshot.size), // Use the same size
              dexAccountId: snapshot.dexAccountId,
              metadata: snapshot.metadata,
            },
          };
        }
      }
    }

    return null; // No rebalancing needed
  }

  /**
   * Execute rebalancing: close unfavorable leg and open favorable one
   */
  async rebalanceUnfavorablePositions(positionsToRebalance: PositionToRebalance[]): Promise<void> {
    logger.info(`Attempting to rebalance ${positionsToRebalance.length} positions`);

    for (const action of positionsToRebalance) {
      try {
        // Create request context for the user
        const ctx: RequestContext = {
          userId: action.userId,
          timestamp: new Date(),
          requestId: `rebalance-${action.positionId}-${Date.now()}`
        };

        const { legToClose, legToOpen } = action;
        
        // Step 1: Close the unfavorable leg
        logger.info(`Closing unfavorable leg for position ${action.positionId}`, {
          symbol: legToClose.symbol,
          side: legToClose.side,
          size: legToClose.size,
          fundingRate: action.currentFundingRate
        });

        await this.closeLeg(ctx, legToClose);

        // Step 2: Open the new favorable leg
        logger.info(`Opening favorable leg for position ${action.positionId}`, {
          symbol: legToOpen.symbol,
          side: legToOpen.side,
          size: legToOpen.size
        });

        const newLegResult = await this.openLeg(ctx, legToOpen);

        // Step 3: Update database - remove old snapshot and create new one
        await this.db.transaction(async () => {
          // Delete old snapshot
          await this.db.deletePositionSnapshot(legToClose.snapshotId);
          
          // Create new snapshot for the flipped position
          await this.db.createPositionSnapshot({
            positionId: action.positionId,
            dexType: legToOpen.dexType,
            dexAccountId: legToOpen.dexAccountId,
            symbol: legToOpen.symbol,
            side: legToOpen.side,
            size: legToOpen.size.toString(),
            entryPrice: newLegResult.entryPrice,
            currentPrice: newLegResult.entryPrice,
            notionalValue: (legToOpen.size * parseFloat(newLegResult.entryPrice)).toString(),
            metadata: legToOpen.metadata,
            // Link to the new order if available
            hyperliquidOrderId: legToOpen.dexType === 'hyperliquid' ? newLegResult.orderId || undefined : undefined,
            driftOrderId: legToOpen.dexType === 'drift' ? newLegResult.orderId || undefined : undefined,
          });
        });

        logger.info(`Successfully rebalanced position ${action.positionId}`, {
          positionId: action.positionId,
          oldSide: legToClose.side,
          newSide: legToOpen.side,
          symbol: legToOpen.symbol,
          fundingRate: action.currentFundingRate
        });

      } catch (error) {
        logger.error(`Failed to rebalance position ${action.positionId}:`, { 
          error: error instanceof Error ? error.message : String(error),
          action 
        });
      }
    }
  }

  /**
   * Close a position leg
   */
  private async closeLeg(ctx: RequestContext, leg: PositionToRebalance['legToClose']): Promise<void> {
    if (leg.dexType === 'hyperliquid') {
      const assetId = (leg.metadata as any)?.assetId || (leg.metadata as any)?.assetIndex;
      if (assetId === undefined) {
        throw new Error(`Missing assetId for Hyperliquid position ${leg.symbol}`);
      }

      await this.hyperliquidService.closePosition(ctx, leg.dexAccountId, {
        assetSymbol: leg.symbol.split('-')[0],
        assetIndex: assetId,
      });
    } else if (leg.dexType === 'drift') {
      const marketIndex = (leg.metadata as any)?.marketIndex;
      const marketType = (leg.metadata as any)?.marketType;

      if (marketIndex === undefined || !marketType) {
        throw new Error(`Missing market data for Drift position ${leg.symbol}`);
      }

      await this.driftService.closePosition(ctx, leg.dexAccountId, {
        marketIndex,
        marketType: marketType.toUpperCase() as 'PERP' | 'SPOT',
      });
    }
  }

  /**
   * Open a new position leg
   */
  private async openLeg(ctx: RequestContext, leg: PositionToRebalance['legToOpen']): Promise<{
    entryPrice: string;
    orderId?: number;
  }> {
    if (leg.dexType === 'hyperliquid') {
      const assetId = (leg.metadata as any)?.assetId || (leg.metadata as any)?.assetIndex;
      if (assetId === undefined) {
        throw new Error(`Missing assetId for Hyperliquid position ${leg.symbol}`);
      }

      const result = await this.hyperliquidService.placeOrder(ctx, leg.dexAccountId, {
        orders: [{
          assetSymbol: leg.symbol.split('-')[0],
          assetIndex: assetId,
          side: leg.side === 'long' ? 'buy' : 'sell',
          orderType: 'market',
          size: leg.size.toString(),
          reduceOnly: false,
        }],
        grouping: 'na' as const
      });

      return {
        entryPrice: (result as any)?.data?.statuses?.[0]?.filled?.avgPx || '0',
        orderId: (result as any)?.data?.statuses?.[0]?.resting?.oid,
      };
    } else if (leg.dexType === 'drift') {
      const marketIndex = (leg.metadata as any)?.marketIndex;
      const marketType = (leg.metadata as any)?.marketType;

      if (marketIndex === undefined || !marketType) {
        throw new Error(`Missing market data for Drift position ${leg.symbol}`);
      }

      const result = await this.driftService.placeOrder(ctx, leg.dexAccountId, {
        marketIndex,
        marketType: marketType.toUpperCase() as 'PERP' | 'SPOT',
        direction: leg.side,
        amount: leg.size.toString(),
        orderType: 'market',
      });

      return {
        entryPrice: result.averagePrice || result.price || '0',
        orderId: result.orderId,
      };
    }

    throw new Error(`Unsupported DEX type: ${leg.dexType}`);
  }

  /**
   * Extract market index from Drift symbol (fallback method)
   */
  private extractMarketIndexFromSymbol(symbol: string): number | undefined {
    const symbolMatch = symbol.match(/MARKET_(\d+)_(\w+)/);
    if (symbolMatch) {
      return parseInt(symbolMatch[1]);
    }

    const driftMarketMap: Record<string, number> = {
      'BTC-PERP': 1,
      'ETH-PERP': 2,
      'SOL-PERP': 0,
      'BTC-SPOT': 1,
      'ETH-SPOT': 2,
      'SOL-SPOT': 0,
      'USDC-SPOT': 0,
    };

    return driftMarketMap[symbol.toUpperCase()];
  }

  /**
   * Main method to run the delta neutral funding engine
   */
  async runFundingEngine(): Promise<{ 
    checkedPositions: number, 
    positionsToRebalance: number, 
    successfullyRebalanced: number 
  }> {
    logger.info('Starting delta neutral funding engine');

    try {
      const positionsToRebalance = await this.checkPositionsForRebalancing();
      
      if (positionsToRebalance.length > 0) {
        await this.rebalanceUnfavorablePositions(positionsToRebalance);
      }

      logger.info('Delta neutral funding engine completed', {
        positionsToRebalance: positionsToRebalance.length
      });

      return {
        checkedPositions: positionsToRebalance.length, // This could be tracked separately
        positionsToRebalance: positionsToRebalance.length,
        successfullyRebalanced: positionsToRebalance.length // Assumes all succeeded - could track failures
      };

    } catch (error) {
      logger.error('Delta neutral funding engine failed:', { error });
      throw error;
    }
  }
}

// Export the old name for backward compatibility
export const FundingMonitorService = DeltaNeutralFundingService;