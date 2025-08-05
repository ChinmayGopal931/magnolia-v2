export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RequestContext {
  userId: number;
  accountId?: number;
  timestamp: Date;
  requestId: string;
}

export interface SignatureData {
  signature: string;
  nonce: number;
  timestamp: number;
  address: string;
}

export enum ErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  SIGNATURE_INVALID = 'SIGNATURE_INVALID',
  NONCE_INVALID = 'NONCE_INVALID',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  ORDER_REJECTED = 'ORDER_REJECTED',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface PositionUpdate {
  accountId: number;
  dexId: number;
  asset: string;
  side: 'buy' | 'sell';
  size: string;
  price: string;
  pnl?: string;
  margin?: string;
  leverage?: string;
}

export interface OrderUpdate {
  orderId: string;
  status: 'open' | 'filled' | 'cancelled' | 'failed';
  filledSize?: string;
  avgPrice?: string;
  timestamp: Date;
}