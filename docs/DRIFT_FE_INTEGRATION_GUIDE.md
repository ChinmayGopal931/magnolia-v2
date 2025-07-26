# Drift Frontend Integration Guide

## Important: Backend Fix Applied

The timestamp error has been fixed in the backend. The issue was that `userOrderId` was defaulting to `Date.now()` (milliseconds), which exceeded the maximum value for Drift's order ID field.

### Fix Applied:
```typescript
// OLD: const userOrderId = orderParams.userOrderId || Date.now();
// NEW: const userOrderId = orderParams.userOrderId || (Math.floor(Date.now() / 1000) % 255);
```

**Note**: `userOrderId` in Drift must be between 0-255 (u8 type). The backend now ensures this constraint is met.

## Order Placement Best Practices

### 1. Timestamp Handling

When placing orders through the delegate endpoint, avoid sending `maxTs` unless needed. If you do need to set an expiration time:

```typescript
// DON'T: Send raw JavaScript timestamps
const orderParams = {
  maxTs: Date.now(), // This will cause an error!
}

// DO: Convert to Unix timestamp (seconds) or omit entirely
const orderParams = {
  // Option 1: Don't send maxTs at all (recommended for most orders)
  // maxTs is optional and usually not needed
  
  // Option 2: If you need expiration, use seconds
  maxTs: Math.floor(Date.now() / 1000).toString(),
  
  // Option 3: For short expiration (e.g., 1 minute from now)
  maxTs: (Math.floor(Date.now() / 1000) + 60).toString(),
}
```

### 2. Order Parameters

Here's the complete interface for delegate orders:

```typescript
interface DelegateOrderParams {
  marketIndex: number;
  marketType: 'PERP' | 'SPOT';
  direction: 'long' | 'short';
  baseAssetAmount: string; // Amount in USD for perps
  orderType: 'market' | 'limit' | 'trigger_market' | 'trigger_limit' | 'oracle';
  price?: string; // Required for limit orders
  reduceOnly?: boolean;
  postOnly?: boolean;
  immediateOrCancel?: boolean;
  maxTs?: string; // Unix timestamp in SECONDS (not milliseconds!)
  triggerPrice?: string;
  triggerCondition?: 'above' | 'below';
  oraclePriceOffset?: string;
  auctionDuration?: number;
  auctionStartPrice?: string;
  auctionEndPrice?: string;
  userOrderId?: number;
}
```

### 3. Improved Frontend Code

Here's an improved version of your `placeOrder` method:

```typescript
async placeOrder(params: {
  asset: string
  direction: 'long' | 'short'
  amount: string
  leverage: number
  orderType?: 'market' | 'limit'
  price?: string
  expirationSeconds?: number // Optional: order expires after N seconds
}): Promise<PlaceOrderResult> {
  if (!this.authToken || !this.dexAccountId) {
    throw new Error('Not initialized')
  }

  // Get market index for asset
  const marketIndex = DRIFT_MARKETS[params.asset as keyof typeof DRIFT_MARKETS]
  if (marketIndex === undefined) {
    throw new Error(`Unknown asset: ${params.asset}`)
  }

  // Build order parameters
  const orderParams: DelegateOrderParams = {
    marketIndex,
    marketType: 'PERP',
    direction: params.direction,
    baseAssetAmount: params.amount, // USD amount, backend will convert
    orderType: params.orderType || 'market',
  }

  // Add price for limit orders
  if (params.orderType === 'limit' && params.price) {
    orderParams.price = params.price
    orderParams.postOnly = true // Make limit orders post-only by default
  }

  // Add expiration if specified
  if (params.expirationSeconds && params.expirationSeconds > 0) {
    // Convert to Unix timestamp in seconds
    const expirationTime = Math.floor(Date.now() / 1000) + params.expirationSeconds
    orderParams.maxTs = expirationTime.toString()
  }

  try {
    const response = await fetch(
      `${this.apiBase}/api/drift/dex-accounts/${this.dexAccountId}/orders/place-delegate`,
      {
        method: 'POST',
        headers: {
          Authorization: this.authToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderParams),
      }
    )

    const result = (await response.json()) as ApiResponse<{
      txSignature: string
      orderId?: string
      marketIndex: number
      direction: string
      amount: string
      price?: string
    }>

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || 'Failed to place order',
      }
    }

    return {
      success: true,
      data: result.data,
    }
  } catch (error) {
    console.error('Order placement error:', error)
    return {
      success: false,
      error: 'Network error while placing order',
    }
  }
}
```

### 4. Usage Examples

```typescript
// Place a market order (no expiration)
await driftService.placeOrder({
  asset: 'SOL',
  direction: 'long',
  amount: '100',
  leverage: 10,
  orderType: 'market',
})

// Place a limit order (no expiration)
await driftService.placeOrder({
  asset: 'SOL',
  direction: 'long',
  amount: '100',
  leverage: 10,
  orderType: 'limit',
  price: '150.50',
})

// Place a limit order that expires in 5 minutes
await driftService.placeOrder({
  asset: 'SOL',
  direction: 'long',
  amount: '100',
  leverage: 10,
  orderType: 'limit',
  price: '150.50',
  expirationSeconds: 300, // 5 minutes
})
```

### 5. User Order ID

The `userOrderId` field is optional but can be useful for tracking orders:

```typescript
// Valid userOrderId range: 0-255
const orderParams = {
  // ... other params
  userOrderId: 123, // Optional: must be 0-255
}
```

If you don't provide a `userOrderId`, the backend will generate one automatically.

### 6. Common Pitfalls to Avoid

1. **Don't send timestamps in milliseconds** - Always convert to seconds
2. **Don't send maxTs unless needed** - Most orders don't need expiration
3. **Validate prices on frontend** - Ensure prices are positive numbers
4. **Handle network errors** - Wrap API calls in try-catch
5. **Check order type requirements** - Limit orders need a price
6. **userOrderId must be 0-255** - If provided, ensure it's within range

### 6. Backend Fix (Optional)

If you can't update all frontend code immediately, add this safety check in the backend:

```typescript
// In drift service, before setting maxTs
if (orderParams.maxTs) {
  let maxTsValue = parseInt(orderParams.maxTs);
  
  // Auto-detect and convert milliseconds to seconds
  if (maxTsValue > 1000000000000) { // Clearly in milliseconds
    maxTsValue = Math.floor(maxTsValue / 1000);
    logger.warn('Converting maxTs from milliseconds to seconds', {
      original: orderParams.maxTs,
      converted: maxTsValue
    });
  }
  
  // Validate the timestamp is reasonable (not more than 1 year in future)
  const now = Math.floor(Date.now() / 1000);
  if (maxTsValue > now + 31536000) {
    throw new Error('Invalid maxTs: too far in the future');
  }
  
  sdkOrderParams.maxTs = new BN(maxTsValue);
}
```