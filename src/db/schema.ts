import { pgTable, serial, text, timestamp, boolean, jsonb, numeric, integer, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const dexTypeEnum = pgEnum('dex_type', ['hyperliquid', 'drift']);
export const accountTypeEnum = pgEnum('account_type', ['master', 'agent_wallet', 'subaccount']);
export const orderSideEnum = pgEnum('order_side', ['buy', 'sell']);
export const orderStatusEnum = pgEnum('order_status', [
  'pending', 
  'open', 
  'filled', 
  'cancelled', 
  'rejected',
  'failed',
  'triggered',
  'marginCanceled',
  'liquidatedCanceled',
  'expired'
]);
export const positionStatusEnum = pgEnum('position_status', ['open', 'closed', 'liquidated']);
export const positionTypeEnum = pgEnum('position_type', ['single', 'delta_neutral']);
export const legSideEnum = pgEnum('leg_side', ['long', 'short', 'spot']);
export const walletTypeEnum = pgEnum('wallet_type', ['evm', 'solana']);

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email'),
  telegramChatId: text('telegram_chat_id'),
  telegramUsername: text('telegram_username'),
  telegramVerified: boolean('telegram_verified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User wallets table - links wallets to users
export const userWallets = pgTable('user_wallets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  walletAddress: text('wallet_address').notNull().unique(),
  walletType: walletTypeEnum('wallet_type').notNull(),
  isPrimary: boolean('is_primary').default(false).notNull(),
  linkedAt: timestamp('linked_at').defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index('idx_user_wallets_user_id').on(table.userId),
    walletAddressIdx: index('idx_user_wallets_address').on(table.walletAddress),
    primaryWalletIdx: index('idx_user_wallets_primary').on(table.userId, table.isPrimary),
  };
});

// DEX Accounts table
export const dexAccounts = pgTable('dex_accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  dexType: dexTypeEnum('dex_type').notNull(),
  address: text('address').notNull(),
  accountType: accountTypeEnum('account_type').notNull(),
  encryptedPrivateKey: text('encrypted_private_key'), // Only for Hyperliquid agent wallets
  agentName: text('agent_name'), // For Hyperliquid agent wallets
  subaccountId: integer('subaccount_id'), // For Drift subaccounts
  nonce: numeric('nonce', { precision: 20, scale: 0 }), // For Hyperliquid nonce tracking
  isActive: boolean('is_active').default(true).notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    dexAddressIdx: uniqueIndex('idx_dex_type_address').on(table.dexType, table.address),
    userDexIdx: index('idx_user_dex').on(table.userId, table.dexType),
    addressIdx: index('idx_address').on(table.address),
    activeIdx: index('idx_active').on(table.isActive),
  };
});

// Hyperliquid Orders table
export const hyperliquidOrders = pgTable('hyperliquid_orders', {
  id: serial('id').primaryKey(),
  dexAccountId: integer('dex_account_id').notNull().references(() => dexAccounts.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  hlOrderId: numeric('hl_order_id', { precision: 20, scale: 0 }),
  clientOrderId: text('client_order_id').unique(), // cloid - 128 bit hex string
  assetSymbol: text('asset_symbol').notNull(), // coin symbol (e.g., "BTC", "ETH")
  assetIndex: integer('asset_index').notNull(), // numeric index for the asset
  side: orderSideEnum('side').notNull(),
  orderType: text('order_type').notNull(), // market, limit, trigger_market, trigger_limit, oracle
  price: numeric('price', { precision: 30, scale: 10 }),
  size: numeric('size', { precision: 30, scale: 10 }).notNull(),
  filledSize: numeric('filled_size', { precision: 30, scale: 10 }).default('0'),
  avgFillPrice: numeric('avg_fill_price', { precision: 30, scale: 10 }),
  status: orderStatusEnum('status').notNull().default('pending'),
  reduceOnly: boolean('reduce_only').default(false),
  postOnly: boolean('post_only').default(false),
  timeInForce: text('time_in_force'), // Alo, Ioc, Gtc
  triggerPrice: numeric('trigger_price', { precision: 30, scale: 10 }),
  triggerCondition: text('trigger_condition'), // tp, sl
  oraclePriceOffset: numeric('oracle_price_offset', { precision: 30, scale: 10 }),
  auctionStartPrice: numeric('auction_start_price', { precision: 30, scale: 10 }),
  auctionEndPrice: numeric('auction_end_price', { precision: 30, scale: 10 }),
  auctionDuration: integer('auction_duration'),
  signature: text('signature'),
  nonce: numeric('nonce', { precision: 20, scale: 0 }),
  builderFee: numeric('builder_fee', { precision: 10, scale: 4 }),
  rawResponse: jsonb('raw_response'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    userIdx: index('idx_hl_orders_user').on(table.userId),
    accountIdx: index('idx_hl_orders_account').on(table.dexAccountId),
    statusIdx: index('idx_hl_orders_status').on(table.status),
    clientIdIdx: index('idx_hl_orders_client_id').on(table.clientOrderId),
    assetStatusIdx: index('idx_hl_orders_asset_status').on(table.assetSymbol, table.assetIndex, table.status),
    createdIdx: index('idx_hl_orders_created').on(table.createdAt),
  };
});

// Drift Orders table
export const driftOrders = pgTable('drift_orders', {
  id: serial('id').primaryKey(),
  dexAccountId: integer('dex_account_id').notNull().references(() => dexAccounts.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  driftOrderId: text('drift_order_id'),
  clientOrderId: text('client_order_id').unique(),
  marketIndex: integer('market_index').notNull(),
  marketType: text('market_type').notNull(), // PERP, SPOT
  direction: text('direction').notNull(), // long, short
  baseAssetAmount: numeric('base_asset_amount', { precision: 30, scale: 10 }).notNull(),
  price: numeric('price', { precision: 30, scale: 10 }),
  filledAmount: numeric('filled_amount', { precision: 30, scale: 10 }).default('0'),
  avgFillPrice: numeric('avg_fill_price', { precision: 30, scale: 10 }),
  status: orderStatusEnum('status').notNull().default('pending'),
  orderType: text('order_type').notNull(), // market, limit, trigger_market, trigger_limit, oracle
  reduceOnly: boolean('reduce_only').default(false),
  postOnly: boolean('post_only').default(false),
  immediateOrCancel: boolean('immediate_or_cancel').default(false),
  maxTs: numeric('max_ts', { precision: 20, scale: 0 }), // max timestamp for order expiry
  triggerPrice: numeric('trigger_price', { precision: 30, scale: 10 }),
  triggerCondition: text('trigger_condition'), // above, below
  oraclePriceOffset: numeric('oracle_price_offset', { precision: 30, scale: 10 }),
  auctionDuration: integer('auction_duration'),
  auctionStartPrice: numeric('auction_start_price', { precision: 30, scale: 10 }),
  auctionEndPrice: numeric('auction_end_price', { precision: 30, scale: 10 }),
  rawParams: jsonb('raw_params'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    userIdx: index('idx_drift_orders_user').on(table.userId),
    accountIdx: index('idx_drift_orders_account').on(table.dexAccountId),
    statusIdx: index('idx_drift_orders_status').on(table.status),
    clientIdIdx: index('idx_drift_orders_client_id').on(table.clientOrderId),
    marketStatusIdx: index('idx_drift_orders_market_status').on(table.marketIndex, table.status),
    createdIdx: index('idx_drift_orders_created').on(table.createdAt),
  };
});

// Positions table
export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  positionType: positionTypeEnum('position_type').notNull(),
  name: text('name').notNull(),
  status: positionStatusEnum('status').notNull().default('open'),
  totalPnl: numeric('total_pnl', { precision: 30, scale: 10 }).default('0'),
  closedPnl: numeric('closed_pnl', { precision: 30, scale: 10 }).default('0'),
  notificationsEnabled: boolean('notifications_enabled').default(true).notNull(),
  fundingOptimizationEnabled: boolean('funding_optimization_enabled').default(false).notNull(),
  lastAlertSentAt: timestamp('last_alert_sent_at'),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  closedAt: timestamp('closed_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    userStatusIdx: index('idx_positions_user_status').on(table.userId, table.status),
    typeStatusIdx: index('idx_positions_type_status').on(table.positionType, table.status),
    createdIdx: index('idx_positions_created').on(table.createdAt),
    alertsIdx: index('idx_positions_alerts').on(table.status, table.notificationsEnabled),
    fundingOptIdx: index('idx_positions_funding_opt').on(table.status, table.fundingOptimizationEnabled),
  };
});

// Position Snapshots table
export const positionSnapshots = pgTable('position_snapshots', {
  id: serial('id').primaryKey(),
  positionId: integer('position_id').notNull().references(() => positions.id, { onDelete: 'cascade' }),
  dexType: dexTypeEnum('dex_type').notNull(),
  dexAccountId: integer('dex_account_id').notNull().references(() => dexAccounts.id, { onDelete: 'cascade' }),
  symbol: text('symbol').notNull(), // e.g., "ETH-PERP", "BTC-USD"
  side: legSideEnum('side').notNull(), // long, short, or spot
  entryPrice: numeric('entry_price', { precision: 30, scale: 10 }).notNull(),
  currentPrice: numeric('current_price', { precision: 30, scale: 10 }).notNull(),
  markPrice: numeric('mark_price', { precision: 30, scale: 10 }), // for calculating unrealized PnL
  liquidationPrice: numeric('liquidation_price', { precision: 30, scale: 10 }), // price at which position would be liquidated
  size: numeric('size', { precision: 30, scale: 10 }).notNull(),
  notionalValue: numeric('notional_value', { precision: 30, scale: 10 }).notNull(),
  hyperliquidOrderId: integer('hyperliquid_order_id').references(() => hyperliquidOrders.id, { onDelete: 'set null' }),
  driftOrderId: integer('drift_order_id').references(() => driftOrders.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').default({}).notNull(),
  snapshotAt: timestamp('snapshot_at').defaultNow().notNull(),
}, (table) => {
  return {
    positionIdx: index('idx_snapshots_position').on(table.positionId),
    dexAccountIdx: index('idx_snapshots_dex_account').on(table.dexAccountId),
    snapshotTimeIdx: index('idx_snapshots_time').on(table.snapshotAt),
    positionTimeIdx: index('idx_snapshots_position_time').on(table.positionId, table.snapshotAt),
    positionDexIdx: index('idx_snapshots_position_dex').on(table.positionId, table.dexType),
  };
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  wallets: many(userWallets),
  dexAccounts: many(dexAccounts),
  hyperliquidOrders: many(hyperliquidOrders),
  driftOrders: many(driftOrders),
  positions: many(positions),
}));

export const userWalletsRelations = relations(userWallets, ({ one }) => ({
  user: one(users, {
    fields: [userWallets.userId],
    references: [users.id],
  }),
}));

export const dexAccountsRelations = relations(dexAccounts, ({ one, many }) => ({
  user: one(users, {
    fields: [dexAccounts.userId],
    references: [users.id],
  }),
  hyperliquidOrders: many(hyperliquidOrders),
  driftOrders: many(driftOrders),
}));

export const hyperliquidOrdersRelations = relations(hyperliquidOrders, ({ one, many }) => ({
  user: one(users, {
    fields: [hyperliquidOrders.userId],
    references: [users.id],
  }),
  dexAccount: one(dexAccounts, {
    fields: [hyperliquidOrders.dexAccountId],
    references: [dexAccounts.id],
  }),
  positionSnapshots: many(positionSnapshots),
}));

export const driftOrdersRelations = relations(driftOrders, ({ one, many }) => ({
  user: one(users, {
    fields: [driftOrders.userId],
    references: [users.id],
  }),
  dexAccount: one(dexAccounts, {
    fields: [driftOrders.dexAccountId],
    references: [dexAccounts.id],
  }),
  positionSnapshots: many(positionSnapshots),
}));

export const positionsRelations = relations(positions, ({ one, many }) => ({
  user: one(users, {
    fields: [positions.userId],
    references: [users.id],
  }),
  snapshots: many(positionSnapshots),
}));

export const positionSnapshotsRelations = relations(positionSnapshots, ({ one }) => ({
  position: one(positions, {
    fields: [positionSnapshots.positionId],
    references: [positions.id],
  }),
  dexAccount: one(dexAccounts, {
    fields: [positionSnapshots.dexAccountId],
    references: [dexAccounts.id],
  }),
  hyperliquidOrder: one(hyperliquidOrders, {
    fields: [positionSnapshots.hyperliquidOrderId],
    references: [hyperliquidOrders.id],
  }),
  driftOrder: one(driftOrders, {
    fields: [positionSnapshots.driftOrderId],
    references: [driftOrders.id],
  }),
}));