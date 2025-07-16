# Authentication Examples

## 1. Main User Authentication

```typescript
import { ethers } from 'ethers';

async function authenticateUser() {
  // Connect to wallet (MetaMask, etc.)
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  
  // Generate timestamp (Unix timestamp in seconds)
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  // Create message to sign
  const message = `Authenticate to Magnolia\nAddress: ${address}\nTimestamp: ${timestamp}`;
  
  // Sign the message
  const signature = await signer.signMessage(message);
  
  // Create auth header
  const authHeader = `Bearer ${address}:${signature}:${timestamp}`;
  
  // Use in your API calls
  const response = await fetch('http://localhost:3000/api/hyperliquid/dex-accounts', {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    }
  });
}
```

## 2. Register Hyperliquid Agent Wallet

```typescript
async function registerHyperliquidWallet(authHeader: string) {
  const response = await fetch('http://localhost:3000/api/hyperliquid/dex-accounts', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      address: '0xYourAgentWalletAddress',
      accountType: 'agent_wallet',
      agentName: 'My Trading Bot',
      // Optional: encrypted private key if you want server to sign
      encryptedPrivateKey: 'encrypted_key_here',
      metadata: {
        description: 'Main trading wallet'
      }
    })
  });
  
  const result = await response.json();
  return result.data; // Returns the created dex_account
}
```

## 3. Register Drift Account

```typescript
async function registerDriftAccount(authHeader: string) {
  const response = await fetch('http://localhost:3000/api/drift/dex-accounts', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      address: '0xYourDriftWalletAddress',
      accountType: 'subaccount',
      subaccountId: 0, // Your drift subaccount ID
      metadata: {
        description: 'Drift trading account'
      }
    })
  });
  
  const result = await response.json();
  return result.data;
}
```

## 4. Place Order on Hyperliquid

```typescript
async function placeHyperliquidOrder(authHeader: string, dexAccountId: number) {
  // First, prepare the order for signing
  const orderRequest = {
    orders: [{
      asset: 'BTC-USD',
      side: 'buy',
      size: '0.01',
      price: '50000',
      orderType: 'limit',
      reduceOnly: false,
      postOnly: true,
      clientOrderId: `order_${Date.now()}`
    }],
    grouping: 'na'
  };
  
  // The server will handle signing if you provided encrypted private key
  // Otherwise, you need to sign on frontend and include signature
  
  const response = await fetch(`http://localhost:3000/api/hyperliquid/dex-accounts/${dexAccountId}/orders`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(orderRequest)
  });
  
  return await response.json();
}
```

## 5. Sync Drift Order (after placing on frontend)

```typescript
async function syncDriftOrder(authHeader: string, dexAccountId: number) {
  // After placing order on Drift frontend/SDK
  const driftOrderData = {
    driftOrderId: 'drift_order_123',
    clientOrderId: `client_${Date.now()}`,
    marketIndex: 0,
    marketType: 'PERP',
    direction: 'long',
    baseAssetAmount: '1000000', // 1 unit in Drift's base units
    price: '50000',
    status: 'open',
    orderType: 'limit',
    postOnly: true
  };
  
  const response = await fetch(`http://localhost:3000/api/drift/dex-accounts/${dexAccountId}/orders`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      orders: [driftOrderData]
    })
  });
  
  return await response.json();
}
```

## Authentication Flow Summary:

1. **User connects wallet** (MetaMask, etc.)
2. **User signs authentication message** with their main wallet
3. **All API calls include the auth header** with address:signature:timestamp
4. **User registers DEX accounts** (Hyperliquid agent wallets, Drift subaccounts)
5. **User performs operations** on specific DEX accounts using the dexAccountId

## Security Notes:

- Signatures expire after 5 minutes to prevent replay attacks
- Each user can only access their own DEX accounts
- Private keys should be encrypted before sending to server
- The server verifies ownership on every request