import { DatabaseRepository } from '@/db/repository';
import { ApiError, ErrorCode, RequestContext } from '@/types/common';
import { logger } from '@/utils/logger';
import { driftClientConfig } from '@/services/drift-client';
import { dexConfig } from '@/config/dex.config';

export class DriftService {
  private db: DatabaseRepository;
  private config: ReturnType<typeof driftClientConfig.getConfig>;

  constructor() {
    this.db = new DatabaseRepository();
    this.config = driftClientConfig.getConfig();
    
    logger.info('DriftService initialized', {
      environment: dexConfig.getEnvironment(),
      programId: this.config.programId,
      env: this.config.env,
    });
  }

  /**
   * Create or update a DEX account (subaccount)
   */
  async createOrUpdateDexAccount(ctx: RequestContext, data: {
    address: string;
    accountType: 'master' | 'subaccount';
    subaccountId?: number;
    metadata?: any;
  }) {
    // Check if account already exists
    const existingAccount = await this.db.getDexAccountByAddress(data.address, 'drift');
    
    if (existingAccount) {
      // Update existing account
      return await this.db.updateDexAccount(existingAccount.id, {
        metadata: data.metadata,
      });
    }

    // Create new account
    return await this.db.createDexAccount({
      userId: ctx.userId!,
      dexType: 'drift',
      ...data,
    });
  }

  /**
   * Get user's Drift DEX accounts
   */
  async getUserDexAccounts(ctx: RequestContext) {
    return await this.db.getUserDexAccounts(ctx.userId!, 'drift');
  }

  /**
   * Update orders from frontend
   * Since Drift orders are placed on frontend, this endpoint updates our database
   */
  async updateOrders(
    ctx: RequestContext,
    dexAccountId: number,
    orders: Array<{
      driftOrderId?: string;
      clientOrderId?: string;
      marketIndex: number;
      marketType: 'PERP' | 'SPOT';
      direction: 'long' | 'short';
      baseAssetAmount: string;
      price?: string;
      filledAmount?: string;
      avgFillPrice?: string;
      status: 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired';
      orderType: string;
      reduceOnly?: boolean;
      postOnly?: boolean;
      immediateOrCancel?: boolean;
      maxTs?: string;
      triggerPrice?: string;
      triggerCondition?: 'above' | 'below';
      oraclePriceOffset?: string;
      auctionDuration?: number;
      auctionStartPrice?: string;
      auctionEndPrice?: string;
      rawParams?: any;
    }>
  ) {
    // Verify access
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    const createdOrders = [];

    for (const order of orders) {
      // Check if order already exists
      if (order.clientOrderId) {
        const existing = await this.db.getDriftOrders({
          dexAccountId,
          clientOrderId: order.clientOrderId,
        });

        if (existing.length > 0) {
          // Update existing order
          const updated = await this.db.updateDriftOrder(existing[0].id, {
            driftOrderId: order.driftOrderId,
            filledAmount: order.filledAmount,
            avgFillPrice: order.avgFillPrice,
            status: order.status as 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired',
            rawParams: order.rawParams,
          });
          createdOrders.push(updated);
          continue;
        }
      }

      // Create new order
      const created = await this.db.createDriftOrder({
        dexAccountId,
        userId: ctx.userId!,
        ...order,
        status: order.status as 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired' | undefined,
      });
      createdOrders.push(created);
    }

    return createdOrders;
  }

  /**
   * Get orders
   */
  async getOrders(
    ctx: RequestContext,
    dexAccountId: number,
    filters: {
      marketIndex?: number;
      marketType?: string;
      status?: 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired';
    }
  ) {
    // Verify access
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    return await this.db.getDriftOrders({
      dexAccountId,
      ...filters,
      status: filters.status as 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired' | undefined,
    });
  }

  /**
   * Create delta neutral position (Drift + Hyperliquid)
   */
  async createDeltaNeutralPosition(
    ctx: RequestContext,
    data: {
      name: string;
      driftOrderId: number;
      hyperliquidOrderId: number;
      metadata?: any;
    }
  ) {
    // Verify both orders belong to user
    const driftOrders = await this.db.getDriftOrders({
      userId: ctx.userId,
    });
    const driftOrder = driftOrders.find(o => o.id === data.driftOrderId);
    
    if (!driftOrder) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Drift order not found');
    }

    const hyperliquidOrders = await this.db.getHyperliquidOrders({
      userId: ctx.userId,
    });
    const hyperliquidOrder = hyperliquidOrders.find(o => o.id === data.hyperliquidOrderId);
    
    if (!hyperliquidOrder) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Hyperliquid order not found');
    }

    // Get DEX accounts for the orders
    const driftAccount = await this.db.getDexAccount(driftOrder.dexAccountId);
    const hlAccount = await this.db.getDexAccount(hyperliquidOrder.dexAccountId);

    if (!driftAccount || !hlAccount) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'DEX account not found');
    }

    // Create position with snapshots
    return await this.db.transaction(async (_tx) => {
      // Create position
      const position = await this.db.createPosition({
        userId: ctx.userId!,
        positionType: 'delta_neutral',
        name: data.name,
        metadata: data.metadata,
      });

      // Calculate notional values
      const driftNotional = parseFloat(driftOrder.baseAssetAmount) * parseFloat(driftOrder.price || '0');
      const hlNotional = parseFloat(hyperliquidOrder.size) * parseFloat(hyperliquidOrder.price || '0');

      // Create Drift snapshot
      await this.db.createPositionSnapshot({
        positionId: position.id,
        dexType: 'drift',
        dexAccountId: driftOrder.dexAccountId,
        symbol: `MARKET_${driftOrder.marketIndex}_${driftOrder.marketType}`, // e.g., "MARKET_0_PERP"
        side: driftOrder.direction as 'long' | 'short',
        entryPrice: driftOrder.price || '0',
        currentPrice: driftOrder.price || '0',
        size: driftOrder.baseAssetAmount,
        notionalValue: driftNotional.toString(),
        driftOrderId: data.driftOrderId,
        metadata: {
          marketIndex: driftOrder.marketIndex,
          marketType: driftOrder.marketType,
        },
      });

      // Create Hyperliquid snapshot
      await this.db.createPositionSnapshot({
        positionId: position.id,
        dexType: 'hyperliquid',
        dexAccountId: hyperliquidOrder.dexAccountId,
        symbol: hyperliquidOrder.asset,
        side: hyperliquidOrder.side === 'buy' ? 'long' : 'short',
        entryPrice: hyperliquidOrder.price || '0',
        currentPrice: hyperliquidOrder.price || '0',
        size: hyperliquidOrder.size,
        notionalValue: hlNotional.toString(),
        hyperliquidOrderId: data.hyperliquidOrderId,
      });

      return await this.db.getPositionWithSnapshots(position.id);
    });
  }

  /**
   * Record a deposit transaction
   * Note: The actual deposit happens on-chain via the frontend
   */
  async recordDeposit(
    ctx: RequestContext,
    dexAccountId: number,
    data: {
      marketIndex: number;
      amount: string;
      tokenSymbol: string;
      txSignature: string;
      tokenMint?: string;
    }
  ) {
    // Verify access to DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    logger.info('Recording Drift deposit', {
      userId: ctx.userId,
      dexAccountId,
      marketIndex: data.marketIndex,
      amount: data.amount,
      tokenSymbol: data.tokenSymbol,
      txSignature: data.txSignature,
    });

    // Create transaction record
    // Note: We're using position snapshots to track deposits/withdrawals
    // In production, you'd want a dedicated transactions table
    const snapshot = await this.db.createPositionSnapshot({
      positionId: 0, // Using 0 for non-position transactions
      dexType: 'drift',
      dexAccountId,
      symbol: data.tokenSymbol,
      side: 'long', // Deposits increase balance
      entryPrice: '1',
      currentPrice: '1',
      size: data.amount,
      notionalValue: data.amount,
      metadata: {
        type: 'deposit',
        txSignature: data.txSignature,
        marketIndex: data.marketIndex,
        tokenMint: data.tokenMint,
      },
    });

    return {
      success: true,
      transactionId: snapshot.id,
      txSignature: data.txSignature,
      amount: data.amount,
      tokenSymbol: data.tokenSymbol,
    };
  }

  /**
   * Record a withdrawal transaction
   * Note: The actual withdrawal happens on-chain via the frontend
   */
  async recordWithdrawal(
    ctx: RequestContext,
    dexAccountId: number,
    data: {
      marketIndex: number;
      amount: string;
      tokenSymbol: string;
      txSignature: string;
      destinationAddress: string;
    }
  ) {
    // Verify access to DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    logger.info('Recording Drift withdrawal', {
      userId: ctx.userId,
      dexAccountId,
      marketIndex: data.marketIndex,
      amount: data.amount,
      tokenSymbol: data.tokenSymbol,
      txSignature: data.txSignature,
    });

    // Create transaction record
    const snapshot = await this.db.createPositionSnapshot({
      positionId: 0, // Using 0 for non-position transactions
      dexType: 'drift',
      dexAccountId,
      symbol: data.tokenSymbol,
      side: 'short', // Withdrawals decrease balance
      entryPrice: '1',
      currentPrice: '1',
      size: data.amount,
      notionalValue: data.amount,
      metadata: {
        type: 'withdrawal',
        txSignature: data.txSignature,
        marketIndex: data.marketIndex,
        destinationAddress: data.destinationAddress,
      },
    });

    return {
      success: true,
      transactionId: snapshot.id,
      txSignature: data.txSignature,
      amount: data.amount,
      tokenSymbol: data.tokenSymbol,
    };
  }

  /**
   * Get deposit/withdrawal history
   */
  async getTransactionHistory(
    ctx: RequestContext,
    dexAccountId: number,
    filters?: {
      type?: 'deposit' | 'withdrawal';
      startDate?: string;
      endDate?: string;
      limit?: number;
    }
  ) {
    // Verify access
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    // Query snapshots with transaction metadata
    // In production, you'd have a dedicated query for this
    const allSnapshots = await this.db.getLatestPositionSnapshots(0);
    
    let transactions = allSnapshots.filter(snapshot => {
      if (snapshot.dexAccountId !== dexAccountId) return false;
      
      const metadata = snapshot.metadata as any;
      if (!metadata.type || (metadata.type !== 'deposit' && metadata.type !== 'withdrawal')) {
        return false;
      }
      
      if (filters?.type && metadata.type !== filters.type) {
        return false;
      }
      
      const snapshotDate = new Date(snapshot.snapshotAt);
      if (filters?.startDate && snapshotDate < new Date(filters.startDate)) {
        return false;
      }
      if (filters?.endDate && snapshotDate > new Date(filters.endDate)) {
        return false;
      }
      
      return true;
    });

    // Sort by date descending
    transactions.sort((a, b) => 
      new Date(b.snapshotAt).getTime() - new Date(a.snapshotAt).getTime()
    );

    // Apply limit
    if (filters?.limit) {
      transactions = transactions.slice(0, filters.limit);
    }

    return transactions.map(snapshot => {
      const metadata = snapshot.metadata as any;
      return {
        id: snapshot.id,
        type: metadata.type,
        tokenSymbol: snapshot.symbol,
        amount: snapshot.size,
        txSignature: metadata.txSignature,
        marketIndex: metadata.marketIndex,
        timestamp: snapshot.snapshotAt,
        destinationAddress: metadata.destinationAddress,
      };
    });
  }

  /**
   * Get Drift SDK configuration for frontend
   * This allows frontend to initialize Drift SDK with correct settings
   */
  getSDKConfiguration() {
    return {
      env: this.config.env,
      programId: this.config.programId,
      rpcUrl: this.config.rpcUrl,
      dataApiUrl: this.config.dataApiUrl,
    };
  }
}