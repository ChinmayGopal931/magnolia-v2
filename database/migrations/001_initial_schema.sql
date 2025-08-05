DO $$ BEGIN
 CREATE TYPE "account_type" AS ENUM('master', 'agent_wallet', 'subaccount');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "dex_type" AS ENUM('hyperliquid', 'drift');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "leg_side" AS ENUM('long', 'short', 'spot');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "order_side" AS ENUM('buy', 'sell');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "order_status" AS ENUM('pending', 'open', 'filled', 'cancelled', 'rejected', 'failed', 'triggered', 'marginCanceled', 'liquidatedCanceled', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "position_status" AS ENUM('open', 'closed', 'liquidated');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "position_type" AS ENUM('single', 'delta_neutral');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "wallet_type" AS ENUM('evm', 'solana');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dex_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"dex_type" "dex_type" NOT NULL,
	"address" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"encrypted_private_key" text,
	"agent_name" text,
	"subaccount_id" integer,
	"nonce" numeric(20, 0),
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drift_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"dex_account_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"drift_order_id" text,
	"client_order_id" text,
	"market_index" integer NOT NULL,
	"market_type" text NOT NULL,
	"direction" text NOT NULL,
	"base_asset_amount" numeric(30, 10) NOT NULL,
	"price" numeric(30, 10),
	"filled_amount" numeric(30, 10) DEFAULT '0',
	"avg_fill_price" numeric(30, 10),
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"order_type" text NOT NULL,
	"reduce_only" boolean DEFAULT false,
	"post_only" boolean DEFAULT false,
	"immediate_or_cancel" boolean DEFAULT false,
	"max_ts" numeric(20, 0),
	"trigger_price" numeric(30, 10),
	"trigger_condition" text,
	"oracle_price_offset" numeric(30, 10),
	"auction_duration" integer,
	"auction_start_price" numeric(30, 10),
	"auction_end_price" numeric(30, 10),
	"raw_params" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drift_orders_client_order_id_unique" UNIQUE("client_order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hyperliquid_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"dex_account_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"hl_order_id" numeric(20, 0),
	"client_order_id" text,
	"asset_symbol" text NOT NULL,
	"asset_index" integer NOT NULL,
	"side" "order_side" NOT NULL,
	"order_type" text NOT NULL,
	"price" numeric(30, 10),
	"size" numeric(30, 10) NOT NULL,
	"filled_size" numeric(30, 10) DEFAULT '0',
	"avg_fill_price" numeric(30, 10),
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"reduce_only" boolean DEFAULT false,
	"post_only" boolean DEFAULT false,
	"time_in_force" text,
	"trigger_price" numeric(30, 10),
	"trigger_condition" text,
	"oracle_price_offset" numeric(30, 10),
	"auction_start_price" numeric(30, 10),
	"auction_end_price" numeric(30, 10),
	"auction_duration" integer,
	"signature" text,
	"nonce" numeric(20, 0),
	"builder_fee" numeric(10, 4),
	"raw_response" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hyperliquid_orders_client_order_id_unique" UNIQUE("client_order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "position_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" integer NOT NULL,
	"dex_type" "dex_type" NOT NULL,
	"dex_account_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"side" "leg_side" NOT NULL,
	"entry_price" numeric(30, 10) NOT NULL,
	"current_price" numeric(30, 10) NOT NULL,
	"mark_price" numeric(30, 10),
	"liquidation_price" numeric(30, 10),
	"size" numeric(30, 10) NOT NULL,
	"notional_value" numeric(30, 10) NOT NULL,
	"hyperliquid_order_id" integer,
	"drift_order_id" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"position_type" "position_type" NOT NULL,
	"name" text NOT NULL,
	"status" "position_status" DEFAULT 'open' NOT NULL,
	"total_pnl" numeric(30, 10) DEFAULT '0',
	"closed_pnl" numeric(30, 10) DEFAULT '0',
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"funding_optimization_enabled" boolean DEFAULT false NOT NULL,
	"last_alert_sent_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_address" text NOT NULL,
	"wallet_type" "wallet_type" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_wallets_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text,
	"telegram_chat_id" text,
	"telegram_username" text,
	"telegram_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_dex_type_address" ON "dex_accounts" ("dex_type","address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_dex" ON "dex_accounts" ("user_id","dex_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_address" ON "dex_accounts" ("address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_active" ON "dex_accounts" ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drift_orders_user" ON "drift_orders" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drift_orders_account" ON "drift_orders" ("dex_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drift_orders_status" ON "drift_orders" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drift_orders_client_id" ON "drift_orders" ("client_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drift_orders_market_status" ON "drift_orders" ("market_index","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drift_orders_created" ON "drift_orders" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hl_orders_user" ON "hyperliquid_orders" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hl_orders_account" ON "hyperliquid_orders" ("dex_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hl_orders_status" ON "hyperliquid_orders" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hl_orders_client_id" ON "hyperliquid_orders" ("client_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hl_orders_asset_status" ON "hyperliquid_orders" ("asset_symbol","asset_index","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hl_orders_created" ON "hyperliquid_orders" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_position" ON "position_snapshots" ("position_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_dex_account" ON "position_snapshots" ("dex_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_time" ON "position_snapshots" ("snapshot_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_position_time" ON "position_snapshots" ("position_id","snapshot_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_position_dex" ON "position_snapshots" ("position_id","dex_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_positions_user_status" ON "positions" ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_positions_type_status" ON "positions" ("position_type","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_positions_created" ON "positions" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_positions_alerts" ON "positions" ("status","notifications_enabled") WHERE status = 'open' AND notifications_enabled = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_positions_funding_opt" ON "positions" ("status","funding_optimization_enabled") WHERE status = 'open' AND funding_optimization_enabled = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_wallets_user_id" ON "user_wallets" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_wallets_address" ON "user_wallets" ("wallet_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_wallets_primary" ON "user_wallets" ("user_id","is_primary");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dex_accounts" ADD CONSTRAINT "dex_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drift_orders" ADD CONSTRAINT "drift_orders_dex_account_id_dex_accounts_id_fk" FOREIGN KEY ("dex_account_id") REFERENCES "dex_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drift_orders" ADD CONSTRAINT "drift_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hyperliquid_orders" ADD CONSTRAINT "hyperliquid_orders_dex_account_id_dex_accounts_id_fk" FOREIGN KEY ("dex_account_id") REFERENCES "dex_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hyperliquid_orders" ADD CONSTRAINT "hyperliquid_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_dex_account_id_dex_accounts_id_fk" FOREIGN KEY ("dex_account_id") REFERENCES "dex_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_hyperliquid_order_id_hyperliquid_orders_id_fk" FOREIGN KEY ("hyperliquid_order_id") REFERENCES "hyperliquid_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_drift_order_id_drift_orders_id_fk" FOREIGN KEY ("drift_order_id") REFERENCES "drift_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
