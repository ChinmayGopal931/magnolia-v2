-- Insert initial DEX configurations
INSERT INTO dex_configs (name, chain, api_endpoint, websocket_endpoint, config_json) VALUES
(
    'drift',
    'solana',
    'https://api.mainnet-beta.solana.com',
    'wss://api.mainnet-beta.solana.com',
    '{
        "program_id": "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
        "env": "mainnet-beta",
        "commitment": "processed",
        "perp_market_indexes": [],
        "spot_market_indexes": []
    }'::jsonb
),
(
    'hyperliquid',
    'hyperliquid_l1',
    'https://api.hyperliquid.xyz',
    'wss://api.hyperliquid.xyz/ws',
    '{
        "chain": "Mainnet",
        "signature_chain_id": "0xa4b1",
        "max_decimals": 6,
        "spot_offset": 10000
    }'::jsonb
);

-- Optional: Insert test configurations for development
-- Uncomment these lines to add testnet configurations
/*
INSERT INTO dex_configs (name, chain, api_endpoint, websocket_endpoint, is_active, config_json) VALUES
(
    'drift_testnet',
    'solana',
    'https://api.devnet.solana.com',
    'wss://api.devnet.solana.com',
    false,
    '{
        "program_id": "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
        "env": "devnet",
        "commitment": "processed"
    }'::jsonb
),
(
    'hyperliquid_testnet',
    'hyperliquid_l1',
    'https://api.hyperliquid-testnet.xyz',
    'wss://api.hyperliquid-testnet.xyz/ws',
    false,
    '{
        "chain": "Testnet",
        "signature_chain_id": "0xa4b1",
        "max_decimals": 6,
        "spot_offset": 10000
    }'::jsonb
);
*/