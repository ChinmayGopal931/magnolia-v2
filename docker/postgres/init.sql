-- Create database if it doesn't exist
SELECT 'CREATE DATABASE magnolia_v2'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'magnolia_v2')\gexec

-- Connect to the database
\c magnolia_v2;

-- Create enums
CREATE TYPE dex_type AS ENUM ('hyperliquid', 'drift');
CREATE TYPE account_type AS ENUM ('master', 'agent_wallet', 'subaccount');
CREATE TYPE order_side AS ENUM ('buy', 'sell');
CREATE TYPE order_status AS ENUM (
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
);
CREATE TYPE position_status AS ENUM ('open', 'closed', 'liquidated');
CREATE TYPE position_type AS ENUM ('single', 'delta_neutral');
CREATE TYPE leg_side AS ENUM ('long', 'short', 'spot');
CREATE TYPE wallet_type AS ENUM ('evm', 'solana');

-- Users table with new telegram fields
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255),
    telegram_chat_id TEXT,
    telegram_username TEXT,
    telegram_verified BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- User wallets table
CREATE TABLE user_wallets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(255) UNIQUE NOT NULL,
    wallet_type wallet_type NOT NULL,
    is_primary BOOLEAN DEFAULT false NOT NULL,
    linked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- DEX Accounts table
CREATE TABLE dex_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dex_type dex_type NOT NULL,
    address VARCHAR(255) NOT NULL,
    account_type account_type NOT NULL,
    encrypted_private_key TEXT,
    agent_name VARCHAR(255),
    subaccount_id INTEGER,
    nonce NUMERIC(20, 0),
    is_active BOOLEAN DEFAULT true NOT NULL,
    metadata JSONB DEFAULT '{}' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(dex_type, address),
    CONSTRAINT check_hyperliquid_agent CHECK (
        (dex_type = 'hyperliquid' AND account_type = 'agent_wallet' AND encrypted_private_key IS NOT NULL) OR
        (dex_type = 'hyperliquid' AND account_type != 'agent_wallet' AND encrypted_private_key IS NULL) OR
        (dex_type != 'hyperliquid')
    ),
    CONSTRAINT check_drift_subaccount CHECK (
        (dex_type = 'drift' AND account_type = 'subaccount' AND subaccount_id IS NOT NULL) OR
        (dex_type = 'drift' AND account_type != 'subaccount') OR
        (dex_type != 'drift')
    )
);

-- Hyperliquid Orders table (updated with asset_symbol and asset_index)
CREATE TABLE hyperliquid_orders (
    id SERIAL PRIMARY KEY,
    dex_account_id INTEGER NOT NULL REFERENCES dex_accounts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hl_order_id BIGINT,
    client_order_id VARCHAR(255) UNIQUE,
    asset_symbol VARCHAR(50) NOT NULL,
    asset_index INTEGER NOT NULL,
    side order_side NOT NULL,
    order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('market', 'limit', 'trigger_market', 'trigger_limit', 'oracle')),
    price NUMERIC(30, 10),
    size NUMERIC(30, 10) NOT NULL,
    filled_size NUMERIC(30, 10) DEFAULT 0,
    avg_fill_price NUMERIC(30, 10),
    status order_status NOT NULL DEFAULT 'pending',
    reduce_only BOOLEAN DEFAULT false,
    post_only BOOLEAN DEFAULT false,
    time_in_force VARCHAR(10) CHECK (time_in_force IN ('Alo', 'Ioc', 'Gtc')),
    trigger_price NUMERIC(30, 10),
    trigger_condition VARCHAR(10) CHECK (trigger_condition IN ('tp', 'sl')),
    oracle_price_offset NUMERIC(30, 10),
    auction_start_price NUMERIC(30, 10),
    auction_end_price NUMERIC(30, 10),
    auction_duration INTEGER,
    signature TEXT,
    nonce NUMERIC(20, 0),
    builder_fee NUMERIC(10, 4),
    raw_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Drift Orders table
CREATE TABLE drift_orders (
    id SERIAL PRIMARY KEY,
    dex_account_id INTEGER NOT NULL REFERENCES dex_accounts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    drift_order_id VARCHAR(255),
    client_order_id VARCHAR(255) UNIQUE,
    market_index INTEGER NOT NULL,
    market_type VARCHAR(10) NOT NULL CHECK (market_type IN ('PERP', 'SPOT')),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('long', 'short')),
    base_asset_amount NUMERIC(30, 10) NOT NULL,
    price NUMERIC(30, 10),
    filled_amount NUMERIC(30, 10) DEFAULT 0,
    avg_fill_price NUMERIC(30, 10),
    status order_status NOT NULL DEFAULT 'pending',
    order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('market', 'limit', 'trigger_market', 'trigger_limit', 'oracle')),
    reduce_only BOOLEAN DEFAULT false,
    post_only BOOLEAN DEFAULT false,
    immediate_or_cancel BOOLEAN DEFAULT false,
    max_ts BIGINT,
    trigger_price NUMERIC(30, 10),
    trigger_condition VARCHAR(10) CHECK (trigger_condition IN ('above', 'below')),
    oracle_price_offset NUMERIC(30, 10),
    auction_duration INTEGER,
    auction_start_price NUMERIC(30, 10),
    auction_end_price NUMERIC(30, 10),
    raw_params JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Positions table with new notification fields
CREATE TABLE positions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position_type position_type NOT NULL,
    name VARCHAR(255) NOT NULL,
    status position_status NOT NULL DEFAULT 'open',
    total_pnl NUMERIC(30, 10) DEFAULT 0,
    closed_pnl NUMERIC(30, 10) DEFAULT 0,
    notifications_enabled BOOLEAN DEFAULT true NOT NULL,
    funding_optimization_enabled BOOLEAN DEFAULT false NOT NULL,
    last_alert_sent_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT check_closed_position CHECK (
        (status IN ('closed', 'liquidated') AND closed_at IS NOT NULL) OR
        (status = 'open' AND closed_at IS NULL)
    )
);

-- Position Snapshots table
CREATE TABLE position_snapshots (
    id SERIAL PRIMARY KEY,
    position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    dex_type dex_type NOT NULL,
    dex_account_id INTEGER NOT NULL REFERENCES dex_accounts(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    side leg_side NOT NULL,
    entry_price NUMERIC(30, 10) NOT NULL,
    current_price NUMERIC(30, 10) NOT NULL,
    mark_price NUMERIC(30, 10),
    liquidation_price NUMERIC(30, 10),
    size NUMERIC(30, 10) NOT NULL,
    notional_value NUMERIC(30, 10) NOT NULL,
    hyperliquid_order_id INTEGER REFERENCES hyperliquid_orders(id) ON DELETE SET NULL,
    drift_order_id INTEGER REFERENCES drift_orders(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}' NOT NULL,
    snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);

CREATE INDEX idx_user_wallets_user_id ON user_wallets(user_id);
CREATE INDEX idx_user_wallets_address ON user_wallets(wallet_address);
CREATE INDEX idx_user_wallets_primary ON user_wallets(user_id, is_primary);

CREATE UNIQUE INDEX idx_dex_type_address ON dex_accounts(dex_type, address);
CREATE INDEX idx_dex_accounts_user_dex ON dex_accounts(user_id, dex_type);
CREATE INDEX idx_dex_accounts_address ON dex_accounts(address);
CREATE INDEX idx_dex_accounts_active ON dex_accounts(is_active);

CREATE INDEX idx_hl_orders_user ON hyperliquid_orders(user_id);
CREATE INDEX idx_hl_orders_account ON hyperliquid_orders(dex_account_id);
CREATE INDEX idx_hl_orders_status ON hyperliquid_orders(status);
CREATE INDEX idx_hl_orders_client_id ON hyperliquid_orders(client_order_id);
CREATE INDEX idx_hl_orders_asset_status ON hyperliquid_orders(asset_symbol, asset_index, status);
CREATE INDEX idx_hl_orders_created ON hyperliquid_orders(created_at DESC);

CREATE INDEX idx_drift_orders_user ON drift_orders(user_id);
CREATE INDEX idx_drift_orders_account ON drift_orders(dex_account_id);
CREATE INDEX idx_drift_orders_status ON drift_orders(status);
CREATE INDEX idx_drift_orders_client_id ON drift_orders(client_order_id);
CREATE INDEX idx_drift_orders_market_status ON drift_orders(market_index, status);
CREATE INDEX idx_drift_orders_created ON drift_orders(created_at DESC);

CREATE INDEX idx_positions_user_status ON positions(user_id, status);
CREATE INDEX idx_positions_type_status ON positions(position_type, status);
CREATE INDEX idx_positions_created ON positions(created_at DESC);
-- Partial indexes for efficient alert queries
CREATE INDEX idx_positions_alerts ON positions(status, notifications_enabled) 
    WHERE status = 'open' AND notifications_enabled = TRUE;
CREATE INDEX idx_positions_funding_opt ON positions(status, funding_optimization_enabled) 
    WHERE status = 'open' AND funding_optimization_enabled = TRUE;

CREATE INDEX idx_snapshots_position ON position_snapshots(position_id);
CREATE INDEX idx_snapshots_dex_account ON position_snapshots(dex_account_id);
CREATE INDEX idx_snapshots_time ON position_snapshots(snapshot_at);
CREATE INDEX idx_snapshots_position_time ON position_snapshots(position_id, snapshot_at);
CREATE INDEX idx_snapshots_position_dex ON position_snapshots(position_id, dex_type);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dex_accounts_updated_at BEFORE UPDATE ON dex_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hyperliquid_orders_updated_at BEFORE UPDATE ON hyperliquid_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drift_orders_updated_at BEFORE UPDATE ON drift_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();