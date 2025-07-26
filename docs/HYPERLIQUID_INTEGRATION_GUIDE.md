# Hyperliquid Integration Guide

This comprehensive guide covers everything you need to integrate with the Hyperliquid trading API through the Magnolia backend using RainbowKit and Wagmi.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Authentication](#authentication)
4. [Configuration](#configuration)
5. [Agent Wallet System](#agent-wallet-system)
6. [API Endpoints](#api-endpoints)
7. [Frontend Integration](#frontend-integration)
8. [Asset Handling](#asset-handling)
9. [Order Flow](#order-flow)
10. [Error Handling](#error-handling)
11. [Security Considerations](#security-considerations)
12. [Complete Examples](#complete-examples)

## Overview

Hyperliquid is a decentralized perpetual futures DEX built on its own L1 blockchain. This integration allows users to:

- Trade perpetual futures with up to 50x leverage
- Manage multiple trading accounts (agent wallets)
- Place various order types (market, limit, trigger orders)
- Track positions and P&L
- Handle deposits and withdrawals

### Key Features

- **Agent Wallet System**: Backend can sign orders on behalf of users
- **Multiple Order Types**: Market, limit, trigger (stop/take-profit), and oracle orders
- **Position Management**: Track single and delta-neutral positions
- **Real-time Order Status**: Track order lifecycle from placement to fill
- **RainbowKit Integration**: Seamless wallet connection with multiple providers
- **Wagmi-based Architecture**: Type-safe React hooks for blockchain interactions

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│    Frontend     │────▶│   Backend    │────▶│  Hyperliquid    │────▶│  Hyperliquid L1  │
│ (RainbowKit +   │◀────│   (Express)  │◀────│     API         │◀────│   Blockchain     │
│  Wagmi + React) │     └──────────────┘     └─────────────────┘     └──────────────────┘
└─────────────────┘            │
         │                     ▼
         │              ┌─────────────┐
         └──────────────│  PostgreSQL │
       @nktkas/hl       │   Database  │
                        └─────────────┘
```

### Key Components

1. **Frontend**: React app with RainbowKit UI and Wagmi hooks for wallet management
2. **Backend API**: Manages authentication, order signing, and database operations
3. **Hyperliquid API**: Processes orders and provides market data
4. **Database**: Stores user accounts, orders, positions, and transaction history

### Technology Stack

#### Frontend
- **React**: UI framework
- **RainbowKit**: Pre-built wallet connection UI
- **Wagmi**: React hooks for Ethereum interactions
- **Viem**: Ethereum utilities and types
- **@nktkas/hyperliquid**: Hyperliquid-specific signing and types
- **@tanstack/react-query**: Data fetching and caching

## Authentication

All API endpoints require authentication using a wallet signature.

### Authentication Flow with Wagmi

```typescript
import { useAccount, useSignMessage } from 'wagmi'

export function useAuth() {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  
  const authenticate = async () => {
    if (!address) throw new Error('No wallet connected')
    
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Authenticate to Magnolia\nAddress: ${address}\nTimestamp: ${timestamp}`
    
    // Sign message using wagmi hook
    const signature = await signMessageAsync({ message })
    
    // Create auth token
    const authToken = `Bearer ${address}:${signature}:${timestamp}`
    
    return authToken
  }
  
  return { authenticate }
}
```

### Using Authentication in API Calls

```typescript
const response = await fetch('/api/hyperliquid/dex-accounts', {
  headers: {
    'Authorization': authToken,
    'Content-Type': 'application/json'
  }
})
```

### Authentication Validity

- Signatures are valid for **15 minutes** from the timestamp
- After expiration, generate a new signature
- The backend validates both the signature and timestamp

## Configuration

### Frontend Wagmi Configuration

```typescript
// config/wagmi.ts
import { createConfig, http } from 'wagmi'
import { arbitrum, arbitrumSepolia } from 'wagmi/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [arbitrum, arbitrumSepolia],
  connectors: [
    injected(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    }),
    coinbaseWallet({
      appName: 'Magnolia',
    })
  ],
  transports: {
    [arbitrum.id]: http(),
    [arbitrumSepolia.id]: http(),
  },
})
```

### Backend Environment Variables

```bash
# Network environment (testnet or mainnet)
NETWORK_ENV=testnet

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/magnolia

# For agent wallet operations (optional)
ENCRYPTION_KEY=your-32-byte-hex-key
```

### Network Configuration

The backend automatically configures based on `NETWORK_ENV`:

**Testnet**:
- API URL: `https://api.hyperliquid-testnet.xyz`
- Chain: `Testnet`
- Signature Chain ID: `0x66eee` (Arbitrum Sepolia)

**Mainnet**:
- API URL: `https://api.hyperliquid.xyz`
- Chain: `Mainnet`
- Signature Chain ID: `0xa4b1` (Arbitrum Mainnet)

## Agent Wallet System

Hyperliquid uses an agent wallet system where users can delegate trading to authorized wallets. This enables the backend to sign and submit orders on behalf of users.

### How It Works

1. **User approves an agent wallet** with trading permissions
2. **Backend stores the agent wallet's private key** (encrypted)
3. **Backend can sign orders** without requiring user interaction
4. **User maintains full control** and can revoke access anytime

### Creating an Agent Wallet with Wagmi

```typescript
import { useAccount, useWalletClient, useChainId } from 'wagmi'
import { signUserSignedAction } from '@nktkas/hyperliquid/signing'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'

export function useAgentWallet() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()
  
  const isTestnet = chainId === 421614 // Arbitrum Sepolia
  
  const createAgentWallet = async () => {
    if (!walletClient || !address) throw new Error('No wallet connected')
    
    // Generate new agent wallet
    const agentPrivateKey = generatePrivateKey()
    const agentAddress = privateKeyToAddress(agentPrivateKey)
    
    // Create approval action
    const action = {
      type: 'approveAgent',
      hyperliquidChain: isTestnet ? 'Testnet' : 'Mainnet',
      signatureChainId: isTestnet ? '0x66eee' : '0xa4b1',
      agentAddress: agentAddress,
      agentName: 'My Trading Bot',
      nonce: Date.now()
    }
    
    // Sign with master wallet
    const signature = await signUserSignedAction({
      wallet: walletClient,
      action,
      types: {
        'HyperliquidTransaction:ApproveAgent': [
          { name: 'hyperliquidChain', type: 'string' },
          { name: 'agentAddress', type: 'address' },
          { name: 'agentName', type: 'string' },
          { name: 'nonce', type: 'uint64' }
        ]
      },
      chainId: parseInt(action.signatureChainId, 16)
    })
    
    // Send to backend
    const authToken = await authenticate() // Using auth hook
    
    const response = await fetch('/api/hyperliquid/dex-accounts', {
      method: 'POST',
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'create_and_approve',
        masterAddress: address,
        agentName: 'My Trading Bot',
        agentAddress: agentAddress,
        agentPrivateKey: agentPrivateKey,
        signature: signature,
        nonce: action.nonce.toString(),
        actionData: action
      })
    })
    
    return response.json()
  }
  
  return { createAgentWallet }
}
```

## API Endpoints

### DEX Accounts

#### Get User's DEX Accounts
```
GET /api/hyperliquid/dex-accounts

Response:
{
  "success": true,
  "data": [
    {
      "id": 1,
      "address": "0x123...",
      "accountType": "agent_wallet",
      "agentName": "My Trading Bot",
      "isActive": true,
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

#### Create/Approve Agent Wallet
```
POST /api/hyperliquid/dex-accounts

Request:
{
  "action": "create_and_approve",
  "masterAddress": "0x456...",
  "agentName": "My Trading Bot",
  "agentAddress": "0x789...",
  "agentPrivateKey": "0xabc...",
  "signature": "0xdef...",
  "nonce": "1705316400000",
  "actionData": { /* pre-formatted action */ }
}

Response:
{
  "success": true,
  "data": {
    "id": 1,
    "address": "0x789...",
    "accountType": "agent_wallet",
    "agentName": "My Trading Bot",
    "isActive": true,
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

### Orders

#### Place Orders
```
POST /api/hyperliquid/dex-accounts/:dexAccountId/orders

Request:
{
  "orders": [
    {
      "asset": "BTC",
      "side": "buy",
      "orderType": "limit",
      "size": "0.1",
      "price": "45000",
      "reduceOnly": false,
      "postOnly": true,
      "clientOrderId": "my-order-123"
    }
  ],
  "grouping": "na"
}

Response:
{
  "success": true,
  "data": {
    "statuses": [
      {
        "resting": {
          "oid": 123456
        }
      }
    ]
  }
}
```

#### Get Orders
```
GET /api/hyperliquid/dex-accounts/:dexAccountId/orders?status=open&asset=BTC

Response:
{
  "success": true,
  "data": [
    {
      "id": 1,
      "clientOrderId": "my-order-123",
      "asset": "BTC",
      "side": "buy",
      "orderType": "limit",
      "price": "45000",
      "size": "0.1",
      "status": "open",
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

#### Cancel Orders
```
POST /api/hyperliquid/dex-accounts/:dexAccountId/orders/cancel

Request:
{
  "cancels": [
    {
      "asset": "BTC",
      "orderId": "123456"
    }
  ]
}

Response:
{
  "success": true,
  "data": {
    "statuses": [
      {
        "success": true
      }
    ]
  }
}
```

### Other Endpoints

- **Fills**: `GET /api/hyperliquid/dex-accounts/:dexAccountId/fills`
- **Positions**: `GET/POST/PATCH /api/hyperliquid/positions`
- **Deposits**: `POST /api/hyperliquid/dex-accounts/:dexAccountId/deposits`
- **Withdrawals**: `POST /api/hyperliquid/dex-accounts/:dexAccountId/withdrawals`
- **Transaction History**: `GET /api/hyperliquid/dex-accounts/:dexAccountId/transactions`

## Frontend Integration

### RainbowKit Provider Setup

```tsx
// app/providers.tsx
'use client'

import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '@/config/wagmi'

const queryClient = new QueryClient()

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

### Hyperliquid Hooks

#### Authentication Hook
```typescript
// hooks/useHyperliquidAuth.ts
import { useAccount, useSignMessage } from 'wagmi'
import { useState } from 'react'

export function useHyperliquidAuth() {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [authToken, setAuthToken] = useState<string | null>(null)

  const authenticate = async () => {
    if (!address) throw new Error('No wallet connected')
    
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Authenticate to Magnolia\nAddress: ${address}\nTimestamp: ${timestamp}`
    
    const signature = await signMessageAsync({ message })
    const token = `Bearer ${address}:${signature}:${timestamp}`
    
    setAuthToken(token)
    return token
  }

  return { authToken, authenticate }
}
```

#### Signing Hook
```typescript
// hooks/useHyperliquidSigning.ts
import { useWalletClient, useChainId } from 'wagmi'
import { signL1Action, signUserSignedAction } from '@nktkas/hyperliquid/signing'

export function useHyperliquidSigning() {
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()
  
  const isTestnet = chainId === 421614 // Arbitrum Sepolia

  const signOrder = async (orderParams: any) => {
    if (!walletClient) throw new Error('No wallet connected')
    
    const action = {
      type: 'order',
      orders: orderParams,
      grouping: 'na'
    }
    
    return await signL1Action({
      wallet: walletClient,
      action,
      nonce: Date.now(),
      isTestnet
    })
  }

  const signCancel = async (cancels: any[]) => {
    if (!walletClient) throw new Error('No wallet connected')
    
    const action = {
      type: 'cancel',
      cancels
    }
    
    return await signL1Action({
      wallet: walletClient,
      action,
      nonce: Date.now(),
      isTestnet
    })
  }

  const signAgentApproval = async (agentAddress: string, agentName: string) => {
    if (!walletClient) throw new Error('No wallet connected')
    
    const action = {
      type: 'approveAgent',
      hyperliquidChain: isTestnet ? 'Testnet' : 'Mainnet',
      signatureChainId: isTestnet ? '0x66eee' : '0xa4b1',
      agentAddress,
      agentName,
      nonce: Date.now()
    }
    
    return await signUserSignedAction({
      wallet: walletClient,
      action,
      types: {
        'HyperliquidTransaction:ApproveAgent': [
          { name: 'hyperliquidChain', type: 'string' },
          { name: 'agentAddress', type: 'address' },
          { name: 'agentName', type: 'string' },
          { name: 'nonce', type: 'uint64' }
        ]
      },
      chainId: isTestnet ? 421614 : 42161
    })
  }

  return { signOrder, signCancel, signAgentApproval }
}
```

### Trading Component Example

```tsx
// components/TradingInterface.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId } from 'wagmi'
import { useState, useEffect } from 'react'
import { useHyperliquidAuth } from '@/hooks/useHyperliquidAuth'
import { useHyperliquidSigning } from '@/hooks/useHyperliquidSigning'

export function TradingInterface() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { authToken, authenticate } = useHyperliquidAuth()
  const { signOrder, signCancel } = useHyperliquidSigning()
  
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [dexAccountId, setDexAccountId] = useState<number | null>(null)

  // Initialize when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      initialize()
    }
  }, [isConnected, address])

  const initialize = async () => {
    try {
      // Authenticate
      const token = await authenticate()
      
      // Get DEX accounts
      const response = await fetch('/api/hyperliquid/dex-accounts', {
        headers: {
          'Authorization': token
        }
      })
      
      const { data } = await response.json()
      if (data.length > 0) {
        setDexAccountId(data[0].id)
        await loadOrders(data[0].id, token)
      }
    } catch (error) {
      console.error('Failed to initialize:', error)
    }
  }

  const loadOrders = async (accountId: number, token: string) => {
    const response = await fetch(`/api/hyperliquid/dex-accounts/${accountId}/orders?status=open`, {
      headers: {
        'Authorization': token
      }
    })
    
    const { data } = await response.json()
    setOrders(data)
  }

  const placeOrder = async () => {
    if (!dexAccountId || !authToken) return
    
    setLoading(true)
    try {
      // Create order action
      const orderAction = [{
        a: 3,        // BTC
        b: true,     // Buy
        p: '45000',  // Price
        s: '0.1',    // Size
        r: false,    // Not reduce-only
        t: {
          limit: {
            tif: 'Gtc' // Good till cancelled
          }
        },
        c: `0x${Date.now().toString(16)}` // Client order ID
      }]
      
      // Sign order
      const signature = await signOrder(orderAction)
      
      // Submit to backend
      const response = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': authToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orders: [{
            asset: 'BTC',
            side: 'buy',
            orderType: 'limit',
            size: '0.1',
            price: '45000',
            clientOrderId: orderAction[0].c
          }],
          grouping: 'na',
          signature,
          nonce: Date.now()
        })
      })
      
      if (response.ok) {
        await loadOrders(dexAccountId, authToken)
      }
    } catch (error) {
      console.error('Failed to place order:', error)
    } finally {
      setLoading(false)
    }
  }

  const cancelOrder = async (orderId: string, assetId: number) => {
    if (!dexAccountId || !authToken) return
    
    try {
      // Sign cancel
      const signature = await signCancel([{
        a: assetId,
        o: parseInt(orderId)
      }])
      
      // Submit to backend
      await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': authToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cancels: [{
            asset: assetIdToSymbol(assetId),
            orderId: orderId
          }],
          signature,
          nonce: Date.now()
        })
      })
      
      await loadOrders(dexAccountId, authToken)
    } catch (error) {
      console.error('Failed to cancel order:', error)
    }
  }

  return (
    <div className="p-6">
      {/* RainbowKit Connect Button */}
      <div className="mb-6">
        <ConnectButton />
      </div>

      {/* Trading Interface */}
      {isConnected && dexAccountId && (
        <>
          <button
            onClick={placeOrder}
            disabled={loading}
            className="px-6 py-3 bg-green-600 text-white rounded disabled:opacity-50"
          >
            {loading ? 'Placing Order...' : 'Place Buy Order (BTC)'}
          </button>
          
          <div className="mt-6">
            <h3 className="text-xl font-bold mb-4">Open Orders</h3>
            {orders.length === 0 ? (
              <p>No open orders</p>
            ) : (
              <div className="space-y-2">
                {orders.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between p-4 border rounded">
                    <div>
                      {order.asset} {order.side} {order.size} @ ${order.price}
                    </div>
                    <button
                      onClick={() => cancelOrder(order.hlOrderId, getAssetId(order.asset))}
                      className="px-4 py-2 bg-red-600 text-white rounded"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Helper functions
function getAssetId(symbol: string): number {
  const assets: Record<string, number> = {
    BTC: 3,
    ETH: 4,
    SOL: 0,
    // ... add more
  }
  return assets[symbol] || 0
}

function assetIdToSymbol(id: number): string {
  const symbols: Record<number, string> = {
    3: 'BTC',
    4: 'ETH',
    0: 'SOL',
    // ... add more
  }
  return symbols[id] || 'UNKNOWN'
}
```

## Asset Handling

### Asset Mappings

Hyperliquid uses numeric asset IDs. Common mappings:

```typescript
// Common testnet assets
const ASSETS = {
  BTC: 3,
  ETH: 4,
  SOL: 0,
  BNB: 6,
  AVAX: 7,
  MATIC: 5,
  ARB: 11,
  DOGE: 12,
  // ... more assets
}
```

### Using Assets in Orders

```typescript
// Using symbol (recommended)
{
  "asset": "BTC",
  "side": "buy",
  "size": "0.1"
}

// Using numeric ID (also supported)
{
  "asset": "3",
  "side": "buy", 
  "size": "0.1"
}
```

## Order Flow

### 1. Client-Side Signing (Frontend signs, backend relays)

```typescript
import { useWalletClient } from 'wagmi'
import { signL1Action } from '@nktkas/hyperliquid/signing'

// Create order action
const action = {
  type: 'order',
  orders: [{
    a: 3,        // Asset ID (3 = BTC)
    b: true,     // Side (true = buy/long, false = sell/short)
    p: '45000',  // Price
    s: '0.1',    // Size in base units
    r: false,    // Reduce only
    t: {         // Order type
      limit: {
        tif: 'Gtc' // Time in force: 'Gtc', 'Alo', 'Ioc', or 'Fok'
      }
    },
    c: null      // Optional client order ID
  }],
  grouping: 'na' // Order grouping
}

// Sign with wallet client from wagmi
const { data: walletClient } = useWalletClient()
const signature = await signL1Action({
  wallet: walletClient,
  action,
  nonce: Date.now(),
  isTestnet: true
})

// Send to backend with signature
const response = await fetch('/api/hyperliquid/orders/signed', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': authToken
  },
  body: JSON.stringify({
    action,
    signature,
    nonce: Date.now()
  })
})
```

### 2. Server-Side Signing (Backend signs with agent wallet)

```typescript
// Frontend just sends order details
await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders`, {
  method: 'POST',
  headers: {
    'Authorization': authToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    orders: [{
      asset: 'BTC',
      side: 'buy',
      orderType: 'limit',
      size: '0.1',
      price: '45000'
    }],
    grouping: 'na'
  })
})

// Backend handles signing automatically with stored agent wallet
```

### Order Types with Wagmi

#### Market Order
```typescript
const { data: walletClient } = useWalletClient()

const marketOrderAction = {
  type: 'order',
  orders: [{
    a: 3,        // BTC asset ID
    b: true,     // Buy
    p: '100000', // Set high price for buy (low for sell) to ensure fill
    s: '0.1',    // Size
    r: false,    // Not reduce-only
    t: {
      limit: {
        tif: 'Ioc' // Immediate or cancel - acts like market order
      }
    }
  }],
  grouping: 'na'
}

const signature = await signL1Action({
  wallet: walletClient,
  action: marketOrderAction,
  nonce: Date.now(),
  isTestnet: true
})
```

#### Stop Loss Order
```typescript
const stopLossAction = {
  type: 'order',
  orders: [{
    a: 3,        // BTC asset ID
    b: false,    // Sell
    p: '0',      // Market order (price not used)
    s: '0.1',    // Size
    r: true,     // Reduce-only
    t: {
      trigger: {
        isMarket: true,
        triggerPx: '44000', // Trigger price
        tpsl: 'sl'          // Stop loss
      }
    }
  }],
  grouping: 'na'
}
```

## Error Handling

### Common Errors

```typescript
// Authentication expired
{
  "success": false,
  "error": "Request timestamp expired",
  "code": "UNAUTHORIZED"
}

// Invalid order price
{
  "success": false,
  "error": "Order price is too far from market price. The price must be within 80% of the current market price.",
  "code": "INVALID_REQUEST"
}

// Insufficient funds
{
  "success": false,
  "error": "Master account needs to deposit funds to Hyperliquid before approving an agent wallet",
  "code": "INVALID_REQUEST"
}
```

### Error Handling with React Query

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useHyperliquidOrders(dexAccountId: number | null, authToken: string | null) {
  const queryClient = useQueryClient()

  // Fetch orders with automatic retry
  const { data: orders, isLoading, error } = useQuery({
    queryKey: ['hyperliquid', 'orders', dexAccountId],
    queryFn: async () => {
      if (!dexAccountId || !authToken) return []
      
      const response = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders?status=open`, {
        headers: { 'Authorization': authToken }
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch orders')
      }
      
      const { data } = await response.json()
      return data
    },
    enabled: !!dexAccountId && !!authToken,
    refetchInterval: 5000, // Refresh every 5 seconds
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000)
  })

  // Place order mutation with error handling
  const placeOrder = useMutation({
    mutationFn: async (orderData: any) => {
      if (!dexAccountId || !authToken) throw new Error('Not authenticated')
      
      const response = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': authToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
      })
      
      const result = await response.json()
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to place order')
      }
      
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hyperliquid', 'orders', dexAccountId] })
    },
    onError: (error: Error) => {
      if (error.message.includes('timestamp expired')) {
        // Trigger re-authentication
        console.log('Auth expired, please reconnect')
      }
    }
  })

  return {
    orders,
    isLoading,
    error,
    placeOrder: placeOrder.mutate,
    isPlacing: placeOrder.isPending
  }
}
```

## Security Considerations

### 1. Private Key Storage
- Agent wallet private keys are stored encrypted in the backend
- Never expose private keys to the frontend
- Use environment variables for encryption keys
- Rotate encryption keys periodically

### 2. Authentication
- Signatures expire after 15 minutes
- Validate both signature and timestamp
- Use secure random nonces for orders
- Implement rate limiting

### 3. Wallet Security with RainbowKit
- RainbowKit handles wallet connection security
- No direct access to private keys in the browser
- All signing happens through the wallet provider
- Users must approve each transaction

### 4. Best Practices
- Always use HTTPS in production
- Implement request signing for sensitive operations
- Monitor for unusual trading patterns
- Set position limits and risk parameters
- Use wagmi's built-in error handling

## Complete Examples

### Full Trading Application with RainbowKit

```tsx
// app/trading/page.tsx
'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWalletClient, useChainId, useSwitchChain } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { signL1Action } from '@nktkas/hyperliquid/signing'
import { useState, useEffect } from 'react'

export default function TradingPage() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const queryClient = useQueryClient()
  
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [dexAccountId, setDexAccountId] = useState<number | null>(null)
  
  const isTestnet = chainId === arbitrumSepolia.id

  // Ensure correct network
  useEffect(() => {
    if (isConnected && chainId !== arbitrumSepolia.id) {
      switchChain({ chainId: arbitrumSepolia.id })
    }
  }, [isConnected, chainId, switchChain])

  // Initialize on wallet connect
  useEffect(() => {
    if (isConnected && address && walletClient) {
      authenticate()
    }
  }, [isConnected, address, walletClient])

  // Authenticate
  const authenticate = async () => {
    if (!address || !walletClient) return
    
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Authenticate to Magnolia\nAddress: ${address}\nTimestamp: ${timestamp}`
    
    const signature = await walletClient.signMessage({ message })
    const token = `Bearer ${address}:${signature}:${timestamp}`
    
    setAuthToken(token)
    
    // Get DEX accounts
    const response = await fetch('/api/hyperliquid/dex-accounts', {
      headers: { 'Authorization': token }
    })
    
    const { data } = await response.json()
    if (data.length > 0) {
      setDexAccountId(data[0].id)
    }
  }

  // Fetch orders
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', dexAccountId],
    queryFn: async () => {
      if (!dexAccountId || !authToken) return []
      
      const response = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders?status=open`, {
        headers: { 'Authorization': authToken }
      })
      
      const { data } = await response.json()
      return data
    },
    enabled: !!dexAccountId && !!authToken,
    refetchInterval: 5000
  })

  // Place order mutation
  const placeOrderMutation = useMutation({
    mutationFn: async ({ asset, side, price, size }: any) => {
      if (!walletClient || !dexAccountId || !authToken) throw new Error('Not ready')
      
      // Create order action for signing
      const orderAction = {
        type: 'order',
        orders: [{
          a: getAssetId(asset),
          b: side === 'buy',
          p: price,
          s: size,
          r: false,
          t: { limit: { tif: 'Gtc' } },
          c: `0x${Date.now().toString(16)}`
        }],
        grouping: 'na'
      }
      
      // Sign order
      const signature = await signL1Action({
        wallet: walletClient,
        action: orderAction,
        nonce: Date.now(),
        isTestnet
      })
      
      // Submit to backend
      const response = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': authToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orders: [{ asset, side, orderType: 'limit', size, price }],
          grouping: 'na',
          signature,
          nonce: Date.now()
        })
      })
      
      if (!response.ok) throw new Error('Failed to place order')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', dexAccountId] })
    }
  })

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, asset }: any) => {
      if (!walletClient || !dexAccountId || !authToken) throw new Error('Not ready')
      
      // Sign cancel
      const cancelAction = {
        type: 'cancel',
        cancels: [{
          a: getAssetId(asset),
          o: parseInt(orderId)
        }]
      }
      
      const signature = await signL1Action({
        wallet: walletClient,
        action: cancelAction,
        nonce: Date.now(),
        isTestnet
      })
      
      // Submit to backend
      const response = await fetch(`/api/hyperliquid/dex-accounts/${dexAccountId}/orders/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': authToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cancels: [{ asset, orderId }],
          signature,
          nonce: Date.now()
        })
      })
      
      if (!response.ok) throw new Error('Failed to cancel order')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', dexAccountId] })
    }
  })

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Hyperliquid Trading</h1>
          <ConnectButton />
        </div>

        {isConnected && dexAccountId ? (
          <>
            {/* Order Form */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Place Order</h2>
              <form onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                placeOrderMutation.mutate({
                  asset: formData.get('asset'),
                  side: formData.get('side'),
                  price: formData.get('price'),
                  size: formData.get('size')
                })
              }}>
                <div className="grid grid-cols-2 gap-4">
                  <select name="asset" className="border rounded p-2" required>
                    <option value="BTC">BTC</option>
                    <option value="ETH">ETH</option>
                    <option value="SOL">SOL</option>
                  </select>
                  <select name="side" className="border rounded p-2" required>
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                  <input
                    name="price"
                    type="number"
                    step="0.01"
                    placeholder="Price"
                    className="border rounded p-2"
                    required
                  />
                  <input
                    name="size"
                    type="number"
                    step="0.001"
                    placeholder="Size"
                    className="border rounded p-2"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={placeOrderMutation.isPending}
                  className="mt-4 w-full bg-blue-600 text-white rounded p-2 disabled:opacity-50"
                >
                  {placeOrderMutation.isPending ? 'Placing Order...' : 'Place Order'}
                </button>
              </form>
            </div>

            {/* Orders List */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Open Orders</h2>
              {isLoading ? (
                <p>Loading orders...</p>
              ) : orders.length === 0 ? (
                <p>No open orders</p>
              ) : (
                <div className="space-y-2">
                  {orders.map((order: any) => (
                    <div key={order.id} className="flex items-center justify-between p-4 border rounded">
                      <div>
                        <span className="font-medium">{order.asset}</span>
                        <span className={`ml-2 ${order.side === 'buy' ? 'text-green-600' : 'text-red-600'}`}>
                          {order.side.toUpperCase()}
                        </span>
                        <span className="ml-2">{order.size} @ ${order.price}</span>
                      </div>
                      <button
                        onClick={() => cancelOrderMutation.mutate({
                          orderId: order.hlOrderId,
                          asset: order.asset
                        })}
                        disabled={cancelOrderMutation.isPending}
                        className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-xl mb-4">Connect your wallet to start trading</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Helper function
function getAssetId(symbol: string): number {
  const assets: Record<string, number> = {
    BTC: 3,
    ETH: 4,
    SOL: 0,
  }
  return assets[symbol] || 0
}
```

## Troubleshooting

### Common Issues

1. **Wrong Network**
   - RainbowKit will show network switcher
   - Use wagmi's `useSwitchChain` hook to programmatically switch

2. **Authentication Expired**
   - Re-authenticate when receiving 401 errors
   - Use React Query's retry logic

3. **Wallet Not Connected**
   - RainbowKit handles connection state
   - Use wagmi's `useAccount` hook to check connection

4. **Signing Errors**
   - Ensure wallet client is available before signing
   - Check network matches expected chain ID

### Debug Mode

```typescript
// Enable wagmi debug mode
import { createConfig } from 'wagmi'

export const wagmiConfig = createConfig({
  // ... config
  logger: {
    warn: (message) => console.warn('WAGMI:', message),
  }
})

// Enable React Query devtools
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

// Add to your app
<ReactQueryDevtools initialIsOpen={false} />
```

## Additional Resources

- [RainbowKit Documentation](https://www.rainbowkit.com/docs/introduction)
- [Wagmi Documentation](https://wagmi.sh)
- [Viem Documentation](https://viem.sh)
- [Hyperliquid Documentation](https://hyperliquid.gitbook.io/hyperliquid-docs)
- [@nktkas/hyperliquid SDK](https://www.npmjs.com/package/@nktkas/hyperliquid)