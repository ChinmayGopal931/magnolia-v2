import { DatabaseRepository } from '@/db/repository';
import { ApiError, ErrorCode, RequestContext } from '@/types/common';
import { logger } from '@/utils/logger';
import { driftClientConfig } from '@/services/drift-client';
import { 
  DriftClient, 
  BN, 
  PositionDirection, 
  OrderType, 
  MarketType,
  PostOnlyParams,
  OrderTriggerCondition,
  PRICE_PRECISION
} from '@drift-labs/sdk';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import bs58 from 'bs58';

export class DriftService {
  private db: DatabaseRepository;
  private config: ReturnType<typeof driftClientConfig.getConfig>;

  constructor() {
    this.db = new DatabaseRepository();
    this.config = driftClientConfig.getConfig();
  
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
      // If metadata is provided, update the account
      if (data.metadata !== undefined) {
        return await this.db.updateDexAccount(existingAccount.id, {
          metadata: data.metadata,
        });
      }
      // Otherwise, just return the existing account
      return existingAccount;
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
        liquidationPrice: undefined, // Can be calculated based on leverage
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
        symbol: hyperliquidOrder.assetSymbol,
        side: hyperliquidOrder.side === 'buy' ? 'long' : 'short',
        entryPrice: hyperliquidOrder.price || '0',
        currentPrice: hyperliquidOrder.price || '0',
        liquidationPrice: undefined, // Can be calculated based on leverage
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
      side: 'spot', // Deposits are spot transactions
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
      side: 'spot', // Withdrawals are spot transactions
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
   * Get user's Drift positions
   */
  async getUserDriftPositions(
    ctx: RequestContext,
    filters?: { status?: string; positionType?: string }
  ) {
    // Get all positions for the user
    const allPositions = await this.db.getUserPositions(ctx.userId!, filters);
    
    // Filter to only include positions that have Drift snapshots
    const driftPositions = [];
    for (const position of allPositions) {
      const positionWithSnapshots = await this.db.getPositionWithSnapshots(position.id);
      if (positionWithSnapshots && positionWithSnapshots.snapshots.some(s => s.dexType === 'drift')) {
        driftPositions.push(positionWithSnapshots);
      }
    }
    
    return driftPositions;
  }

  /**
   * Update position
   */
  async updatePosition(
    ctx: RequestContext,
    positionId: number,
    data: {
      status?: 'open' | 'closed' | 'liquidated';
      totalPnl?: string;
      closedPnl?: string;
      metadata?: any;
    }
  ) {
    // Verify ownership
    const position = await this.db.getPositionWithSnapshots(positionId);
    if (!position || position.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this position');
    }

    // Verify position has Drift snapshots
    const hasDriftSnapshot = position.snapshots.some(s => s.dexType === 'drift');
    if (!hasDriftSnapshot) {
      throw new ApiError(ErrorCode.INVALID_REQUEST, 'Not a Drift position');
    }

    // Update position
    const updated = await this.db.updatePosition(positionId, {
      ...data,
      closedAt: data.status === 'closed' || data.status === 'liquidated' ? new Date() : undefined,
    });

    return await this.db.getPositionWithSnapshots(updated.id);
  }

  /**
   * Close a position with market order
   */
  async closePositionWithMarketData(
    ctx: RequestContext,
    positionId: number,
    data: {
      marketIndex: number;
      marketType: 'PERP' | 'SPOT';
      size?: string;
      closedPnl: string;
    }
  ): Promise<any> {
    // Get position details
    const position = await this.db.getPositionWithSnapshots(positionId);
    if (!position || position.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Position not found');
    }

    if (position.status !== 'open') {
      throw new ApiError(ErrorCode.INVALID_REQUEST, 'Position is not open');
    }

    // Get the relevant Drift snapshot
    const relevantSnapshot = position.snapshots.find(
      (s) => s.dexType === 'drift' && s.driftOrderId && s.order
    );

    if (!relevantSnapshot) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'No Drift order found for this position');
    }

    // Update position status
    const updatedPosition = await this.db.updatePosition(positionId, {
      status: 'closed',
      closedPnl: data.closedPnl,
      closedAt: new Date(),
    });

    return {
      position: updatedPosition,
      message: 'Position closed successfully. Please close the position on Drift manually.',
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

  /**
   * Close a position on Drift using delegate trading
   * Places a reduce-only order to close the position
   */
  async closePosition(
    ctx: RequestContext,
    dexAccountId: number,
    data: {
      marketIndex: number;
      marketType: 'PERP' | 'SPOT';
      size?: string; // Optional: if not provided, will close the entire position
    }
  ): Promise<any> {
    // Get DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    // Get the backend private key from environment
    const privateKeyString = process.env.MAGNOLIA_SOLANA_PRIVATE_KEY;
    if (!privateKeyString) {
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Backend wallet not configured for delegate trading');
    }

    try {
      // Initialize DriftClient with backend wallet
      const privateKeyBytes = bs58.decode(privateKeyString);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);
      
      // Create connection from RPC URL
      const connection = new Connection(this.config.rpcUrl, 'confirmed');
      
      // Create wallet adapter
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

      // Initialize DriftClient for delegate trading
      const driftClient = new DriftClient({
        connection,
        wallet,
        env: this.config.env as 'mainnet-beta' | 'devnet',
        programID: new PublicKey(this.config.programId),
        authority: new PublicKey(dexAccount.address), // User's authority
        activeSubAccountId: dexAccount.subaccountId || 0,
        includeDelegates: false,
        authoritySubAccountMap: new Map([
          [dexAccount.address, [dexAccount.subaccountId || 0]]
        ]),
      });

      await driftClient.subscribe();

      logger.info('Initialized DriftClient for closing position', {
        authority: dexAccount.address,
        subAccountId: dexAccount.subaccountId,
        marketType: data.marketType,
        marketIndex: data.marketIndex,
      });

      // Get the user account to check current position
      const user = driftClient.getUser();
      
      // Get the position based on market type
      let positionSize: BN | undefined;
      let baseAssetAmount: BN;
      let direction: PositionDirection;
      
      if (data.marketType === 'PERP') {
        const perpPosition = user.getPerpPosition(data.marketIndex);
        
        if (!perpPosition || perpPosition.baseAssetAmount.eq(new BN(0))) {
          await driftClient.unsubscribe();
          throw new ApiError(
            ErrorCode.INVALID_REQUEST,
            `No open position found for PERP market ${data.marketIndex}`
          );
        }
        
        positionSize = perpPosition.baseAssetAmount;
        
        // Determine closing direction (opposite of position)
        const isLong = positionSize.gt(new BN(0));
        direction = isLong ? PositionDirection.SHORT : PositionDirection.LONG;
        
        // Use provided size or close entire position
        if (data.size) {
          baseAssetAmount = new BN(parseFloat(data.size) * 1e9); // Convert to BASE_PRECISION
        } else {
          baseAssetAmount = positionSize.abs(); // Close entire position
        }
        
        logger.info('Closing PERP position', {
          marketIndex: data.marketIndex,
          currentPositionSize: positionSize.toString(),
          closingSize: baseAssetAmount.toString(),
          closingDirection: direction === PositionDirection.LONG ? 'LONG' : 'SHORT',
          isFullClose: !data.size
        });
        
      } else {
        // SPOT market
        const spotPosition = user.getSpotPosition(data.marketIndex);
        
        if (!spotPosition || spotPosition.scaledBalance.eq(new BN(0))) {
          await driftClient.unsubscribe();
          throw new ApiError(
            ErrorCode.INVALID_REQUEST,
            `No open position found for SPOT market ${data.marketIndex}`
          );
        }
        
        // For spot, we need to handle token amounts differently
        const spotMarket = driftClient.getSpotMarketAccount(data.marketIndex);
        if (!spotMarket) {
          await driftClient.unsubscribe();
          throw new ApiError(ErrorCode.INVALID_REQUEST, 'Invalid spot market index');
        }
        
        // Get token amount from scaled balance
        // For spot positions, scaledBalance represents the actual token amount with precision
        const tokenAmount = spotPosition.scaledBalance;
        
        // Determine if this is a borrow (negative) or deposit (positive)
        const isDeposit = tokenAmount.gt(new BN(0));
        direction = isDeposit ? PositionDirection.SHORT : PositionDirection.LONG; // Sell if deposit, buy if borrow
        
        // Calculate base asset amount
        const precision = 10 ** spotMarket.decimals;
        if (data.size) {
          baseAssetAmount = new BN(parseFloat(data.size) * precision);
        } else {
          // Convert scaled balance to token amount
          const balancePrecision = new BN(10).pow(new BN(spotMarket.decimals));
          baseAssetAmount = tokenAmount.abs().div(balancePrecision);
        }
        
        logger.info('Closing SPOT position', {
          marketIndex: data.marketIndex,
          currentTokenAmount: tokenAmount.toString(),
          closingSize: baseAssetAmount.toString(),
          closingDirection: direction === PositionDirection.LONG ? 'BUY' : 'SELL',
          isDeposit,
          isFullClose: !data.size
        });
      }

      // Generate a unique userOrderId
      const userOrderId = Math.floor(Date.now() / 1000) % 255;
      
      // Build order params for closing position
      const orderParams: any = {
        marketIndex: data.marketIndex,
        marketType: data.marketType === 'PERP' ? MarketType.PERP : MarketType.SPOT,
        direction,
        baseAssetAmount,
        userOrderId,
        reduceOnly: true, // Important: This ensures we're only closing, not opening new positions
        orderType: OrderType.MARKET, // Use market order for immediate execution
      };

      logger.info('Placing close position order', {
        orderParams: {
          ...orderParams,
          baseAssetAmount: orderParams.baseAssetAmount.toString(),
        }
      });

      // Place the order
      let txSig: string;
      if (data.marketType === 'PERP') {
        txSig = await driftClient.placePerpOrder(orderParams);
      } else {
        txSig = await driftClient.placeSpotOrder(orderParams);
      }

      logger.info('Close position order placed successfully', {
        txSignature: txSig,
        userId: ctx.userId,
        dexAccountId,
        authority: dexAccount.address,
        marketIndex: data.marketIndex,
        marketType: data.marketType,
      });

      // Get the order from chain to verify it was placed
      await driftClient.fetchAccounts();
      const updatedUser = driftClient.getUser();
      const orders = updatedUser.getOpenOrders();
      
      // Find the order we just placed (it should be the most recent one)
      const placedOrder = orders[orders.length - 1];
      
      // Create order record in database
      const dbOrder = await this.db.createDriftOrder({
        dexAccountId,
        userId: ctx.userId!,
        driftOrderId: placedOrder?.orderId?.toString(),
        clientOrderId: placedOrder?.userOrderId?.toString(),
        marketIndex: data.marketIndex,
        marketType: data.marketType,
        direction: direction === PositionDirection.LONG ? 'long' : 'short',
        baseAssetAmount: baseAssetAmount.toString(),
        status: 'open',
        orderType: 'market',
        reduceOnly: true,
        rawParams: {
          txSignature: txSig,
          placedAt: new Date().toISOString(),
          delegateAuthority: keypair.publicKey.toString(),
          closePositionOrder: true,
        },
      });

      // Unsubscribe to clean up
      await driftClient.unsubscribe();

      return {
        success: true,
        order: dbOrder,
        txSignature: txSig,
        message: 'Position close order placed successfully using delegate',
        closingDetails: {
          marketIndex: data.marketIndex,
          marketType: data.marketType,
          direction: direction === PositionDirection.LONG ? 'long' : 'short',
          size: baseAssetAmount.toString(),
          reduceOnly: true,
        }
      };

    } catch (error) {
      logger.error('Failed to close position using delegate', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId: ctx.userId,
        dexAccountId,
        marketIndex: data.marketIndex,
        marketType: data.marketType,
      });
      
      if (error instanceof Error && error.message.includes('User not found')) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST, 
          'User account not initialized on Drift. Please initialize your account first.'
        );
      }
      
      if (error instanceof ApiError) {
        throw error;
      }
      
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR, 
        `Failed to close position: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Place order using backend wallet on behalf of user
   * This uses the MAGNOLIA_SOLANA_PRIVATE_KEY to sign and submit orders
   */
  async placeDelegateOrder(
    ctx: RequestContext,
    dexAccountId: number,
    orderParams: {
      marketIndex: number;
      marketType: 'PERP' | 'SPOT';
      direction: 'long' | 'short';
      baseAssetAmount: string;
      orderType: 'market' | 'limit' | 'trigger_market' | 'trigger_limit' | 'oracle';
      price?: string;
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
      userOrderId?: number;
    }
  ) {
    // Verify access to DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    // Get the backend private key from environment
    const privateKeyString = process.env.MAGNOLIA_SOLANA_PRIVATE_KEY;
    if (!privateKeyString) {
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Backend wallet not configured');
    }

    try {
      // Initialize DriftClient with backend wallet
      const privateKeyBytes = bs58.decode(privateKeyString);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);
      
      // Create connection from RPC URL
      const connection = new Connection(this.config.rpcUrl, 'confirmed');
      
      // Create wallet adapter
  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: any) => {
      // Check if it's a VersionedTransaction by looking for the 'sign' method
      // and absence of 'partialSign' method
      if (tx.sign && !tx.partialSign) {
        // It's a VersionedTransaction
        tx.sign([keypair]);
      } else if (tx.partialSign) {
        // It's a legacy Transaction
        tx.partialSign(keypair);
      } else {
        // Fallback: try both methods
        try {
          tx.sign([keypair]);
        } catch {
          tx.partialSign(keypair);
        }
      }
      return tx;
    },
    signAllTransactions: async (txs: any[]) => {
      // Same logic for multiple transactions
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

      // Initialize DriftClient for delegate trading
      const driftClient = new DriftClient({
        connection,
        wallet,
        env: this.config.env as 'mainnet-beta' | 'devnet',
        programID: new PublicKey(this.config.programId),
        authority: new PublicKey(dexAccount.address), // User's authority
        activeSubAccountId: dexAccount.subaccountId || 0,
        includeDelegates: false,
        authoritySubAccountMap: new Map([
          [dexAccount.address, [dexAccount.subaccountId || 0]]
        ]),
      });

      await driftClient.subscribe();

      logger.info('Initialized DriftClient for delegate order', {
        authority: dexAccount.address,
        subAccountId: dexAccount.subaccountId,
        marketType: orderParams.marketType,
        marketIndex: orderParams.marketIndex,
      });

      // Convert order parameters
      const direction = orderParams.direction === 'long' 
        ? PositionDirection.LONG 
        : PositionDirection.SHORT;

      const marketType = orderParams.marketType === 'PERP' 
        ? MarketType.PERP 
        : MarketType.SPOT;

      // Convert amounts based on market type
      let baseAssetAmount: BN;
      if (marketType === MarketType.PERP) {
        // For perps, use BASE_PRECISION (1e9)
        baseAssetAmount = new BN(parseFloat(orderParams.baseAssetAmount) * 1e9);
      } else {
        // For spot markets, get the precision from the market
        const spotMarket = driftClient.getSpotMarketAccount(orderParams.marketIndex);
        if (!spotMarket) {
          throw new ApiError(ErrorCode.INVALID_REQUEST, 'Invalid spot market index');
        }
        const precision = 10 ** spotMarket.decimals;
        baseAssetAmount = new BN(parseFloat(orderParams.baseAssetAmount) * precision);
      }

      // Build order params for SDK
      // Generate a unique userOrderId if not provided
      // userOrderId must be 0-255 (u8 type in Drift)
      // Use seconds modulo 255 to ensure it fits
      const userOrderId = orderParams.userOrderId || (Math.floor(Date.now() / 1000) % 255);
      
      logger.info('Generated userOrderId', {
        userOrderId,
        providedId: orderParams.userOrderId,
        timestamp: Math.floor(Date.now() / 1000)
      });
      
      const sdkOrderParams: any = {
        marketIndex: orderParams.marketIndex,
        marketType,
        direction,
        baseAssetAmount,
        userOrderId,
        reduceOnly: orderParams.reduceOnly || false,
      };

      // Set order type and related parameters
      switch (orderParams.orderType) {
        case 'market':
          sdkOrderParams.orderType = OrderType.MARKET;
          if (orderParams.auctionStartPrice) {
            sdkOrderParams.auctionStartPrice = new BN(parseFloat(orderParams.auctionStartPrice) * PRICE_PRECISION.toNumber());
          }
          if (orderParams.auctionEndPrice) {
            sdkOrderParams.auctionEndPrice = new BN(parseFloat(orderParams.auctionEndPrice) * PRICE_PRECISION.toNumber());
          }
          if (orderParams.auctionDuration) {
            sdkOrderParams.auctionDuration = orderParams.auctionDuration;
          }
          break;

        case 'limit':
          sdkOrderParams.orderType = OrderType.LIMIT;
          if (!orderParams.price) {
            throw new ApiError(ErrorCode.INVALID_REQUEST, 'Price required for limit orders');
          }
          sdkOrderParams.price = new BN(parseFloat(orderParams.price) * PRICE_PRECISION.toNumber());
          
          if (orderParams.postOnly) {
            sdkOrderParams.postOnly = orderParams.immediateOrCancel 
              ? PostOnlyParams.NONE 
              : PostOnlyParams.TRY_POST_ONLY;
          }
          break;

        case 'trigger_market':
          sdkOrderParams.orderType = OrderType.TRIGGER_MARKET;
          if (!orderParams.triggerPrice) {
            throw new ApiError(ErrorCode.INVALID_REQUEST, 'Trigger price required for trigger orders');
          }
          sdkOrderParams.triggerPrice = new BN(parseFloat(orderParams.triggerPrice) * PRICE_PRECISION.toNumber());
          sdkOrderParams.triggerCondition = orderParams.triggerCondition === 'above' 
            ? OrderTriggerCondition.ABOVE 
            : OrderTriggerCondition.BELOW;
          break;

        case 'trigger_limit':
          sdkOrderParams.orderType = OrderType.TRIGGER_LIMIT;
          if (!orderParams.triggerPrice || !orderParams.price) {
            throw new ApiError(ErrorCode.INVALID_REQUEST, 'Trigger price and price required for trigger limit orders');
          }
          sdkOrderParams.triggerPrice = new BN(parseFloat(orderParams.triggerPrice) * PRICE_PRECISION.toNumber());
          sdkOrderParams.price = new BN(parseFloat(orderParams.price) * PRICE_PRECISION.toNumber());
          sdkOrderParams.triggerCondition = orderParams.triggerCondition === 'above' 
            ? OrderTriggerCondition.ABOVE 
            : OrderTriggerCondition.BELOW;
          break;

        case 'oracle':
          sdkOrderParams.orderType = OrderType.ORACLE;
          if (orderParams.oraclePriceOffset) {
            sdkOrderParams.oraclePriceOffset = new BN(parseFloat(orderParams.oraclePriceOffset) * PRICE_PRECISION.toNumber()).toNumber();
          }
          break;
      }

      // Set max timestamp if provided
      if (orderParams.maxTs) {
        sdkOrderParams.maxTs = new BN(orderParams.maxTs);
      }

      // Place the order
      let txSig: string;
      if (marketType === MarketType.PERP) {
        txSig = await driftClient.placePerpOrder(sdkOrderParams);
      } else {
        txSig = await driftClient.placeSpotOrder(sdkOrderParams);
      }

      logger.info('Order placed successfully', {
        txSignature: txSig,
        userId: ctx.userId,
        dexAccountId,
        authority: dexAccount.address,
      });

      // Get the order from chain to get the order ID
      await driftClient.fetchAccounts();
      const user = driftClient.getUser();
      const orders = user.getOpenOrders();
      
      // Find the order we just placed (it should be the most recent one)
      const placedOrder = orders[orders.length - 1];
      
      // Create order record in database
      const dbOrder = await this.db.createDriftOrder({
        dexAccountId,
        userId: ctx.userId!,
        driftOrderId: placedOrder?.orderId?.toString(),
        clientOrderId: placedOrder?.userOrderId?.toString(),
        marketIndex: orderParams.marketIndex,
        marketType: orderParams.marketType,
        direction: orderParams.direction,
        baseAssetAmount: orderParams.baseAssetAmount,
        price: orderParams.price,
        status: 'open',
        orderType: orderParams.orderType,
        reduceOnly: orderParams.reduceOnly,
        postOnly: orderParams.postOnly,
        immediateOrCancel: orderParams.immediateOrCancel,
        maxTs: orderParams.maxTs,
        triggerPrice: orderParams.triggerPrice,
        triggerCondition: orderParams.triggerCondition,
        oraclePriceOffset: orderParams.oraclePriceOffset,
        auctionDuration: orderParams.auctionDuration,
        auctionStartPrice: orderParams.auctionStartPrice,
        auctionEndPrice: orderParams.auctionEndPrice,
        rawParams: {
          txSignature: txSig,
          placedAt: new Date().toISOString(),
          delegateAuthority: keypair.publicKey.toString(),
        },
      });

      // Unsubscribe to clean up
      await driftClient.unsubscribe();

      return {
        success: true,
        order: dbOrder,
        txSignature: txSig,
        message: 'Order placed successfully using delegate',
      };

    } catch (error) {
      logger.error('Failed to place delegate order', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId: ctx.userId,
        dexAccountId,
      });
      
      if (error instanceof Error && error.message.includes('User not found')) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST, 
          'User account not initialized on Drift. Please initialize your account first.'
        );
      }
      
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR, 
        `Failed to place order: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Place order - simplified wrapper for delegate order placement
   */
  async placeOrder(
    ctx: RequestContext,
    dexAccountId: number,
    params: {
      marketIndex: number;
      marketType: 'PERP' | 'SPOT';
      direction: 'long' | 'short';
      amount: string;
      orderType: 'market' | 'limit';
      price?: string;
    }
  ) {
    const result = await this.placeDelegateOrder(ctx, dexAccountId, {
      marketIndex: params.marketIndex,
      marketType: params.marketType,
      direction: params.direction,
      baseAssetAmount: params.amount,
      orderType: params.orderType,
      price: params.price,
      immediateOrCancel: params.orderType === 'market',
    });

    return {
      ...result,
      orderId: result.order.id,
      averagePrice: result.order.price,
      price: result.order.price,
    };
  }

  /**
   * Cancel order
   */
  async cancelOrder(
    ctx: RequestContext,
    dexAccountId: number,
    orderId: number
  ) {
    // Get the order from database
    const orders = await this.db.getDriftOrders({
      userId: ctx.userId!,
      dexAccountId,
    });

    const order = orders.find(o => o.id === orderId);
    if (!order) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Order not found');
    }

    // Get DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    // Get the backend private key from environment
    const privateKeyString = process.env.MAGNOLIA_SOLANA_PRIVATE_KEY;
    if (!privateKeyString) {
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Backend wallet not configured');
    }

    try {
      // Initialize DriftClient with backend wallet
      const privateKeyBytes = bs58.decode(privateKeyString);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);
      
      const connection = new Connection(this.config.rpcUrl, 'confirmed');
      
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

      const driftClient = new DriftClient({
        connection,
        wallet,
        env: this.config.env as 'mainnet-beta' | 'devnet',
        programID: new PublicKey(this.config.programId),
        authority: new PublicKey(dexAccount.address),
        activeSubAccountId: dexAccount.subaccountId || 0,
        includeDelegates: false,
        authoritySubAccountMap: new Map([
          [dexAccount.address, [dexAccount.subaccountId || 0]]
        ]),
      });

      await driftClient.subscribe();

      // Cancel the order
      const txSig = await driftClient.cancelOrder(
        order.driftOrderId ? parseInt(order.driftOrderId) : undefined
      );

      // Update order status in database
      await this.db.updateDriftOrder(order.id, {
        status: 'cancelled',
      });

      await driftClient.unsubscribe();

      return {
        success: true,
        txSignature: txSig,
        message: 'Order cancelled successfully',
      };

    } catch (error) {
      logger.error('Failed to cancel order', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orderId,
      });
      
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR, 
        `Failed to cancel order: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}