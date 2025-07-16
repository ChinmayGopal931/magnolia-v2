# Frontend Integration Guide

This guide provides comprehensive documentation for frontend developers to integrate with the Magnolia V2 API for managing positions across Hyperliquid and Drift.

## Table of Contents
- [Authentication](#authentication)
- [Hyperliquid Integration](#hyperliquid-integration)
- [Drift Integration](#drift-integration)
- [Position Management](#position-management)
- [Error Handling](#error-handling)
- [Complete Examples](#complete-examples)

## Authentication

All API endpoints require authentication via wallet signature. Include the user's wallet address in the request headers.

```typescript
headers: {
  'x-wallet-address': '0x...',
  'Content-Type': 'application/json'
}
```

## Hyperliquid Integration

### 1. Setup Agent Wallet

Before placing orders on Hyperliquid, you need to set up an agent wallet.

**Endpoint:** `POST /api/hyperliquid/dex-accounts`

**Request Body:**
```typescript
{
  "address": "0x1234...abcd",           // Agent wallet address
  "accountType": "agent_wallet",        // Must be "agent_wallet" for Hyperliquid
  "agentName": "My Trading Bot",        // Optional: Human-readable name
  "encryptedPrivateKey": "encrypted...", // Encrypted private key (encrypt on frontend)
  "nonce": "1234567890",                // Current nonce from blockchain
  "metadata": {                         // Optional: Additional data
    "createdFrom": "web-app",
    "version": "1.0"
  }
}
```

**Response:**
```typescript
{
  "success": true,
  "data": {
    "id": 1,
    "userId": 123,
    "dexType": "hyperliquid",
    "address": "0x1234...abcd",
    "accountType": "agent_wallet",
    "agentName": "My Trading Bot",
    "isActive": true,
    "createdAt": "2024-01-09T12:00:00Z"
  }
}
```

### 2. Get User's Hyperliquid Accounts

**Endpoint:** `GET /api/hyperliquid/dex-accounts`

**Response:**
```typescript
{
  "success": true,
  "data": [
    {
      "id": 1,
      "address": "0x1234...abcd",
      "accountType": "agent_wallet",
      "agentName": "My Trading Bot",
      "nonce": "1234567890",
      "isActive": true
    }
  ]
}
```

### 3. Place Orders on Hyperliquid

**Endpoint:** `POST /api/hyperliquid/dex-accounts/:dexAccountId/orders`

**Request Body:**
```typescript
{
  "orders": [
    {
      // Basic Order Fields
      "asset": "BTC",                   // Symbol: "BTC", "ETH", "SOL", etc.
      "side": "buy",                    // "buy" or "sell"
      "orderType": "limit",             // "market", "limit", "trigger_market", "trigger_limit", "oracle"
      "size": "0.1",                    // Amount in base currency (e.g., 0.1 BTC)
      "price": "45000",                 // Required for limit orders
      
      // Optional Fields
      "reduceOnly": false,              // Only reduce position, don't increase
      "postOnly": true,                 // Only maker orders (add liquidity)
      "timeInForce": "Gtc",             // "Alo" (post-only), "Ioc" (immediate or cancel), "Gtc" (good till canceled)
      "clientOrderId": "0x1234...5678", // 128-bit hex string for tracking
      
      // Trigger Order Fields (for stop/take-profit)
      "triggerPrice": "44000",          // Price to trigger order
      "triggerCondition": "tp",         // "tp" (take profit) or "sl" (stop loss)
      
      // Oracle Order Fields
      "oraclePriceOffset": "50",        // Offset from oracle price in USD
      
      // Auction Fields (for better execution)
      "auctionStartPrice": "44950",     // Starting price for auction
      "auctionEndPrice": "45050",       // Ending price for auction
      "auctionDuration": 60             // Duration in slots (~30 seconds)
    }
  ],
  
  // Order Grouping
  "grouping": "na",                     // "na", "normalTpsl", "positionTpsl"
  
  // Builder Fee (optional)
  "builderFee": 10,                     // Fee in tenths of basis point (10 = 1bp)
  
  // Required Signature Fields
  "signature": "0x...",                 // Signed order data
  "nonce": "1234567891"                 // Must be > last used nonce
}
```

**Signature Generation (Frontend):**
```typescript
// Example using ethers.js
import { ethers } from 'ethers';

async function signHyperliquidOrder(wallet: ethers.Wallet, action: any, nonce: number) {
  const domain = {
    name: 'Hyperliquid',
    version: '1',
    chainId: '0xa4b1', // Arbitrum mainnet
    verifyingContract: '0x0000000000000000000000000000000000000000'
  };
  
  const types = {
    Order: [
      { name: 'action', type: 'string' },
      { name: 'nonce', type: 'uint256' }
    ]
  };
  
  const value = {
    action: JSON.stringify(action),
    nonce: nonce
  };
  
  return await wallet._signTypedData(domain, types, value);
}
```

**Response:**
```typescript
{
  "success": true,
  "data": {
    "statuses": [
      {
        "resting": {
          "oid": 12345678  // Hyperliquid order ID
        }
      }
    ]
  }
}
```

### 4. Cancel Orders

**Endpoint:** `POST /api/hyperliquid/dex-accounts/:dexAccountId/orders/cancel`

**Request Body:**
```typescript
{
  "cancels": [
    {
      "asset": "BTC",
      "orderId": "12345678"
    }
  ],
  "signature": "0x...",
  "nonce": "1234567892"
}
```

### 5. Get Orders

**Endpoint:** `GET /api/hyperliquid/dex-accounts/:dexAccountId/orders`

**Query Parameters:**
- `asset` (optional): Filter by asset (e.g., "BTC")
- `status` (optional): Filter by status ("pending", "open", "filled", "cancelled", "rejected", "failed")

**Response:**
```typescript
{
  "success": true,
  "data": [
    {
      "id": 1,
      "hlOrderId": 12345678,
      "clientOrderId": "0x1234...5678",
      "asset": "BTC",
      "side": "buy",
      "orderType": "limit",
      "price": "45000",
      "size": "0.1",
      "filledSize": "0",
      "avgFillPrice": null,
      "status": "open",
      "createdAt": "2024-01-09T12:00:00Z"
    }
  ]
}
```

## Drift Integration

### 1. Setup Drift Account

**Endpoint:** `POST /api/drift/dex-accounts`

**Request Body:**
```typescript
{
  "address": "5Xp8...7QKp",            // Solana wallet address
  "accountType": "subaccount",         // "master" or "subaccount"
  "subaccountId": 0,                   // Drift subaccount number (0-9)
  "metadata": {
    "label": "Main Trading Account"
  }
}
```

### 2. Update Drift Orders (From Frontend)

Since Drift orders are placed on the frontend, you need to sync them with the backend.

**Endpoint:** `POST /api/drift/dex-accounts/:dexAccountId/orders`

**Request Body:**
```typescript
{
  "orders": [
    {
      // Order Identifiers
      "driftOrderId": "123456",         // Drift's order ID (if available)
      "clientOrderId": "custom-001",    // Your tracking ID
      
      // Market Info
      "marketIndex": 0,                 // 0 = BTC-PERP, 1 = ETH-PERP, etc.
      "marketType": "PERP",             // "PERP" or "SPOT"
      
      // Order Details
      "direction": "long",              // "long" or "short"
      "baseAssetAmount": "0.1",         // Size in base currency
      "price": "45000",                 // Limit price (optional for market)
      
      // Fill Information
      "filledAmount": "0",              // How much has been filled
      "avgFillPrice": null,             // Average fill price
      
      // Status
      "status": "open",                 // "pending", "open", "filled", "cancelled", "rejected", "failed"
      "orderType": "limit",             // "market", "limit", "trigger_market", "trigger_limit", "oracle"
      
      // Optional Parameters
      "reduceOnly": false,
      "postOnly": true,
      "immediateOrCancel": false,
      "maxTs": "1704812400000",         // Max timestamp (expiry)
      
      // Trigger Parameters
      "triggerPrice": "44000",
      "triggerCondition": "above",      // "above" or "below"
      
      // Oracle Parameters
      "oraclePriceOffset": "50",
      
      // Auction Parameters
      "auctionDuration": 10,
      "auctionStartPrice": "44950",
      "auctionEndPrice": "45050",
      
      // Raw Parameters from Drift
      "rawParams": {
        // Include any additional Drift-specific data
      }
    }
  ]
}
```

### 3. Get Drift Orders

**Endpoint:** `GET /api/drift/dex-accounts/:dexAccountId/orders`

**Query Parameters:**
- `marketIndex` (optional): Filter by market (0, 1, 2, etc.)
- `marketType` (optional): Filter by type ("PERP" or "SPOT")
- `status` (optional): Filter by status

## Position Management

### 1. Create a Single Position (Hyperliquid)

**Endpoint:** `POST /api/hyperliquid/positions`

**Request Body:**
```typescript
{
  "name": "BTC Long Position",
  "positionType": "single",
  "legs": [
    {
      "legSide": "long",
      "orderId": 1,                     // Reference to hyperliquid_orders.id
      "entryPrice": "45000",
      "size": "0.1"
    }
  ],
  "metadata": {
    "strategy": "breakout",
    "stopLoss": "44000",
    "takeProfit": "46000"
  }
}
```

### 2. Create a Delta Neutral Position

**Endpoint:** `POST /api/drift/positions/delta-neutral`

**Request Body:**
```typescript
{
  "name": "BTC Delta Neutral Arb",
  "driftOrderId": 1,                    // Reference to drift_orders.id
  "hyperliquidOrderId": 2,              // Reference to hyperliquid_orders.id
  "metadata": {
    "strategy": "funding_arb",
    "targetSpread": "0.01",
    "rebalanceThreshold": "0.005"
  }
}
```

### 3. Get User Positions

**Endpoint:** `GET /api/hyperliquid/positions`

**Query Parameters:**
- `status` (optional): "open", "closed", "liquidated"
- `positionType` (optional): "single", "delta_neutral"

**Response:**
```typescript
{
  "success": true,
  "data": [
    {
      "id": 1,
      "userId": 123,
      "positionType": "delta_neutral",
      "name": "BTC Delta Neutral Arb",
      "status": "open",
      "totalPnl": "125.50",
      "createdAt": "2024-01-09T12:00:00Z",
      "legs": [
        {
          "id": 1,
          "legSide": "long",
          "dexType": "drift",
          "entryPrice": "45000",
          "size": "0.1",
          "currentPrice": "45200",
          "unrealizedPnl": "20",
          "order": {
            // Full order details
          }
        },
        {
          "id": 2,
          "legSide": "short",
          "dexType": "hyperliquid",
          "entryPrice": "45050",
          "size": "0.1",
          "currentPrice": "45200",
          "unrealizedPnl": "105.50",
          "order": {
            // Full order details
          }
        }
      ]
    }
  ]
}
```

### 4. Update Position

**Endpoint:** `PATCH /api/hyperliquid/positions/:positionId`

**Request Body:**
```typescript
{
  "status": "closed",                   // "open", "closed", "liquidated"
  "totalPnl": "125.50",                 // Final P&L
  "metadata": {
    "closedReason": "take_profit_hit",
    "performance": {
      "maxDrawdown": "-50",
      "winRate": "100%"
    }
  }
}
```

## Error Handling

All endpoints return errors in a consistent format:

```typescript
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid order parameters",
    "details": {
      "field": "price",
      "reason": "Price must be positive"
    }
  }
}
```

### Common Error Codes
- `UNAUTHORIZED`: Missing or invalid authentication
- `FORBIDDEN`: Access denied to resource
- `NOT_FOUND`: Resource not found
- `VALIDATION_ERROR`: Invalid request parameters
- `INTERNAL_ERROR`: Server error

## Complete Examples

### Example 1: Create a Hyperliquid Limit Order

```typescript
// 1. Setup
const dexAccountId = 1;
const wallet = new ethers.Wallet(privateKey);

// 2. Prepare order
const orderAction = {
  type: 'order',
  orders: [{
    a: 0,           // Asset index (0 = BTC)
    b: true,        // isBuy
    p: '45000',     // Price
    s: '0.1',       // Size
    r: false,       // reduceOnly
    t: { limit: { tif: 'Gtc' } }
  }],
  grouping: 'na'
};

// 3. Sign order
const nonce = Date.now();
const signature = await signHyperliquidOrder(wallet, orderAction, nonce);

// 4. Submit to API
const response = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-wallet-address': wallet.address
  },
  body: JSON.stringify({
    orders: [{
      asset: 'BTC',
      side: 'buy',
      orderType: 'limit',
      size: '0.1',
      price: '45000',
      timeInForce: 'Gtc'
    }],
    signature,
    nonce: nonce.toString()
  })
});
```

### Example 2: Create a Delta Neutral Position

```typescript
// 1. Place order on Drift (frontend)
const driftOrder = await driftClient.placePerpOrder({
  marketIndex: 0,
  direction: 'long',
  baseAssetAmount: new BN(0.1 * 1e9),
  orderType: OrderType.LIMIT,
  price: new BN(45000 * 1e6)
});

// 2. Sync Drift order to backend
await fetch(`/api/drift/dex-accounts/${driftAccountId}/orders`, {
  method: 'POST',
  body: JSON.stringify({
    orders: [{
      clientOrderId: driftOrder.orderId.toString(),
      marketIndex: 0,
      marketType: 'PERP',
      direction: 'long',
      baseAssetAmount: '0.1',
      price: '45000',
      status: 'open',
      orderType: 'limit'
    }]
  })
});

// 3. Place offsetting order on Hyperliquid
const hlResponse = await fetch(`/api/hyperliquid/dex-accounts/${hlAccountId}/orders`, {
  method: 'POST',
  body: JSON.stringify({
    orders: [{
      asset: 'BTC',
      side: 'sell',
      orderType: 'limit',
      size: '0.1',
      price: '45050'
    }],
    signature,
    nonce
  })
});

// 4. Create delta neutral position
await fetch('/api/drift/positions/delta-neutral', {
  method: 'POST',
  body: JSON.stringify({
    name: 'BTC Funding Arb',
    driftOrderId: 1,        // ID from step 2
    hyperliquidOrderId: 1,  // ID from step 3
    metadata: {
      expectedSpread: '50',
      fundingRate: '0.01%'
    }
  })
});
```

### Example 3: Monitor and Close Position

```typescript
// 1. Get position details
const position = await fetch('/api/hyperliquid/positions?status=open');

// 2. Calculate P&L (on frontend using live data)
const hlPrice = await getHyperliquidPrice('BTC');
const driftPrice = await getDriftPrice(0); // Market index 0

const hlLeg = position.legs.find(l => l.dexType === 'hyperliquid');
const driftLeg = position.legs.find(l => l.dexType === 'drift');

const hlPnl = (hlPrice - hlLeg.entryPrice) * hlLeg.size * (hlLeg.legSide === 'long' ? 1 : -1);
const driftPnl = (driftPrice - driftLeg.entryPrice) * driftLeg.size * (driftLeg.legSide === 'long' ? 1 : -1);
const totalPnl = hlPnl + driftPnl;

// 3. Close position when target reached
if (totalPnl > targetProfit) {
  await fetch(`/api/hyperliquid/positions/${position.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'closed',
      totalPnl: totalPnl.toString(),
      metadata: {
        closedAt: new Date().toISOString(),
        reason: 'target_reached'
      }
    })
  });
}
```

## WebSocket Integration (Optional)

For real-time updates, connect to WebSocket endpoints:

```typescript
// Hyperliquid WebSocket
const hlWs = new WebSocket('wss://api.hyperliquid.xyz/ws');
hlWs.send(JSON.stringify({
  method: 'subscribe',
  subscription: {
    type: 'orderUpdates',
    user: '0x...'
  }
}));

// Handle updates
hlWs.onmessage = (event) => {
  const update = JSON.parse(event.data);
  // Sync with backend
  await fetch(`/api/hyperliquid/orders/${update.oid}/sync`, {
    method: 'POST',
    body: JSON.stringify(update)
  });
};
```

## Best Practices

1. **Nonce Management**: Always increment nonce for Hyperliquid orders
2. **Error Recovery**: Implement retry logic with exponential backoff
3. **Rate Limiting**: Respect API rate limits (100 requests per minute)
4. **Position Tracking**: Regularly sync order status from both DEXs
5. **P&L Calculation**: Calculate on frontend using real-time prices
6. **Security**: Never send private keys to backend, only encrypted versions

## Testing

Use testnet endpoints for development:

```typescript
// Hyperliquid Testnet
const HYPERLIQUID_TESTNET = 'https://api.hyperliquid-testnet.xyz';

// Drift Devnet
const DRIFT_DEVNET = 'https://mainnet-beta.api.drift.trade';
```