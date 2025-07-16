import { z } from 'zod';

// Enums
export enum TimeInForce {
  ALO = 'Alo', // Add Liquidity Only (Post Only)
  IOC = 'Ioc', // Immediate or Cancel
  GTC = 'Gtc', // Good Till Canceled
}

export enum TpslType {
  TP = 'tp', // Take Profit
  SL = 'sl', // Stop Loss
}

export enum OrderGrouping {
  NA = 'na',
  NORMAL_TPSL = 'normalTpsl',
  POSITION_TPSL = 'positionTpsl',
}

export enum Chain {
  MAINNET = 'Mainnet',
  TESTNET = 'Testnet',
}

// Base Types
export interface LimitOrderType {
  limit: {
    tif: TimeInForce;
  };
}

export interface TriggerOrderType {
  trigger: {
    isMarket: boolean;
    triggerPx: string;
    tpsl: TpslType;
  };
}

export type OrderType = LimitOrderType | TriggerOrderType;

export interface Builder {
  b: string; // Builder address
  f: number; // Fee in tenths of basis point
}

// Order Interfaces
export interface OrderRequest {
  a: number; // Asset
  b: boolean; // isBuy
  p: string; // Price
  s: string; // Size
  r: boolean; // reduceOnly
  t: OrderType; // Type
  c?: string; // Client Order ID (optional)
}

export interface PlaceOrderAction {
  type: 'order';
  orders: OrderRequest[];
  grouping: OrderGrouping;
  builder?: Builder;
}

export interface CancelOrderAction {
  type: 'cancel';
  cancels: Array<{
    a: number; // Asset
    o: number; // Order ID
  }>;
}

export interface CancelByCloidAction {
  type: 'cancelByCloid';
  cancels: Array<{
    asset: number;
    cloid: string;
  }>;
}

export interface ScheduleCancelAction {
  type: 'scheduleCancel';
  time?: number;
}

export interface ModifyOrderAction {
  type: 'modify';
  oid: number | string; // Order ID or Client Order ID
  order: OrderRequest;
}

export interface BatchModifyAction {
  type: 'batchModify';
  modifies: Array<{
    oid: number | string;
    order: OrderRequest;
  }>;
}

export interface UpdateLeverageAction {
  type: 'updateLeverage';
  asset: number;
  isCross: boolean;
  leverage: number;
}

export interface UpdateIsolatedMarginAction {
  type: 'updateIsolatedMargin';
  asset: number;
  isBuy: boolean;
  ntli: number; // Amount with 6 decimals
}

export interface TopUpIsolatedMarginAction {
  type: 'topUpIsolatedOnlyMargin';
  asset: number;
  leverage: string;
}

export interface UsdSendAction {
  type: 'usdSend';
  hyperliquidChain: Chain;
  signatureChainId: string;
  destination: string;
  amount: string;
  time: number;
}

export interface SpotSendAction {
  type: 'spotSend';
  hyperliquidChain: Chain;
  signatureChainId: string;
  destination: string;
  token: string; // tokenName:tokenId
  amount: string;
  time: number;
}

export interface WithdrawAction {
  type: 'withdraw3';
  hyperliquidChain: Chain;
  signatureChainId: string;
  amount: string;
  time: number;
  destination: string;
}

export interface UsdClassTransferAction {
  type: 'usdClassTransfer';
  hyperliquidChain: Chain;
  signatureChainId: string;
  amount: string;
  toPerp: boolean;
  nonce: number;
  subaccount?: string;
}

export interface ApproveAgentAction {
  type: 'approveAgent';
  hyperliquidChain: Chain;
  signatureChainId: string;
  agentAddress: string;
  agentName?: string;
  nonce: number;
}

export type HyperliquidAction = 
  | PlaceOrderAction
  | CancelOrderAction
  | CancelByCloidAction
  | ScheduleCancelAction
  | ModifyOrderAction
  | BatchModifyAction
  | UpdateLeverageAction
  | UpdateIsolatedMarginAction
  | TopUpIsolatedMarginAction
  | UsdSendAction
  | SpotSendAction
  | WithdrawAction
  | UsdClassTransferAction
  | ApproveAgentAction;

// Request/Response Types
export interface HyperliquidRequest {
  action: HyperliquidAction;
  nonce: number;
  signature: any; // RSV object or hex string
  vaultAddress?: string;
  expiresAfter?: number;
}

export interface OrderStatus {
  resting?: {
    oid: number;
  };
  filled?: {
    totalSz: string;
    avgPx: string;
    oid: number;
  };
  error?: string;
  success?: boolean;
}

export interface HyperliquidResponse<T = any> {
  status: 'ok' | 'error';
  response: {
    type: string;
    data?: T;
    error?: string;
  };
}

export interface OrderResponse {
  statuses: OrderStatus[];
}

export interface CancelResponse {
  statuses: Array<{
    error?: string;
  }>;
}

// Validation Schemas
export const OrderRequestSchema = z.object({
  asset: z.string(),
  side: z.enum(['buy', 'sell']),
  orderType: z.enum(['market', 'limit', 'trigger_market', 'trigger_limit', 'oracle']),
  size: z.string(),
  price: z.string().optional(),
  reduceOnly: z.boolean().optional(),
  postOnly: z.boolean().optional(),
  timeInForce: z.enum(['Alo', 'Ioc', 'Gtc']).optional(),
  triggerPrice: z.string().optional(),
  triggerCondition: z.enum(['tp', 'sl']).optional(),
  oraclePriceOffset: z.string().optional(),
  auctionStartPrice: z.string().optional(),
  auctionEndPrice: z.string().optional(),
  auctionDuration: z.number().optional(),
  clientOrderId: z.string().optional(),
});

export const PlaceOrderRequestSchema = z.object({
  orders: z.array(OrderRequestSchema),
  grouping: z.enum(['na', 'normalTpsl', 'positionTpsl']).optional(),
  builderFee: z.number().optional(),
  signature: z.string().optional(), // Optional - will sign server-side if not provided
  nonce: z.string().optional(), // Optional - will generate if not provided
});

export const CancelOrderRequestSchema = z.object({
  cancels: z.array(z.object({
    asset: z.string(),
    orderId: z.string(),
  })),
  signature: z.string().optional(), // Optional - will sign server-side if not provided
  nonce: z.string().optional(), // Optional - will generate if not provided
});

export const CancelByCloidRequestSchema = z.object({
  cancels: z.array(z.object({
    asset: z.string(),
    cloid: z.string(),
  })),
  signature: z.string().optional(), // Optional - will sign server-side if not provided
  nonce: z.string().optional(), // Optional - will generate if not provided
});

export const ApproveAgentRequestSchema = z.object({
  agentAddress: z.string(),
  agentName: z.string().optional(),
  signature: z.string(),
  action: z.object({
    agentAddress: z.string(),
    agentName: z.string().optional(),
    type: z.literal('approveAgent'),
    hyperliquidChain: z.enum(['Mainnet', 'Testnet']),
    signatureChainId: z.string(),
    nonce: z.number(),
  }),
});

// Utility Types
export interface HyperliquidConfig {
  apiUrl: string;
  chain: Chain;
  signatureChainId: string;
}

export interface NonceManager {
  getNextNonce(address: string): Promise<number>;
  updateNonce(address: string, nonce: number): Promise<void>;
  pruneOldNonces(address: string): Promise<void>;
}