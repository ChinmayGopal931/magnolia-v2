import { db } from './connection';
import { eq, and, desc } from 'drizzle-orm';
import {
  users,
  userWallets,
  dexAccounts,
  hyperliquidOrders,
  driftOrders,
  lighterOrders,
  positions,
  positionSnapshots,
} from './schema';

export class DatabaseRepository {
  // ========== User Management ==========
  async findUserByWallet(walletAddress: string) {
    // First check user_wallets table
    const [wallet] = await db
      .select({
        user: users,
        wallet: userWallets,
      })
      .from(userWallets)
      .innerJoin(users, eq(userWallets.userId, users.id))
      .where(eq(userWallets.walletAddress, walletAddress))
      .limit(1);
    
    return wallet?.user;
  }

  async createUser(email?: string) {
    const [user] = await db
      .insert(users)
      .values({ email })
      .returning();
    return user;
  }
  
  async createUserWithWallet(walletAddress: string, walletType: 'evm' | 'solana', email?: string) {
    return await db.transaction(async (tx) => {
      // Create user
      const [user] = await tx
        .insert(users)
        .values({ email })
        .returning();
      
      // Create wallet link
      await tx
        .insert(userWallets)
        .values({
          userId: user.id,
          walletAddress,
          walletType,
          isPrimary: true,
        });
      
      return user;
    });
  }

  async updateUser(userId: number, data: Partial<{ email: string }>) {
    const [updated] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }
  
  // ========== Wallet Management ==========
  async linkWallet(userId: number, walletAddress: string, walletType: 'evm' | 'solana') {
    const [wallet] = await db
      .insert(userWallets)
      .values({
        userId,
        walletAddress,
        walletType,
        isPrimary: false,
      })
      .returning();
    return wallet;
  }
  
  async getUserWallets(userId: number) {
    return await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.userId, userId))
      .orderBy(desc(userWallets.isPrimary), userWallets.linkedAt);
  }
  
  async findWalletByAddress(walletAddress: string) {
    const [wallet] = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.walletAddress, walletAddress))
      .limit(1);
    return wallet;
  }
  
  async getPrimaryWallet(userId: number) {
    const [wallet] = await db
      .select()
      .from(userWallets)
      .where(and(
        eq(userWallets.userId, userId),
        eq(userWallets.isPrimary, true)
      ))
      .limit(1);
    return wallet;
  }

  // ========== DEX Account Management ==========
  async createDexAccount(data: {
    userId: number;
    dexType: 'hyperliquid' | 'drift';
    address: string;
    accountType: 'master' | 'agent_wallet' | 'subaccount';
    encryptedPrivateKey?: string;
    agentName?: string;
    subaccountId?: number;
    nonce?: string;
    metadata?: any;
  }) {
    const [account] = await db
      .insert(dexAccounts)
      .values(data)
      .returning();
    return account;
  }

  async updateDexAccount(accountId: number, data: Partial<{
    nonce: string;
    isActive: boolean;
    metadata: any;
  }>) {
    const [updated] = await db
      .update(dexAccounts)
      .set(data)
      .where(eq(dexAccounts.id, accountId))
      .returning();
    return updated;
  }

  async getDexAccount(accountId: number) {
    const [account] = await db
      .select()
      .from(dexAccounts)
      .where(eq(dexAccounts.id, accountId))
      .limit(1);
    return account;
  }

  async getUserDexAccounts(userId: number, dexType?: 'hyperliquid' | 'drift') {
    const conditions = [eq(dexAccounts.userId, userId)];
    if (dexType) {
      conditions.push(eq(dexAccounts.dexType, dexType));
    }
    
    return await db
      .select()
      .from(dexAccounts)
      .where(and(...conditions))
      .orderBy(desc(dexAccounts.createdAt));
  }

  async getDexAccountByAddress(address: string, dexType: 'hyperliquid' | 'drift') {
    const [account] = await db
      .select()
      .from(dexAccounts)
      .where(
        and(
          eq(dexAccounts.address, address),
          eq(dexAccounts.dexType, dexType)
        )
      )
      .limit(1);
    return account;
  }

  // ========== Hyperliquid Orders ==========
  async createHyperliquidOrder(data: {
    dexAccountId: number;
    userId: number;
    hlOrderId?: string;
    clientOrderId?: string;
    assetSymbol: string;
    assetIndex: number;
    side: 'buy' | 'sell';
    orderType: string;
    price?: string;
    size: string;
    status?: 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired';
    reduceOnly?: boolean;
    postOnly?: boolean;
    timeInForce?: string;
    triggerPrice?: string;
    triggerCondition?: string;
    oraclePriceOffset?: string;
    auctionStartPrice?: string;
    auctionEndPrice?: string;
    auctionDuration?: number;
    signature?: string;
    nonce?: string;
    builderFee?: string;
    rawResponse?: any;
  }) {
    const [order] = await db
      .insert(hyperliquidOrders)
      .values(data)
      .returning();
    return order;
  }

  async updateHyperliquidOrder(orderId: number, data: Partial<{
    hlOrderId: string;
    filledSize: string;
    avgFillPrice: string;
    status: 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired';
    rawResponse: any;
  }>) {
    const [updated] = await db
      .update(hyperliquidOrders)
      .set(data)
      .where(eq(hyperliquidOrders.id, orderId))
      .returning();
    return updated;
  }

  async getHyperliquidOrders(filters: {
    userId?: number;
    dexAccountId?: number;
    assetSymbol?: string;
    assetIndex?: number;
    status?: 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired';
    clientOrderId?: string;
  }) {
    const conditions = [];
    
    if (filters.userId) {
      conditions.push(eq(hyperliquidOrders.userId, filters.userId));
    }
    if (filters.dexAccountId) {
      conditions.push(eq(hyperliquidOrders.dexAccountId, filters.dexAccountId));
    }
    if (filters.assetSymbol) {
      conditions.push(eq(hyperliquidOrders.assetSymbol, filters.assetSymbol));
    }
    if (filters.assetIndex !== undefined) {
      conditions.push(eq(hyperliquidOrders.assetIndex, filters.assetIndex));
    }
    if (filters.status) {
      conditions.push(eq(hyperliquidOrders.status, filters.status as any));
    }
    if (filters.clientOrderId) {
      conditions.push(eq(hyperliquidOrders.clientOrderId, filters.clientOrderId));
    }

    return await db
      .select()
      .from(hyperliquidOrders)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(hyperliquidOrders.createdAt));
  }

  // ========== Drift Orders ==========
  async createDriftOrder(data: {
    dexAccountId: number;
    userId: number;
    driftOrderId?: string;
    clientOrderId?: string;
    marketIndex: number;
    marketType: 'PERP' | 'SPOT';
    direction: 'long' | 'short';
    baseAssetAmount: string;
    price?: string;
    status?: 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired';
    orderType: string;
    reduceOnly?: boolean;
    postOnly?: boolean;
    immediateOrCancel?: boolean;
    maxTs?: string;
    triggerPrice?: string;
    triggerCondition?: string;
    oraclePriceOffset?: string;
    auctionDuration?: number;
    auctionStartPrice?: string;
    auctionEndPrice?: string;
    rawParams?: any;
  }) {
    const [order] = await db
      .insert(driftOrders)
      .values(data)
      .returning();
    return order;
  }

  // ========== Lighter Orders ==========
  async createLighterOrder(data: {
    dexAccountId: number;
    userId: number;
    lighterOrderId?: string;
    clientOrderIndex?: number;
    marketId: number;
    side: 'buy' | 'sell';
    orderType: string;
    price?: string;
    baseAmount: string;
    filledAmount?: string;
    avgFillPrice?: string;
    status?: 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired';
    timeInForce?: string;
    reduceOnly?: boolean;
    postOnly?: boolean;
    triggerPrice?: string;
    triggerCondition?: string;
    apiKeyIndex?: number;
    nonce?: string;
    accountIndex: number;
    signature?: string;
    rawParams?: any;
  }) {
    const [order] = await db
      .insert(lighterOrders)
      .values(data)
      .returning();
    return order;
  }

  async updateDriftOrder(orderId: number, data: Partial<{
    driftOrderId: string;
    filledAmount: string;
    avgFillPrice: string;
    status: 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired';
    rawParams: any;
  }>) {
    const [updated] = await db
      .update(driftOrders)
      .set(data)
      .where(eq(driftOrders.id, orderId))
      .returning();
    return updated;
  }

  async getDriftOrders(filters: {
    userId?: number;
    dexAccountId?: number;
    marketIndex?: number;
    marketType?: string;
    status?: 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired';
    clientOrderId?: string;
  }) {
    const conditions = [];
    
    if (filters.userId) {
      conditions.push(eq(driftOrders.userId, filters.userId));
    }
    if (filters.dexAccountId) {
      conditions.push(eq(driftOrders.dexAccountId, filters.dexAccountId));
    }
    if (filters.marketIndex !== undefined) {
      conditions.push(eq(driftOrders.marketIndex, filters.marketIndex));
    }
    if (filters.marketType) {
      conditions.push(eq(driftOrders.marketType, filters.marketType as any));
    }
    if (filters.status) {
      conditions.push(eq(driftOrders.status, filters.status as any));
    }
    if (filters.clientOrderId) {
      conditions.push(eq(driftOrders.clientOrderId, filters.clientOrderId));
    }

    return await db
      .select()
      .from(driftOrders)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(driftOrders.createdAt));
  }

  // ========== Positions ==========
  async createPosition(data: {
    userId: number;
    positionType: 'single' | 'delta_neutral';
    name: string;
    metadata?: any;
  }) {
    const [position] = await db
      .insert(positions)
      .values(data)
      .returning();
    return position;
  }

  async updatePosition(positionId: number, data: Partial<{
    status: 'open' | 'closed' | 'liquidated';
    totalPnl: string;
    closedPnl: string;
    closedAt: Date;
    metadata: any;
  }>) {
    const [updated] = await db
      .update(positions)
      .set(data)
      .where(eq(positions.id, positionId))
      .returning();
    return updated;
  }

  async deletePosition(positionId: number) {
    // Delete the position (snapshots will be deleted automatically due to CASCADE)
    const [deleted] = await db
      .delete(positions)
      .where(eq(positions.id, positionId))
      .returning();
    return deleted;
  }

  async getUserPositions(userId: number, filters?: {
    status?: string;
    positionType?: string;
  }) {
    const conditions = [eq(positions.userId, userId)];
    
    if (filters?.status) {
      conditions.push(eq(positions.status, filters.status as any));
    }
    if (filters?.positionType) {
      conditions.push(eq(positions.positionType, filters.positionType as any));
    }

    return await db
      .select()
      .from(positions)
      .where(and(...conditions))
      .orderBy(desc(positions.createdAt));
  }

  async getOpenPositionsWithFundingOptimization() {
    return await db
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.status, 'open'),
          eq(positions.fundingOptimizationEnabled, true)
        )
      )
      .orderBy(desc(positions.createdAt));
  }

  async getPositionWithSnapshots(positionId: number) {
    const [position] = await db
      .select()
      .from(positions)
      .where(eq(positions.id, positionId))
      .limit(1);

    if (!position) {
      return null;
    }

    const snapshots = await db
      .select({
        snapshot: positionSnapshots,
        hyperliquidOrder: hyperliquidOrders,
        driftOrder: driftOrders,
        dexAccount: dexAccounts,
      })
      .from(positionSnapshots)
      .leftJoin(
        hyperliquidOrders,
        eq(positionSnapshots.hyperliquidOrderId, hyperliquidOrders.id)
      )
      .leftJoin(
        driftOrders,
        eq(positionSnapshots.driftOrderId, driftOrders.id)
      )
      .leftJoin(
        dexAccounts,
        eq(positionSnapshots.dexAccountId, dexAccounts.id)
      )
      .where(eq(positionSnapshots.positionId, positionId))
      .orderBy(desc(positionSnapshots.snapshotAt));

    return {
      ...position,
      snapshots: snapshots.map(({ snapshot, hyperliquidOrder, driftOrder, dexAccount }) => ({
        ...snapshot,
        order: hyperliquidOrder || driftOrder,
        dexAccount,
      })),
    };
  }

  // ========== Position Snapshots ==========
  async createPositionSnapshot(data: {
    positionId: number;
    dexType: 'hyperliquid' | 'drift';
    dexAccountId: number;
    symbol: string;
    side: 'long' | 'short' | 'spot';
    entryPrice: string;
    currentPrice: string;
    markPrice?: string;
    liquidationPrice?: string;
    size: string;
    notionalValue: string;
    hyperliquidOrderId?: number;
    driftOrderId?: number;
    metadata?: any;
  }) {
    const [snapshot] = await db
      .insert(positionSnapshots)
      .values(data)
      .returning();
    return snapshot;
  }

  async updatePositionSnapshot(snapshotId: number, data: Partial<{
    currentPrice: string;
    markPrice: string;
    liquidationPrice: string;
    metadata: any;
  }>) {
    const [updated] = await db
      .update(positionSnapshots)
      .set(data)
      .where(eq(positionSnapshots.id, snapshotId))
      .returning();
    return updated;
  }

  async getPositionSnapshots(positionId: number) {
    return await db
      .select()
      .from(positionSnapshots)
      .where(eq(positionSnapshots.positionId, positionId))
      .orderBy(desc(positionSnapshots.snapshotAt));
  }

  async getLatestPositionSnapshots(positionId: number) {
    // Get the latest snapshot for each dex/symbol combination
    const snapshots = await db
      .select()
      .from(positionSnapshots)
      .where(eq(positionSnapshots.positionId, positionId))
      .orderBy(desc(positionSnapshots.snapshotAt));
    
    // Group by dexType and symbol to get latest for each
    const latestByDexSymbol = new Map<string, typeof snapshots[0]>();
    
    for (const snapshot of snapshots) {
      const key = `${snapshot.dexType}-${snapshot.symbol}`;
      if (!latestByDexSymbol.has(key)) {
        latestByDexSymbol.set(key, snapshot);
      }
    }
    
    return Array.from(latestByDexSymbol.values());
  }

  async deletePositionSnapshot(snapshotId: number) {
    const [deleted] = await db
      .delete(positionSnapshots)
      .where(eq(positionSnapshots.id, snapshotId))
      .returning();
    return deleted;
  }

  // ========== Transactions ==========
  async transaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
    return await db.transaction(fn);
  }
}