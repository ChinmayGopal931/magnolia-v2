# Hyperliquid Spot Trading Guide

This guide explains how to use the Hyperliquid spot trading features in Magnolia V2.

## Overview

Hyperliquid supports both perpetual futures and spot trading. Spot assets use a different asset ID scheme:
- Perpetual assets: Use the asset ID directly (e.g., BTC = 3, ETH = 4)
- Spot assets: Use 10000 + index from spotMeta universe

**Important Note**: On testnet, only PURR/USDC (index 0) is canonical and tradeable. Other pairs shown in the metadata are non-canonical (marked with @ symbol) and cannot be traded.

## API Endpoints

### 1. Get Spot Metadata
Fetch available spot trading pairs and their details.

```bash
GET /api/hyperliquid/dex-accounts/{dexAccountId}/spot/metadata
```

Response:
```json
{
  "success": true,
  "data": {
    "canonicalPairs": [
      {
        "index": 0,
        "assetId": 10000,
        "name": "PURR/USDC",
        "baseToken": "PURR",
        "quoteToken": "USDC",
        "isCanonical": true
      }
    ],
    "totalPairs": 200,
    "tokens": [
      {
        "index": 0,
        "name": "USDC",
        "szDecimals": 8,
        "weiDecimals": 8,
        "isCanonical": true
      },
      {
        "index": 1,
        "name": "PURR",
        "szDecimals": 0,
        "weiDecimals": 5,
        "isCanonical": true
      }
    ],
    "note": "On testnet, only PURR/USDC is canonical (tradeable). Other pairs marked with @ are non-canonical."
  }
}
```

### 2. Place Spot Orders
Buy or sell spot assets.

```bash
POST /api/hyperliquid/dex-accounts/{dexAccountId}/spot/orders
```

Request Body:
```json
{
  "orders": [
    {
      "asset": "PURR/USDC",
      "side": "buy",
      "orderType": "limit",
      "size": "100",
      "price": "0.5",
      "postOnly": true
    }
  ]
}
```

### 3. Get Spot Balances
Check your spot asset balances.

```bash
GET /api/hyperliquid/dex-accounts/{dexAccountId}/spot/balances
```

Response:
```json
{
  "success": true,
  "data": {
    "balances": [
      {
        "coin": "PURR",
        "hold": "0",
        "token": "PURR",
        "total": "1000"
      },
      {
        "coin": "USDC",
        "hold": "50",
        "token": "USDC",
        "total": "500"
      }
    ]
  }
}
```

### 4. Get Spot Orders
View your spot orders.

```bash
GET /api/hyperliquid/dex-accounts/{dexAccountId}/spot/orders?status=open
```

Query Parameters:
- `asset`: Filter by asset pair (e.g., "PURR/USDC")
- `status`: Filter by order status (open, filled, cancelled)
- `includeApiOrders`: Include orders from Hyperliquid API

## Examples

### Buy PURR with USDC (Limit Order)
```javascript
const response = await fetch('/api/hyperliquid/dex-accounts/123/spot/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    orders: [{
      asset: 'PURR/USDC',
      side: 'buy',
      orderType: 'limit',
      size: '100',    // Buy 100 PURR
      price: '0.5',   // At 0.5 USDC per PURR
      postOnly: true  // Maker order only
    }]
  })
});
```

### Sell PURR for USDC (Market Order)
```javascript
const response = await fetch('/api/hyperliquid/dex-accounts/123/spot/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    orders: [{
      asset: 'PURR/USDC',
      side: 'sell',
      orderType: 'market',
      size: '50'     // Sell 50 PURR at market price
    }]
  })
});
```

## Important Notes

1. **Asset Format**: Spot assets are specified as pairs (e.g., "PURR/USDC"). The API will automatically handle the conversion to Hyperliquid's spot asset ID format.

2. **Market Orders**: Market orders use IOC (Immediate or Cancel) limit orders with aggressive pricing to simulate market execution.

3. **Order Types**:
   - `limit`: Standard limit order
   - `market`: Market order (executed as IOC limit order)

4. **Time in Force** (for limit orders):
   - `Gtc`: Good til canceled (default)
   - `Alo`: Add liquidity only (post-only)
   - `Ioc`: Immediate or cancel

5. **Balances**: Spot balances are separate from perpetual margin. Make sure you have sufficient balance in the spot token you're trading.

## Error Handling

Common errors:
- `Invalid asset`: The spot pair is not supported
- `Insufficient balance`: Not enough tokens to execute the trade
- `Price too far from market`: Limit price is more than 80% away from current market price

## Testing on Testnet

Currently, only PURR/USDC is available for spot trading on testnet. Use the metadata endpoint to check for any updates to available pairs.

## Technical Details

- Spot asset IDs are calculated as: `10000 + universe_index`
- PURR/USDC has index 0, so its asset ID is 10000
- The spot metadata contains both canonical (tradeable) and non-canonical pairs
- Token information includes decimals for both size (szDecimals) and wei (weiDecimals)