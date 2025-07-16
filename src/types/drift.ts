import { z } from 'zod';

// Enums
export enum MarketType {
  PERP = 'PERP',
  SPOT = 'SPOT',
}

export enum OrderDirection {
  LONG = 'long',
  SHORT = 'short',
}

export enum OrderType {
  MARKET = 'market',
  LIMIT = 'limit',
  TRIGGER_MARKET = 'trigger_market',
  TRIGGER_LIMIT = 'trigger_limit',
  ORACLE = 'oracle',
}

export enum OrderStatus {
  PENDING = 'pending',
  OPEN = 'open',
  FILLED = 'filled',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
  FAILED = 'failed',
}

export enum TriggerCondition {
  ABOVE = 'above',
  BELOW = 'below',
}

// Interfaces
export interface DriftOrder {
  driftOrderId?: string;
  clientOrderId?: string;
  marketIndex: number;
  marketType: MarketType;
  direction: OrderDirection;
  baseAssetAmount: string;
  price?: string;
  filledAmount?: string;
  avgFillPrice?: string;
  status: OrderStatus;
  orderType: OrderType;
  reduceOnly?: boolean;
  postOnly?: boolean;
  immediateOrCancel?: boolean;
  maxTs?: string;
  triggerPrice?: string;
  triggerCondition?: TriggerCondition;
  oraclePriceOffset?: string;
  auctionDuration?: number;
  auctionStartPrice?: string;
  auctionEndPrice?: string;
  rawParams?: any;
}

// Schemas
export const DriftOrderSchema = z.object({
  driftOrderId: z.string().optional(),
  clientOrderId: z.string().optional(),
  marketIndex: z.number(),
  marketType: z.nativeEnum(MarketType),
  direction: z.nativeEnum(OrderDirection),
  baseAssetAmount: z.string(),
  price: z.string().optional(),
  filledAmount: z.string().optional(),
  avgFillPrice: z.string().optional(),
  status: z.nativeEnum(OrderStatus),
  orderType: z.nativeEnum(OrderType),
  reduceOnly: z.boolean().optional(),
  postOnly: z.boolean().optional(),
  immediateOrCancel: z.boolean().optional(),
  maxTs: z.string().optional(),
  triggerPrice: z.string().optional(),
  triggerCondition: z.nativeEnum(TriggerCondition).optional(),
  oraclePriceOffset: z.string().optional(),
  auctionDuration: z.number().optional(),
  auctionStartPrice: z.string().optional(),
  auctionEndPrice: z.string().optional(),
  rawParams: z.any().optional(),
});

export const UpdateDriftOrdersRequestSchema = z.object({
  orders: z.array(DriftOrderSchema),
});

export const CreateDeltaNeutralPositionSchema = z.object({
  name: z.string(),
  driftOrderId: z.number(),
  hyperliquidOrderId: z.number(),
  metadata: z.any().optional(),
});