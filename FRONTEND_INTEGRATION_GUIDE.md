# Frontend Integration Guide for Magnolia V2

## Table of Contents
1. [Environment Configuration](#environment-configuration)
2. [Authentication Setup](#authentication-setup)
3. [Hyperliquid Integration Flow](#hyperliquid-integration-flow)
4. [Drift Integration Flow](#drift-integration-flow)
5. [Delta Neutral Positions](#delta-neutral-positions)
6. [API Types & Interfaces](#api-types--interfaces)
7. [Missing Functionality & Recommendations](#missing-functionality--recommendations)

---

## Environment Configuration

### Network Selection
The backend supports both testnet and mainnet environments, controlled by the `NETWORK_ENV` environment variable.

```typescript
// Get current configuration
const response = await fetch('/api/config');
const config: ConfigResponse = await response.json();

// Response type:
interface ConfigResponse {
  success: boolean;
  data: {
    environment: 'testnet' | 'mainnet';
    isTestnet: boolean;
    hyperliquid: {
      apiUrl: string;
      webAppUrl: string;
      chain: 'Testnet' | 'Mainnet';
    };
    drift: {
      programId: string;
      rpcUrl: string;
      dataApiUrl: string;
      env: 'devnet' | 'mainnet-beta';
      webAppUrl: string;
    };
  };
}
```

### Testnet Configuration
- **Hyperliquid Testnet**: https://app.hyperliquid-testnet.xyz
- **Drift Devnet**: Uses Solana devnet
- **Default RPC**: Provided by configuration endpoint

### Initializing SDKs

#### Drift SDK
```typescript
// Get SDK configuration
const configResponse = await fetch('/api/config/drift-sdk');
const sdkConfig: DriftSDKConfigResponse = await configResponse.json();

// Response type:
interface DriftSDKConfigResponse {
  success: boolean;
  data: {
    env: 'devnet' | 'mainnet-beta';
    programID: string;
    provider: {
      connection: {
        rpcEndpoint: string;
      };
    };
  };
}

// Initialize Drift client
const driftClient = new DriftClient({
  connection: new Connection(sdkConfig.data.provider.connection.rpcEndpoint),
  wallet,
  env: sdkConfig.data.env,
  programID: new PublicKey(sdkConfig.data.programID)
});
```

#### Hyperliquid Configuration
```typescript
// Get Hyperliquid config
const hlConfig = await fetch('/api/config/hyperliquid');
const response: HyperliquidConfigResponse = await hlConfig.json();

// Response type:
interface HyperliquidConfigResponse {
  success: boolean;
  data: {
    apiUrl: string;
    webAppUrl: string;
    chain: 'Testnet' | 'Mainnet';
    signatureChainId: string;
  };
}

// Use config for API calls
const hlApiUrl = response.data.apiUrl;
const chain = response.data.chain;
```

---

## Authentication Setup

### Prerequisites
- User must have a wallet (Phantom for Drift, any EVM wallet for Hyperliquid)
- Backend expects authentication token in request headers

### Initial Setup
1. **Connect Wallet**
   ```typescript
   // For Phantom (Solana/Drift)
   const provider = window.phantom?.solana;
   const resp = await provider.connect();
   const walletAddress: string = resp.publicKey.toString();
   
   // For EVM wallets (Hyperliquid)
   const accounts: string[] = await window.ethereum.request({ 
     method: 'eth_requestAccounts' 
   });
   const walletAddress: string = accounts[0];
   ```

2. **Authenticate with Backend**
   ```typescript
   // Generate timestamp (Unix timestamp in seconds)
   const timestamp: number = Math.floor(Date.now() / 1000);
   
   // Create the exact message format expected by backend
   const message: string = `Authenticate to Magnolia\nAddress: ${walletAddress}\nTimestamp: ${timestamp}`;
   
   // Sign the message
   let signature: string;
   if (isEVM) {
     // For Hyperliquid (EVM)
     signature = await window.ethereum.request({
       method: 'personal_sign',
       params: [message, walletAddress]
     });
   } else {
     // For Drift (Solana)
     const encodedMessage = new TextEncoder().encode(message);
     const signatureUint8Array = await provider.signMessage(encodedMessage);
     signature = Buffer.from(signatureUint8Array).toString('hex');
   }
   
   // Create authorization header (no login endpoint needed)
   const authHeader: string = `Bearer ${walletAddress}:${signature}:${timestamp}`;
   
   // Use this header for all subsequent requests
   const headers: HeadersInit = {
     'Authorization': authHeader,
     'Content-Type': 'application/json'
   };
   ```

3. **Making Authenticated Requests**
   ```typescript
   // Example: Fetch DEX accounts
   const response = await fetch('/api/hyperliquid/dex-accounts', {
     headers: {
       'Authorization': authHeader
     }
   });
   
   const accounts: DexAccountsResponse = await response.json();
   
   // Response type:
   interface DexAccount {
     id: number;
     userId: number;
     dexType: 'hyperliquid' | 'drift';
     address: string;
     accountType: 'master' | 'agent_wallet' | 'subaccount';
     agentName?: string;
     encryptedPrivateKey?: string;
     subaccountId?: number;
     nonce?: string;
     isActive: boolean;
     metadata?: any;
     createdAt: string;
     updatedAt: string;
   }
   
   interface DexAccountsResponse {
     success: boolean;
     data: DexAccount[];
   }
   
   // The backend will verify the signature and create/retrieve the user automatically
   ```

4. **Authentication Notes**
   - No login endpoint exists - authentication happens via header validation
   - Auth is valid for 5 minutes from the timestamp
   - Backend automatically creates new users on first valid authentication
   - Re-authenticate by signing a new message with current timestamp

---

## Hyperliquid Integration Flow

### IMPORTANT: Agent Wallet Creation Requirements

For Hyperliquid agent wallet creation to work correctly:

1. **Use EIP-712 typed data signing** (not simple message signing)
2. **Signature must be in {r, s, v} format** (not hex string)
3. **Chain ID must be 0x66eee (421614)** for testnet, 0xa4b1 (42161) for mainnet
4. **The agent address can be generated by frontend OR backend**

⚠️ **Common Error**: "Do not know how to serialize a BigInt"
- This occurs when using `BigInt` for the nonce in the EIP-712 message
- Solution: Use regular `Number` type for nonce, not `BigInt`

⚠️ **Common Error**: "Must deposit before performing actions. User: 0x..."
- This occurs when the signature verification recovers a different address
- Usually means the signed message doesn't match what Hyperliquid expects
- Solution: Use Method 1 (Frontend-Generated) to ensure the agent address in the signature matches

#### Complete Working Example:

### 1. Initial Account Setup

#### Check Existing Accounts
```typescript
const response = await fetch('/api/hyperliquid/dex-accounts', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const accounts: DexAccountsResponse = await response.json();
```

#### Create Agent Wallet (Required for Trading)

There are two methods to create an agent wallet:

**Method 1: Frontend-Generated Agent Wallet (Recommended)**
```typescript
// Step 1: Generate agent wallet on frontend
import { ethers } from 'ethers';

const agentWallet = ethers.Wallet.createRandom();
const agentAddress: string = agentWallet.address;
const agentPrivateKey: string = agentWallet.privateKey;
const agentName: string = 'MyTradingAgent';
const nonce: number = Date.now();

// Step 2: Sign approval using EIP-712 typed data
const domain: ethers.TypedDataDomain = {
  name: 'HyperliquidSignTransaction',
  version: '1',
  chainId: parseInt('0x66eee', 16), // 421614 for testnet, 0xa4b1 for mainnet
  verifyingContract: '0x0000000000000000000000000000000000000000'
};

const types = {
  'HyperliquidTransaction:ApproveAgent': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'agentAddress', type: 'address' },
    { name: 'agentName', type: 'string' },
    { name: 'nonce', type: 'uint64' }
  ]
};

const value = {
  hyperliquidChain: 'Testnet' as 'Testnet' | 'Mainnet',
  agentAddress: agentAddress,
  agentName: agentName,
  nonce: Number(nonce)
};

// Sign using EIP-712
const signature: string = await wallet._signTypedData(domain, types, value);
// Convert hex signature to {r, s, v} format
const sig = ethers.utils.splitSignature(signature);

// Request type:
interface CreateAgentWalletRequest {
  action: 'create_and_approve';
  masterAddress: string;
  agentName: string;
  agentAddress?: string;
  agentPrivateKey?: string;
  signature: {
    r: string;
    s: string;
    v: number;
  };
  nonce: string;
  actionData?: any;
  metadata?: any;
}

// Step 3: Submit to backend with generated wallet details
const requestBody: CreateAgentWalletRequest = {
  action: 'create_and_approve',
  masterAddress: walletAddress,
  agentName,
  agentAddress: agentAddress,
  agentPrivateKey: agentPrivateKey,
  signature: {
    r: sig.r,
    s: sig.s,
    v: sig.v
  },
  nonce: nonce.toString()
};

const response = await fetch('/api/hyperliquid/dex-accounts', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(requestBody)
});

const result: CreateAgentWalletResponse = await response.json();

// Response type:
interface CreateAgentWalletResponse {
  success: boolean;
  data: {
    id: number;
    address: string;
    accountType: 'agent_wallet';
    agentName: string;
    isActive: boolean;
    createdAt: string;
  };
}
```

**Method 2: Backend-Generated Agent Wallet (Legacy)**
```javascript
// If not providing agentAddress and agentPrivateKey,
// the backend will generate them automatically.
// Note: This requires signing with a placeholder address which may cause issues.

const response = await fetch('/api/hyperliquid/dex-accounts', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    action: 'create_and_approve',
    masterAddress: walletAddress,
    agentName,
    // agentAddress and agentPrivateKey omitted - backend will generate
    signature: {
      r: sig.r,
      s: sig.s,
      v: sig.v
    },
    nonce: nonce.toString()
  })
});
```

### 2. Depositing Funds to Hyperliquid

**Process:**
1. User deposits directly on Hyperliquid L1 using their wallet
2. Once transaction is confirmed, record it in backend

```typescript
// Request type:
interface RecordDepositRequest {
  amount: string;
  tokenSymbol: string;
  txHash: string;
  fromAddress: string;
}

// After successful L1 deposit transaction
const depositRequest: RecordDepositRequest = {
  amount: '1000', // Amount in token units
  tokenSymbol: 'USDC',
  txHash: '0x123...', // L1 transaction hash
  fromAddress: walletAddress
};

const response = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/deposits`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(depositRequest)
});

const result: DepositResponse = await response.json();

// Response type:
interface DepositResponse {
  success: boolean;
  data: {
    success: boolean;
    transactionId: number;
    txHash: string;
    amount: string;
    tokenSymbol: string;
  };
}
```

### 3. Trading on Hyperliquid

#### Place Order
```typescript
// Request types:
interface PlaceOrderRequest {
  orders: Array<{
    asset: string;
    side: 'buy' | 'sell';
    orderType: 'market' | 'limit' | 'trigger_market' | 'trigger_limit' | 'oracle';
    size: string;
    price?: string;
    reduceOnly?: boolean;
    postOnly?: boolean;
    timeInForce?: 'Alo' | 'Ioc' | 'Gtc';
    triggerPrice?: string;
    triggerCondition?: 'tp' | 'sl';
    oraclePriceOffset?: string;
    auctionStartPrice?: string;
    auctionEndPrice?: string;
    auctionDuration?: number;
    clientOrderId?: string;
  }>;
  grouping?: string;
  builderFee?: number;
  signature?: string;
  nonce?: string;
}

// Step 1: Construct order parameters
const orderParams: PlaceOrderRequest = {
  orders: [{
    asset: '0', // SOL-PERP
    side: 'buy',
    orderType: 'limit',
    size: '1.5',
    price: '100.50',
    reduceOnly: false,
    postOnly: true,
    clientOrderId: generateClientOrderId()
  }],
  grouping: 'na',
  builderFee: 0
};

// Step 2: Sign order (using Hyperliquid SDK or custom implementation)
const signature: string = await signHyperliquidOrder(orderParams, wallet);
const nonce: string = Date.now().toString();

// Step 3: Submit order
const response = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    ...orderParams,
    signature,
    nonce
  })
});

const orderResult: OrderResponse = await response.json();

// Response type:
interface OrderResponse {
  success: boolean;
  data: {
    response: {
      type: string;
      data: {
        statuses: Array<{
          error?: string;
          filled?: any;
          resting?: any;
        }>;
      };
    };
  };
}
```

#### Monitor Orders
```typescript
// Get open orders
const ordersResponse = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders?status=open`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const orders: OrdersResponse = await ordersResponse.json();

// Response type:
interface HyperliquidOrder {
  id: number;
  dexAccountId: number;
  userId: number;
  clientOrderId?: string;
  asset: string;
  side: 'buy' | 'sell';
  orderType: string;
  price?: string;
  size: string;
  status: 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired';
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
  createdAt: string;
  updatedAt: string;
}

interface OrdersResponse {
  success: boolean;
  data: HyperliquidOrder[];
}

// Get fills/trades
const fillsResponse = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/fills?limit=50`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const fills: OrdersResponse = await fillsResponse.json(); // Fills are returned as filled orders
```

#### Cancel Orders
```typescript
// Cancel by order ID
interface CancelOrderRequest {
  cancels: Array<{
    asset: string;
    orderId: string;
  }>;
  signature?: string;
  nonce?: string;
}

const cancelRequest: CancelOrderRequest = {
  cancels: [{ asset: '0', orderId: '12345' }],
  signature,
  nonce
};

await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders/cancel`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(cancelRequest)
});

// Cancel by client order ID
interface CancelByCloidRequest {
  cancels: Array<{
    asset: string;
    cloid: string;
  }>;
  signature?: string;
  nonce?: string;
}

const cancelByCloidRequest: CancelByCloidRequest = {
  cancels: [{ asset: '0', cloid: clientOrderId }],
  signature,
  nonce
};

await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders/cancel-by-cloid`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(cancelByCloidRequest)
});
```

### 4. Position Management

#### Create Position
```typescript
// Request type:
interface CreatePositionRequest {
  name: string;
  positionType: 'single' | 'delta_neutral';
  snapshots: Array<{
    orderId: number;
    symbol: string;
    side: 'long' | 'short';
    entryPrice: string;
    size: string;
  }>;
  metadata?: any;
}

const createPositionRequest: CreatePositionRequest = {
  name: 'SOL Long Position',
  positionType: 'single',
  snapshots: [{
    orderId: 123,
    symbol: 'SOL-PERP',
    side: 'long',
    entryPrice: '100.50',
    size: '1.5'
  }]
};

const response = await fetch('/api/hyperliquid/positions', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(createPositionRequest)
});

const position: PositionResponse = await response.json();

// Response type:
interface PositionSnapshot {
  id: number;
  positionId: number;
  dexType: 'hyperliquid' | 'drift';
  dexAccountId: number;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: string;
  currentPrice: string;
  size: string;
  notionalValue: string;
  pnl?: string;
  pnlPercentage?: string;
  fundingPayments?: string;
  hyperliquidOrderId?: number;
  driftOrderId?: number;
  metadata?: any;
  snapshotAt: string;
  createdAt: string;
  updatedAt: string;
}

interface Position {
  id: number;
  userId: number;
  positionType: 'single' | 'delta_neutral';
  name: string;
  status: 'open' | 'closed' | 'liquidated';
  totalPnl?: string;
  metadata?: any;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  snapshots: PositionSnapshot[];
}

interface PositionResponse {
  success: boolean;
  data: Position;
}
```

#### Monitor Positions
```typescript
const positionsResponse = await fetch('/api/hyperliquid/positions?status=open', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const positions: PositionsResponse = await positionsResponse.json();

// Response type:
interface PositionsResponse {
  success: boolean;
  data: Position[]; // Array of Position objects as defined above
}
```

### 5. Withdrawing from Hyperliquid

```typescript
// Request type:
interface RecordWithdrawalRequest {
  amount: string;
  tokenSymbol: string;
  txHash: string;
  destinationAddress: string;
  nonce: string;
  signature: string;
}

// After successful L1 withdrawal transaction
const withdrawalRequest: RecordWithdrawalRequest = {
  amount: '1000',
  tokenSymbol: 'USDC',
  txHash: '0x456...', // L1 transaction hash
  destinationAddress: walletAddress,
  nonce: nonce.toString(),
  signature: withdrawalSignature
};

const response = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/withdrawals`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(withdrawalRequest)
});

const result: WithdrawalResponse = await response.json();

// Response type:
interface WithdrawalResponse {
  success: boolean;
  data: {
    success: boolean;
    transactionId: number;
    txHash: string;
    amount: string;
    tokenSymbol: string;
  };
}
```

### 6. Transaction History

```typescript
// Get deposit/withdrawal history
const transactionsResponse = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/transactions?type=deposit&limit=50`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const transactions: TransactionHistoryResponse = await transactionsResponse.json();

// Response type:
interface Transaction {
  id: number;
  type: 'deposit' | 'withdrawal';
  tokenSymbol: string;
  amount: string;
  txHash: string;
  timestamp: string;
  destinationAddress?: string;
  fromAddress?: string;
}

interface TransactionHistoryResponse {
  success: boolean;
  data: Transaction[];
}
```

---

## Drift Integration Flow

### 1. Initial Account Setup

#### Create Drift Account
```typescript
// Request type:
interface CreateDriftAccountRequest {
  address: string;
  accountType: 'master' | 'subaccount';
  subaccountId?: number;
  metadata?: any;
}

const createAccountRequest: CreateDriftAccountRequest = {
  address: walletAddress,
  accountType: 'master',
  subaccountId: 0
};

const response = await fetch('/api/drift/dex-accounts', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(createAccountRequest)
});

const account: CreateDriftAccountResponse = await response.json();

// Response type:
interface CreateDriftAccountResponse {
  success: boolean;
  data: DexAccount; // Same DexAccount type as defined above
}
```

### 2. Depositing to Drift

**Process:**
1. Frontend uses Drift SDK to execute deposit
2. Record transaction in backend after confirmation

**Frontend Implementation:**
```javascript
import { DriftClient } from '@drift-labs/sdk';

// Initialize Drift client
const driftClient = new DriftClient({
  connection,
  wallet,
  env: 'mainnet-beta'
});

// Execute deposit
const marketIndex = 0; // USDC
const amount = driftClient.convertToSpotPrecision(marketIndex, 100);
const tx = await driftClient.deposit(
  amount,
  marketIndex,
  userTokenAccount
);

// Request type:
interface RecordDriftDepositRequest {
  marketIndex: number;
  amount: string;
  tokenSymbol: string;
  txSignature: string;
  tokenMint?: string;
}

// Track in backend
const depositRequest: RecordDriftDepositRequest = {
  marketIndex: 0,
  amount: '100',
  tokenSymbol: 'USDC',
  txSignature: tx.signature,
  tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC mint
};

await fetch(`/api/drift/dex-accounts/${dexAccountId}/deposits`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(depositRequest)
});

// Response is same as Hyperliquid DepositResponse
```

### 3. Withdrawing from Drift

```javascript
// Execute withdrawal using Drift SDK
const tx = await driftClient.withdraw(
  amount,
  marketIndex,
  destinationTokenAccount
);

// Request type:
interface RecordDriftWithdrawalRequest {
  marketIndex: number;
  amount: string;
  tokenSymbol: string;
  txSignature: string;
  destinationAddress: string;
}

// Track in backend
const withdrawalRequest: RecordDriftWithdrawalRequest = {
  marketIndex: 0,
  amount: '100',
  tokenSymbol: 'USDC',
  txSignature: tx.signature,
  destinationAddress: destinationTokenAccount.toString()
};

await fetch(`/api/drift/dex-accounts/${dexAccountId}/withdrawals`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(withdrawalRequest)
});

// Response is same as Hyperliquid WithdrawalResponse
```

### 4. Trading on Drift

**Note**: Drift orders are placed on frontend, then synced to backend.

#### Update Orders After Placing
```javascript
// Place order using Drift SDK on frontend
const orderTx = await driftClient.placePerpOrder({
  marketIndex: 0,
  orderType: 'limit',
  direction: 'long',
  baseAssetAmount: amount,
  price: price
});

// Request type:
interface UpdateDriftOrdersRequest {
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
    status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected' | 'failed';
    orderType: 'market' | 'limit' | 'trigger_market' | 'trigger_limit' | 'oracle';
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
  }>;
}

// Sync with backend
const updateOrdersRequest: UpdateDriftOrdersRequest = {
  orders: [{
    driftOrderId: orderTx.orderId,
    marketIndex: 0,
    marketType: 'PERP',
    direction: 'long',
    baseAssetAmount: '1.5',
    price: '100.50',
    status: 'open',
    orderType: 'limit'
  }]
};

await fetch(`/api/drift/dex-accounts/${dexAccountId}/orders`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(updateOrdersRequest)
});

// Response type:
interface DriftOrder {
  id: number;
  dexAccountId: number;
  userId: number;
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
  createdAt: string;
  updatedAt: string;
}

interface UpdateDriftOrdersResponse {
  success: boolean;
  data: DriftOrder[];
}
```

#### Get Orders
```typescript
const ordersResponse = await fetch(`/api/drift/dex-accounts/${dexAccountId}/orders?marketIndex=0&status=open`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const orders: GetDriftOrdersResponse = await ordersResponse.json();

// Response type:
interface GetDriftOrdersResponse {
  success: boolean;
  data: DriftOrder[]; // Array of DriftOrder objects as defined above
}
```

### 5. Transaction History

```typescript
// Get deposit/withdrawal history
const transactionsResponse = await fetch(`/api/drift/dex-accounts/${dexAccountId}/transactions?type=deposit&limit=50`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const transactions: DriftTransactionHistoryResponse = await transactionsResponse.json();

// Response type:
interface DriftTransaction {
  id: number;
  type: 'deposit' | 'withdrawal';
  tokenSymbol: string;
  amount: string;
  txSignature: string;
  marketIndex: number;
  timestamp: string;
  destinationAddress?: string;
}

interface DriftTransactionHistoryResponse {
  success: boolean;
  data: DriftTransaction[];
}
```

---

## Delta Neutral Positions

### Creating Cross-Exchange Delta Neutral Position

1. **Place Orders on Both Exchanges**
```javascript
// Place long on Drift
const driftOrder = await placeDriftOrder(/* ... */);

// Place short on Hyperliquid
const hlOrder = await placeHyperliquidOrder(/* ... */);
```

2. **Create Delta Neutral Position**
```typescript
// Request type:
interface CreateDeltaNeutralPositionRequest {
  name: string;
  driftOrderId: number;
  hyperliquidOrderId: number;
  metadata?: any;
}

const createDeltaNeutralRequest: CreateDeltaNeutralPositionRequest = {
  name: 'ETH Delta Neutral',
  driftOrderId: driftOrder.id,
  hyperliquidOrderId: hlOrder.id,
  metadata: {
    strategy: 'funding_arbitrage',
    targetSize: '10'
  }
};

const response = await fetch('/api/drift/positions/delta-neutral', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(createDeltaNeutralRequest)
});

const deltaNeutralPosition: PositionResponse = await response.json();
// Response uses same Position type as defined above
```

3. **Monitor Position**
```javascript
// Get all positions including snapshots
const positions = await fetch('/api/hyperliquid/positions?positionType=delta_neutral');

// Position will include snapshots from both exchanges
```

---

## API Types & Interfaces

### Common Types

```typescript
// API Response wrapper
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Request context (set by auth middleware)
interface RequestContext {
  userId?: number;
  walletAddress?: string;
  timestamp?: number;
}

// Error codes
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_REQUEST = 'INVALID_REQUEST',
}
```

### Route Structure

The API follows RESTful conventions with the following route structure:

#### Hyperliquid Routes
```
/api/hyperliquid/
├── dex-accounts/
│   ├── GET    /                                    # Get user's DEX accounts
│   ├── POST   /                                    # Create/update DEX account
│   ├── GET    /:dexAccountId/orders               # Get orders
│   ├── POST   /:dexAccountId/orders               # Place orders
│   ├── POST   /:dexAccountId/orders/cancel        # Cancel orders
│   ├── POST   /:dexAccountId/orders/cancel-by-cloid # Cancel by client order ID
│   ├── GET    /:dexAccountId/fills                # Get fills/trades
│   ├── POST   /:dexAccountId/deposits             # Record deposit
│   ├── POST   /:dexAccountId/withdrawals          # Record withdrawal
│   └── GET    /:dexAccountId/transactions         # Get transaction history
└── positions/
    ├── GET    /                                    # Get positions
    ├── POST   /                                    # Create position
    └── PATCH  /:positionId                         # Update position
```

#### Drift Routes
```
/api/drift/
├── dex-accounts/
│   ├── GET    /                                    # Get user's DEX accounts
│   ├── POST   /                                    # Create/update DEX account
│   ├── GET    /:dexAccountId/orders               # Get orders
│   ├── POST   /:dexAccountId/orders               # Update orders
│   ├── POST   /:dexAccountId/deposits             # Record deposit
│   ├── POST   /:dexAccountId/withdrawals          # Record withdrawal
│   └── GET    /:dexAccountId/transactions         # Get transaction history
└── positions/
    └── POST   /delta-neutral                       # Create delta neutral position
```

---

## Missing Functionality & Recommendations

### Recently Added Features ✅

1. **Deposit/Withdrawal Tracking**
   - ✅ Endpoints for recording deposits/withdrawals
   - ✅ Transaction history endpoints
   - ⚠️ Still need balance tracking functionality

2. **Real-time Price/Funding Data**
   - No endpoints for market data
   - No funding rate tracking
   - Missing oracle price feeds

3. **Position Analytics**
   - No PnL calculation endpoints
   - Missing funding payment tracking
   - No historical performance data

4. **Risk Management**
   - No margin/collateral endpoints
   - Missing liquidation price calculations
   - No exposure limits

### Recommended New Endpoints

```javascript
// 1. Balance & Collateral
GET    /api/{exchange}/balances
GET    /api/{exchange}/collateral

// 2. Market Data
GET    /api/markets/prices
GET    /api/markets/funding-rates
WS     /api/markets/stream

// 3. Position Analytics
GET    /api/positions/{id}/pnl-history
GET    /api/positions/{id}/funding-payments
GET    /api/analytics/performance

// 4. Risk Management
GET    /api/risk/exposure
GET    /api/risk/margin-requirements
POST   /api/risk/alerts
```

### Integration Best Practices

1. **Error Handling**
```javascript
try {
  const response = await fetch(endpoint);
  if (!response.ok) {
    const error = await response.json();
    handleApiError(error);
  }
} catch (err) {
  handleNetworkError(err);
}
```

2. **Websocket Connections**
```javascript
// For real-time updates (needs implementation)
const ws = new WebSocket('wss://api.magnolia.com/stream');
ws.on('message', (data) => {
  const update = JSON.parse(data);
  updateLocalState(update);
});
```

3. **State Management**
```javascript
// Maintain local state for orders/positions
const orderStore = {
  hyperliquid: {},
  drift: {},
  
  updateOrder(exchange, order) {
    this[exchange][order.id] = order;
    notifyListeners();
  }
};
```

## Authentication Example - Complete Flow

```javascript
class AuthManager {
  constructor() {
    this.authHeader = null;
    this.authTimestamp = null;
  }
  
  async authenticate(walletType = 'evm') {
    try {
      let walletAddress, signature;
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Format message exactly as backend expects
      const message = `Authenticate to Magnolia\nAddress: ${walletAddress}\nTimestamp: ${timestamp}`;
      
      if (walletType === 'evm') {
        // Hyperliquid - EVM wallet
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        walletAddress = accounts[0];
        
        signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [message.replace('${walletAddress}', walletAddress), walletAddress]
        });
      } else {
        // Drift - Solana wallet
        const provider = window.phantom?.solana;
        const resp = await provider.connect();
        walletAddress = resp.publicKey.toString();
        
        const finalMessage = message.replace('${walletAddress}', walletAddress);
        const encodedMessage = new TextEncoder().encode(finalMessage);
        const signatureArray = await provider.signMessage(encodedMessage);
        signature = Buffer.from(signatureArray).toString('hex');
      }
      
      // Store auth header
      this.authHeader = `Bearer ${walletAddress}:${signature}:${timestamp}`;
      this.authTimestamp = timestamp;
      
      return this.authHeader;
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
  }
  
  isAuthValid() {
    if (!this.authTimestamp) return false;
    const now = Math.floor(Date.now() / 1000);
    // Check if within 5-minute window
    return (now - this.authTimestamp) < 300;
  }
  
  async getAuthHeader() {
    if (!this.isAuthValid()) {
      await this.authenticate();
    }
    return this.authHeader;
  }
}

// Usage
const auth = new AuthManager();
await auth.authenticate('evm'); // or 'solana'

// Make authenticated request
const response = await fetch('/api/hyperliquid/dex-accounts', {
  headers: {
    'Authorization': await auth.getAuthHeader()
  }
});
```

## Questions for Clarification

1. **Order Execution Flow**: Should Drift orders be placed through backend or continue with frontend SDK + sync approach?

2. **Balance Management**: How should we handle balance tracking across subaccounts and exchanges?

3. **Risk Parameters**: What risk limits should be enforced (max position size, leverage, etc.)?

4. **Data Persistence**: Should we store all historical trades/orders or just active ones?

5. **Authentication**: Do we need separate auth for each DEX account or is wallet-level auth sufficient?

6. **Websocket Requirements**: Do you need real-time updates for orders/positions/prices?

7. **Cross-Exchange Features**: Besides delta neutral, what other cross-exchange strategies should we support?