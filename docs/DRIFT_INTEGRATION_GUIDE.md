# Drift Protocol Integration Guide

This guide provides comprehensive instructions for integrating Drift Protocol with the Magnolia backend, including the new delegate order placement system.

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Frontend Integration](#frontend-integration)
4. [Delegate Order System](#delegate-order-system)
5. [API Endpoints](#api-endpoints)
6. [Order Types and Parameters](#order-types-and-parameters)
7. [Error Handling](#error-handling)
8. [Testing](#testing)
9. [Security Considerations](#security-considerations)

## Overview

The Drift integration supports two modes of operation:
1. **Direct Mode**: Users sign and submit transactions directly from the frontend (current implementation)
2. **Delegate Mode**: Backend signs and submits transactions on behalf of users (new implementation)

### Key Benefits of Delegate Mode
- No need for users to sign every transaction
- Faster order execution
- Enables automated trading strategies
- Reduces gas costs for users
- Better UX for frequent traders

## Architecture

### System Components

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Frontend      │────────▶│   Magnolia      │────────▶│   Drift         │
│   (React)       │         │   Backend       │         │   Protocol      │
│                 │         │                 │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
        │                           │                           ▲
        │                           │                           │
        └───────────────────────────┴───────────────────────────┘
                    Direct Mode (Optional)
```

### Wallet Configuration

The backend uses a single wallet (configured via `MAGNOLIA_SOLANA_PRIVATE_KEY`) to submit orders on behalf of all users. This wallet must:
- Have sufficient SOL for transaction fees
- Be approved as a delegate for user accounts

### Setting Up Delegate Authority

Before the backend can place orders on behalf of users, users must approve the backend wallet as a delegate:

```typescript
// Get the backend delegate address from the API
const configResponse = await fetch(`${API_BASE}/api/config`);
const config = await configResponse.json();
const backendDelegateAddress = config.data.drift.delegateAddress;

// User approves the backend as a delegate (one-time setup)
await driftClient.updateUserDelegate(
  new PublicKey(backendDelegateAddress),
  subAccountId // Usually 0
);
```

**Note**: This delegate approval is a one-time setup per user. Once approved, the backend can place orders on behalf of the user without requiring individual signatures.

## Frontend Integration

### 1. Initialize Drift Client (Frontend)

```typescript
import { Connection } from "@solana/web3.js";
import { Wallet } from "@drift-labs/sdk";
import { WalletContextState } from "@solana/wallet-adapter-react";

// Get SDK configuration from backend
const configResponse = await fetch(`${API_BASE}/api/config/drift-sdk`);
const sdkConfig = await configResponse.json();

// Initialize connection
const connection = new Connection(sdkConfig.data.rpcUrl, 'confirmed');

// Create wallet adapter
const wallet = new Wallet(solanaWallet as WalletContextState);

// Initialize DriftClient (for read operations and direct mode)
const driftClient = new DriftClient({
  connection,
  wallet,
  env: sdkConfig.data.env,
  programID: new PublicKey(sdkConfig.data.programId),
});

await driftClient.subscribe();
```

### 2. Create/Update DEX Account

Before placing orders, ensure the user has a DEX account registered:

```typescript
// Create or update DEX account
const response = await fetch(`${API_BASE}/api/drift/dex-accounts`, {
  method: 'POST',
  headers: {
    'Authorization': authToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    address: walletPublicKey.toString(),
    accountType: 'master',
    subaccountId: 0
  })
});

const dexAccount = await response.json();
const dexAccountId = dexAccount.data.id;
```

### 3. Initialize User Account on Drift (One-time)

Users must initialize their account on Drift before placing orders:

```typescript
// Check if user account exists
const userAccountExists = await driftClient.getUserAccountsForAuthority(
  walletPublicKey
);

if (!userAccountExists || userAccountExists.length === 0) {
  // Initialize user account
  const [txSig, userPublicKey] = await driftClient.initializeUserAccount(
    0, // subAccountId
    "Main Account" // name
  );
  
  console.log('User account initialized:', userPublicKey.toString());
}
```

## Delegate Order System

### How It Works

1. **Frontend** prepares order parameters
2. **Frontend** sends order to backend endpoint
3. **Backend** validates the request
4. **Backend** initializes DriftClient with:
   - Backend wallet for signing
   - User's authority address
   - User's subaccount ID
5. **Backend** signs and submits transaction to Drift Protocol
6. **Backend** returns transaction signature to frontend

### Technical Implementation

The backend uses the DriftClient SDK with specific configuration for delegate trading:

```typescript
const driftClient = new DriftClient({
  connection,
  wallet: backendWallet, // Wallet with MAGNOLIA_SOLANA_PRIVATE_KEY
  env: 'mainnet-beta',
  programID: new PublicKey(DRIFT_PROGRAM_ID),
  authority: userPublicKey, // The user's wallet address
  activeSubAccountId: subAccountId, // User's subaccount (usually 0)
  subAccountIds: [subAccountId], // Array of subaccount IDs to manage
  authoritySubAccountMap: new Map([
    [userAddress, [subAccountId]] // Maps user authority to their subaccounts
  ]),
});
```

**Important**: The `authority` parameter tells Drift which user account to interact with, while the `wallet` parameter provides the signing keypair.

### Placing Orders via Delegate

```typescript
interface DelegateOrderParams {
  marketIndex: number;
  marketType: 'PERP' | 'SPOT';
  direction: 'long' | 'short';
  baseAssetAmount: string; // Human-readable amount (e.g., "0.1" for 0.1 SOL)
  orderType: 'market' | 'limit' | 'trigger_market' | 'trigger_limit' | 'oracle';
  price?: string; // Required for limit orders
  reduceOnly?: boolean;
  postOnly?: boolean;
  immediateOrCancel?: boolean;
  maxTs?: string; // Max timestamp for order expiry
  triggerPrice?: string; // For trigger orders
  triggerCondition?: 'above' | 'below';
  oraclePriceOffset?: string; // For oracle orders
  auctionDuration?: number; // For market orders
  auctionStartPrice?: string;
  auctionEndPrice?: string;
  userOrderId?: number; // Custom order ID
}

// Example: Place a limit order
const orderParams: DelegateOrderParams = {
  marketIndex: 0, // SOL-PERP
  marketType: 'PERP',
  direction: 'long',
  baseAssetAmount: '0.1', // 0.1 SOL
  orderType: 'limit',
  price: '100.50',
  postOnly: true
};

const response = await fetch(
  `${API_BASE}/api/drift/dex-accounts/${dexAccountId}/orders/place-delegate`,
  {
    method: 'POST',
    headers: {
      'Authorization': authToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(orderParams)
  }
);

const result = await response.json();
console.log('Order placed:', result.data.txSignature);
```

### Market Order with Auction Parameters

```typescript
const marketOrderParams: DelegateOrderParams = {
  marketIndex: 0,
  marketType: 'PERP',
  direction: 'long',
  baseAssetAmount: '1.0',
  orderType: 'market',
  auctionStartPrice: '99.50',  // Start 0.5% below current price
  auctionEndPrice: '100.50',   // End 0.5% above current price
  auctionDuration: 10          // 10 slots (~5 seconds)
};
```

### Stop Loss Order

```typescript
const stopLossParams: DelegateOrderParams = {
  marketIndex: 0,
  marketType: 'PERP',
  direction: 'short',
  baseAssetAmount: '0.1',
  orderType: 'trigger_market',
  triggerPrice: '95.00',
  triggerCondition: 'below',
  reduceOnly: true
};
```

### Take Profit Order

```typescript
const takeProfitParams: DelegateOrderParams = {
  marketIndex: 0,
  marketType: 'PERP',
  direction: 'short',
  baseAssetAmount: '0.1',
  orderType: 'trigger_limit',
  price: '105.00',
  triggerPrice: '104.50',
  triggerCondition: 'above',
  reduceOnly: true
};
```

## API Endpoints

### 1. Get SDK Configuration
```
GET /api/config/drift-sdk
```

Response:
```json
{
  "success": true,
  "data": {
    "env": "mainnet-beta",
    "programId": "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
    "rpcUrl": "https://api.mainnet-beta.solana.com",
    "dataApiUrl": "https://api.drift.trade"
  }
}
```

### 2. Create/Update DEX Account
```
POST /api/drift/dex-accounts
```

Body:
```json
{
  "address": "5XmFMyVvox2FaEaVGGEWvptAJpHfKZMvAyxW9gYsqxVV",
  "accountType": "master",
  "subaccountId": 0
}
```

### 3. Place Order (Direct Mode)
```
POST /api/drift/dex-accounts/:dexAccountId/orders
```

Used to record orders placed directly from frontend.

### 4. Place Order (Delegate Mode)
```
POST /api/drift/dex-accounts/:dexAccountId/orders/place-delegate
```

Body: See `DelegateOrderParams` interface above.

### 5. Get Orders
```
GET /api/drift/dex-accounts/:dexAccountId/orders
```

Query Parameters:
- `status`: 'open' | 'filled' | 'cancelled'
- `marketIndex`: number
- `marketType`: 'PERP' | 'SPOT'

### 6. Record Deposit
```
POST /api/drift/dex-accounts/:dexAccountId/deposits
```

### 7. Record Withdrawal
```
POST /api/drift/dex-accounts/:dexAccountId/withdrawals
```

## Order Types and Parameters

### Perpetual Markets

| Market Index | Symbol | Base Asset |
|-------------|---------|------------|
| 0 | SOL-PERP | SOL |
| 1 | BTC-PERP | BTC |
| 2 | ETH-PERP | ETH |
| 3 | APT-PERP | APT |
| 4 | MATIC-PERP | MATIC |
| 5 | ARB-PERP | ARB |
| 6 | DOGE-PERP | DOGE |
| 7 | BNB-PERP | BNB |
| 8 | SUI-PERP | SUI |
| 9 | PEPE-PERP | PEPE |

### Order Types

1. **Market Order**
   - Executes immediately at best available price
   - Supports auction parameters for better execution

2. **Limit Order**
   - Executes at specified price or better
   - Supports post-only flag for maker orders

3. **Trigger Market Order**
   - Market order that executes when trigger price is reached
   - Used for stop loss orders

4. **Trigger Limit Order**
   - Limit order that activates when trigger price is reached
   - Used for take profit orders

5. **Oracle Order**
   - Uses oracle price with offset for dynamic pricing

### Important Considerations

1. **Amount Precision**
   - Perpetuals: Amount in base asset units (e.g., "0.1" for 0.1 SOL)
   - Spot: Amount in token units with appropriate decimals

2. **Price Precision**
   - All prices should be in human-readable format (e.g., "100.50")
   - Backend handles conversion to chain precision

3. **Post-Only Orders**
   - Ensures order only adds liquidity (maker order)
   - Order fails if it would cross the spread

## Error Handling

### Common Errors

1. **User Not Initialized**
```json
{
  "success": false,
  "error": "User account not initialized on Drift. Please initialize your account first."
}
```
Solution: Initialize user account using DriftClient

2. **Delegate Not Approved**
```json
{
  "success": false,
  "error": "0x1234... is not a delegate for authority 0x5678..."
}
```
Solution: User must approve backend as delegate first:
```typescript
await driftClient.updateUserDelegate(
  new PublicKey(backendDelegateAddress),
  subAccountId
);
```

3. **Insufficient Balance**
```json
{
  "success": false,
  "error": "Insufficient margin for order"
}
```
Solution: Deposit more collateral

4. **Invalid Market**
```json
{
  "success": false,
  "error": "Invalid spot market index"
}
```
Solution: Check market index is valid

5. **Access Denied**
```json
{
  "success": false,
  "error": "Access denied to this account"
}
```
Solution: Ensure user owns the DEX account

6. **Backend Wallet Not Configured**
```json
{
  "success": false,
  "error": "Backend wallet not configured"
}
```
Solution: Ensure MAGNOLIA_SOLANA_PRIVATE_KEY is set in environment

7. **Transaction Failed**
```json
{
  "success": false,
  "error": "Transaction simulation failed: ..."
}
```
Solution: Check transaction logs for specific error

### Error Handling Pattern

```typescript
try {
  const response = await fetch(endpoint, options);
  
  if (!response.ok) {
    const error = await response.json();
    
    // Handle specific errors
    if (error.error?.includes('User not found')) {
      // Prompt user to initialize account
      await initializeUserAccount();
    } else if (error.error?.includes('Insufficient margin')) {
      // Prompt user to deposit
      showDepositModal();
    } else {
      // Generic error handling
      showErrorNotification(error.error || 'Unknown error');
    }
    return;
  }
  
  const result = await response.json();
  // Handle success
} catch (err) {
  console.error('Network error:', err);
  showErrorNotification('Failed to connect to server');
}
```

## Testing

### Test Checklist

1. **Account Setup**
   - [ ] Create DEX account via API
   - [ ] Initialize Drift user account
   - [ ] Verify account appears in database

2. **Order Placement**
   - [ ] Place market order
   - [ ] Place limit order
   - [ ] Place stop loss order
   - [ ] Place take profit order
   - [ ] Test order with invalid parameters

3. **Order Management**
   - [ ] Fetch open orders
   - [ ] Update order status
   - [ ] Cancel orders (if implemented)

4. **Edge Cases**
   - [ ] Uninitialized user account
   - [ ] Insufficient balance
   - [ ] Invalid market index
   - [ ] Expired authentication

### Example Test Flow

```typescript
// 1. Authenticate
const authToken = await authenticateWallet();

// 2. Create DEX account
const dexAccount = await createDexAccount(walletPublicKey);

// 3. Initialize Drift account (if needed)
await initializeDriftAccount();

// 4. Place test order
const testOrder = {
  marketIndex: 0,
  marketType: 'PERP' as const,
  direction: 'long' as const,
  baseAssetAmount: '0.01', // Small test amount
  orderType: 'limit' as const,
  price: '90.00' // Below market to avoid fill
};

const result = await placeDelegateOrder(dexAccount.id, testOrder);
console.log('Test order placed:', result.txSignature);

// 5. Verify order in database
const orders = await fetchOrders(dexAccount.id, { status: 'open' });
assert(orders.length > 0, 'Order should appear in database');
```

## Security Considerations

### Backend Wallet Security

1. **Private Key Storage**
   - Store `MAGNOLIA_SOLANA_PRIVATE_KEY` securely
   - Use environment variables, never commit to code
   - Consider using AWS Secrets Manager or similar

2. **Access Control**
   - Verify user owns the DEX account before placing orders
   - Implement rate limiting to prevent abuse
   - Monitor for suspicious activity

3. **Transaction Limits**
   - Consider implementing per-user limits
   - Monitor backend wallet balance
   - Set up alerts for large transactions

### Frontend Security

1. **Authentication**
   - Always verify wallet signatures
   - Use time-based authentication tokens
   - Implement proper session management

2. **Input Validation**
   - Validate all order parameters
   - Sanitize user inputs
   - Check for reasonable values

3. **Error Messages**
   - Don't expose sensitive information
   - Log detailed errors server-side only
   - Provide user-friendly error messages

### Audit Trail

1. **Transaction Logging**
   - Log all delegate transactions
   - Store transaction signatures
   - Track which user initiated each order

2. **Database Records**
   - Keep complete order history
   - Track order modifications
   - Store raw transaction data

## Migration Path

### From Direct to Delegate Mode

1. **Phase 1: Dual Mode**
   - Keep existing direct mode working
   - Add delegate mode as optional feature
   - Allow users to choose their preference

2. **Phase 2: Encourage Delegate**
   - Show benefits of delegate mode
   - Provide incentives (reduced fees, etc.)
   - Gather user feedback

3. **Phase 3: Delegate Default**
   - Make delegate mode the default
   - Keep direct mode as fallback
   - Monitor for issues

### Rollback Plan

If issues arise with delegate mode:
1. Frontend can instantly switch back to direct mode
2. No backend changes needed for rollback
3. Users maintain full control of their funds

## Appendix

### Useful Resources

- [Drift Protocol Docs](https://docs.drift.trade)
- [Drift SDK Reference](https://drift-labs.github.io/protocol-v2/)
- [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/)

### Common Patterns

#### Get Oracle Price
```typescript
const oracleData = driftClient.getOracleDataForPerpMarket(marketIndex);
const oraclePrice = oracleData.price;
```

#### Calculate Position Size
```typescript
const notionalValue = 1000; // $1000 position
const price = 100; // Current price
const baseAssetAmount = (notionalValue / price).toString(); // "10"
```

#### Format Prices for Display
```typescript
const formatPrice = (price: string, decimals: number = 2) => {
  return parseFloat(price).toFixed(decimals);
};
```

### Troubleshooting

**Problem**: Orders failing with "User not found"
**Solution**: Ensure user has initialized their Drift account

**Problem**: "Insufficient margin" errors
**Solution**: Check user has deposited collateral to Drift

**Problem**: Orders not appearing in database
**Solution**: Verify DEX account ID is correct and user has access

**Problem**: Authentication errors
**Solution**: Check auth token is valid and not expired

## Complete Frontend Implementation Example

Here's a complete example of implementing Drift delegate orders in your frontend:

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { DriftClient, Wallet } from '@drift-labs/sdk';
import { useWallet } from '@solana/wallet-adapter-react';

class DriftTradingService {
  private apiBase: string;
  private authToken: string;
  private dexAccountId: number;
  private backendDelegateAddress: string;
  
  constructor(apiBase: string) {
    this.apiBase = apiBase;
  }
  
  /**
   * Initialize the service and setup delegate if needed
   */
  async initialize(wallet: any) {
    // 1. Get configuration
    const config = await this.getConfig();
    this.backendDelegateAddress = config.drift.delegateAddress;
    
    // 2. Authenticate
    await this.authenticate(wallet);
    
    // 3. Setup DEX account
    await this.setupDexAccount(wallet.publicKey.toString());
    
    // 4. Initialize Drift and approve delegate
    await this.initializeDriftAndDelegate(wallet, config);
  }
  
  private async getConfig() {
    const response = await fetch(`${this.apiBase}/api/config`);
    return (await response.json()).data;
  }
  
  private async authenticate(wallet: any) {
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `Authenticate to Magnolia\nAddress: ${wallet.publicKey.toString()}\nTimestamp: ${timestamp}`;
    const encodedMessage = new TextEncoder().encode(message);
    const signature = await wallet.signMessage(encodedMessage);
    
    this.authToken = `Bearer ${wallet.publicKey.toString()}:${Buffer.from(signature).toString('hex')}:${timestamp}`;
  }
  
  private async setupDexAccount(walletAddress: string) {
    // Create or get existing DEX account
    const response = await fetch(`${this.apiBase}/api/drift/dex-accounts`, {
      method: 'POST',
      headers: {
        'Authorization': this.authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        address: walletAddress,
        accountType: 'master',
        subaccountId: 0
      })
    });
    
    const result = await response.json();
    this.dexAccountId = result.data.id;
  }
  
  private async initializeDriftAndDelegate(wallet: any, config: any) {
    // Initialize DriftClient
    const connection = new Connection(config.drift.rpcUrl);
    const driftWallet = new Wallet(wallet);
    
    const driftClient = new DriftClient({
      connection,
      wallet: driftWallet,
      env: config.drift.env,
    });
    
    await driftClient.subscribe();
    
    // Check if user account exists
    const userAccounts = await driftClient.getUserAccountsForAuthority(
      wallet.publicKey
    );
    
    if (!userAccounts || userAccounts.length === 0) {
      // Initialize user account
      console.log('Initializing Drift user account...');
      await driftClient.initializeUserAccount();
    }
    
    // Check if delegate is already approved
    const user = driftClient.getUser();
    const currentDelegate = user.getUserAccount().delegate;
    
    if (!currentDelegate || !currentDelegate.equals(new PublicKey(this.backendDelegateAddress))) {
      // Approve backend as delegate
      console.log('Approving backend as delegate...');
      await driftClient.updateUserDelegate(
        new PublicKey(this.backendDelegateAddress),
        0 // subAccountId
      );
    }
    
    await driftClient.unsubscribe();
  }
  
  /**
   * Place an order using the delegate system
   */
  async placeOrder(orderParams: {
    marketIndex: number;
    direction: 'long' | 'short';
    size: string;
    orderType: 'market' | 'limit';
    price?: string;
  }) {
    const response = await fetch(
      `${this.apiBase}/api/drift/dex-accounts/${this.dexAccountId}/orders/place-delegate`,
      {
        method: 'POST',
        headers: {
          'Authorization': this.authToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          marketIndex: orderParams.marketIndex,
          marketType: 'PERP',
          direction: orderParams.direction,
          baseAssetAmount: orderParams.size,
          orderType: orderParams.orderType,
          price: orderParams.price,
          postOnly: orderParams.orderType === 'limit'
        })
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to place order');
    }
    
    return await response.json();
  }
  
  /**
   * Get open orders
   */
  async getOpenOrders() {
    const response = await fetch(
      `${this.apiBase}/api/drift/dex-accounts/${this.dexAccountId}/orders?status=open`,
      {
        headers: {
          'Authorization': this.authToken
        }
      }
    );
    
    return await response.json();
  }
}

// React component example
export function TradingInterface() {
  const wallet = useWallet();
  const [driftService, setDriftService] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  useEffect(() => {
    if (wallet.connected && !isInitialized) {
      initializeTrading();
    }
  }, [wallet.connected]);
  
  const initializeTrading = async () => {
    try {
      const service = new DriftTradingService(process.env.NEXT_PUBLIC_API_URL);
      await service.initialize(wallet);
      setDriftService(service);
      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to initialize trading:', error);
    }
  };
  
  const handlePlaceOrder = async () => {
    try {
      const result = await driftService.placeOrder({
        marketIndex: 0, // SOL-PERP
        direction: 'long',
        size: '0.1',
        orderType: 'limit',
        price: '100.50'
      });
      
      console.log('Order placed:', result.data.txSignature);
    } catch (error) {
      console.error('Failed to place order:', error);
    }
  };
  
  return (
    <div>
      {!isInitialized ? (
        <p>Initializing trading system...</p>
      ) : (
        <button onClick={handlePlaceOrder}>
          Place Order
        </button>
      )}
    </div>
  );
}
```

## Support

For additional support:
- Check backend logs for detailed error messages
- Review Drift Protocol documentation
- Monitor Solana Explorer for transaction details
- Contact the development team

Remember to always test in devnet before deploying to mainnet!