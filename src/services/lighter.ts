import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { RequestContext, ApiError, ErrorCode } from '@/types/common';
import { logger } from '@/utils/logger';

/**
 * TypeScript implementation based on lighter-go SDK patterns
 * Reference: https://github.com/elliottech/lighter-go
 */

// Transaction Options (based on TransactOpts from Go SDK)
export interface LighterTransactionOptions {
  fromAccountIndex: number;
  apiKeyIndex: number;
  expiredAt?: number;
  nonce?: string;
  dryRun?: boolean;
}

// Order Creation Request (based on CreateOrderTxReq from Go SDK)
export interface CreateOrderRequest {
  accountIndex: number;
  apiKeyIndex: number;
  marketId: number;
  side: 'buy' | 'sell';
  orderType: 'ORDER_TYPE_LIMIT' | 'ORDER_TYPE_MARKET' | 'ORDER_TYPE_STOP_LOSS' | 'ORDER_TYPE_STOP_LOSS_LIMIT' | 'ORDER_TYPE_TAKE_PROFIT' | 'ORDER_TYPE_TAKE_PROFIT_LIMIT' | 'ORDER_TYPE_TWAP';
  baseAmount: string; // Should be passed as integer in actual requests
  price?: string; // Should be passed as integer in actual requests
  timeInForce?: 'ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL' | 'ORDER_TIME_IN_FORCE_GOOD_TILL_TIME' | 'ORDER_TIME_IN_FORCE_POST_ONLY';
  clientOrderIndex?: number;
  reduceOnly?: boolean;
  nonce?: string;
  signature?: string;
  priceProtection?: boolean;
}

// Cancel Order Request
export interface CancelOrderRequest {
  accountIndex: number;
  apiKeyIndex: number;
  clientOrderIndex: number;
  nonce?: string;
  signature?: string;
}

// Account Data Response
export interface AccountDataResponse {
  status: number; // 1 = active, 0 = inactive
  collateral: string;
  positions: Array<{
    marketId: number;
    openOrderCount: number;
    sign: number; // 1 for Long, -1 for Short
    position: string;
    avgEntryPrice: string;
    positionValue: string;
    unrealizedPnl: string;
    realizedPnl: string;
  }>;
}

// API Key Response
export interface ApiKeyResponse {
  apiKeyIndex: number;
  publicKey: string;
  isActive: boolean;
}

// Nonce Response
export interface NonceResponse {
  nonce: string;
}

// Order Response
export interface OrderResponse {
  orderId?: string;
  clientOrderIndex?: number;
  status: string;
  txHash?: string;
  message?: string;
}

export class LighterService {
  private httpClient: AxiosInstance;
  private baseUrl: string;
  private fatFingerProtection: boolean = true;

  constructor(baseUrl: string = 'https://mainnet.zklighter.elliot.ai') {
    this.baseUrl = baseUrl;
    
    // HTTP client configuration based on Go SDK http_client.go
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // Additional config based on Go SDK transport settings
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Handle 4xx as valid responses
    });

    // Request/Response interceptors for logging
    this.httpClient.interceptors.request.use(
      (config) => {
        logger.debug('Lighter API Request', {
          method: config.method,
          url: config.url,
          data: config.data ? JSON.stringify(config.data).substring(0, 200) : undefined,
        });
        return config;
      },
      (error) => {
        logger.error('Lighter API Request Error', { error });
        return Promise.reject(error);
      }
    );

    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug('Lighter API Response', {
          status: response.status,
          url: response.config.url,
          data: JSON.stringify(response.data).substring(0, 200),
        });
        return response;
      },
      (error) => {
        logger.error('Lighter API Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set fat finger protection (based on Go SDK SetFatFingerProtection)
   */
  setFatFingerProtection(enabled: boolean): void {
    this.fatFingerProtection = enabled;
  }

  /**
   * Get account data by index or L1 address (based on Go SDK HTTP requests)
   */
  async getAccountData(by: 'index' | 'l1_address', value: string, auth?: string): Promise<AccountDataResponse> {
    try {
      const config: AxiosRequestConfig = {
        params: { by, value }
      };

      if (auth) {
        config.headers = { authorization: auth };
        config.params.auth = auth;
      }

      const response = await this.httpClient.get('/api/v1/account', config);

      if (response.status !== 200) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter API error: ${response.data?.message || 'Unknown error'}`
        );
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter API request failed: ${error.message}`,
          { status: error.response?.status, data: error.response?.data }
        );
      }
      throw error;
    }
  }

  /**
   * Get API keys for account (based on Go SDK GetApiKey)
   */
  async getApiKeys(accountIndex: number, apiKeyIndex: number = 255): Promise<ApiKeyResponse[]> {
    try {
      const response = await this.httpClient.get('/api/v1/apikeys', {
        params: {
          account_index: accountIndex,
          api_key_index: apiKeyIndex // 255 retrieves all API keys
        }
      });

      if (response.status !== 200) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter API error: ${response.data?.message || 'Unknown error'}`
        );
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter API request failed: ${error.message}`,
          { status: error.response?.status, data: error.response?.data }
        );
      }
      throw error;
    }
  }

  /**
   * Get next nonce for account (based on Go SDK GetNextNonce)
   */
  async getNextNonce(accountIndex: number, apiKeyIndex: number): Promise<NonceResponse> {
    try {
      // Note: Implementation depends on actual Lighter API endpoint structure
      // This follows the pattern from Go SDK but may need adjustment
      const response = await this.httpClient.get('/api/v1/nonce', {
        params: {
          account_index: accountIndex,
          api_key_index: apiKeyIndex
        }
      });

      if (response.status !== 200) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter API error: ${response.data?.message || 'Unknown error'}`
        );
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter API request failed: ${error.message}`,
          { status: error.response?.status, data: error.response?.data }
        );
      }
      throw error;
    }
  }

  /**
   * Send raw transaction (based on Go SDK SendRawTx)
   * Note: In practice, transactions should be signed on the frontend with proper crypto libraries
   */
  async sendRawTransaction(txType: number, txInfo: string, priceProtection: boolean = true): Promise<OrderResponse> {
    try {
      const formData = new FormData();
      formData.append('tx_type', txType.toString());
      formData.append('tx_info', txInfo);
      formData.append('price_protection', priceProtection.toString());

      const response = await this.httpClient.post('/api/v1/sendTx', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        }
      });

      if (response.status !== 200) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter transaction failed: ${response.data?.message || 'Unknown error'}`
        );
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter transaction request failed: ${error.message}`,
          { status: error.response?.status, data: error.response?.data }
        );
      }
      throw error;
    }
  }

  /**
   * Send multiple transactions in batch
   */
  async sendTransactionBatch(txTypes: string, txInfos: string): Promise<OrderResponse[]> {
    try {
      const response = await this.httpClient.post('/api/v1/sendTxBatch', {
        tx_types: txTypes,
        tx_infos: txInfos
      });

      if (response.status !== 200) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter batch transaction failed: ${response.data?.message || 'Unknown error'}`
        );
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter batch transaction request failed: ${error.message}`,
          { status: error.response?.status, data: error.response?.data }
        );
      }
      throw error;
    }
  }

  /**
   * Get transaction by hash or sequence index
   */
  async getTransaction(by: 'hash' | 'sequence_index', value: string): Promise<any> {
    try {
      const response = await this.httpClient.get('/api/v1/tx', {
        params: { by, value }
      });

      if (response.status !== 200) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter API error: ${response.data?.message || 'Unknown error'}`
        );
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter API request failed: ${error.message}`,
          { status: error.response?.status, data: error.response?.data }
        );
      }
      throw error;
    }
  }

  /**
   * Get orderbook data for a market
   */
  async getOrderBook(marketId: number): Promise<any> {
    try {
      const response = await this.httpClient.get('/api/v1/orderbook', {
        params: { market_id: marketId }
      });

      if (response.status !== 200) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter API error: ${response.data?.message || 'Unknown error'}`
        );
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter API request failed: ${error.message}`,
          { status: error.response?.status, data: error.response?.data }
        );
      }
      throw error;
    }
  }

  /**
   * Get PnL chart data
   */
  async getPnLChart(
    accountIndex: number,
    resolution: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
    startTimestamp: number,
    endTimestamp: number,
    countBack: number,
    ignoreTransfers: boolean = false,
    auth?: string
  ): Promise<any> {
    try {
      const config: AxiosRequestConfig = {
        params: {
          by: 'index',
          value: accountIndex.toString(),
          resolution,
          start_timestamp: startTimestamp,
          end_timestamp: endTimestamp,
          count_back: countBack,
          ignore_transfers: ignoreTransfers,
        }
      };

      if (auth) {
        config.headers = { authorization: auth };
        config.params.auth = auth;
      }

      const response = await this.httpClient.get('/api/v1/pnl', config);

      if (response.status !== 200) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter API error: ${response.data?.message || 'Unknown error'}`
        );
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          `Lighter API request failed: ${error.message}`,
          { status: error.response?.status, data: error.response?.data }
        );
      }
      throw error;
    }
  }

  /**
   * IMPORTANT: Order placement methods are placeholders
   * In the actual implementation, orders should be signed on the frontend using proper cryptographic libraries
   * and then the signed transaction data should be sent to the backend for database storage only
   */

  /**
   * Placeholder for order creation - NOT FOR ACTUAL USE
   * Orders should be placed on the frontend and execution data sent to backend
   */
  async createOrderPlaceholder(ctx: RequestContext, dexAccountId: number, orderData: CreateOrderRequest): Promise<OrderResponse> {
    logger.warn('createOrderPlaceholder called - this should not be used for actual order placement');
    
    throw new ApiError(
      ErrorCode.NOT_IMPLEMENTED,
      'Order placement should be done on the frontend. Use the custom-order endpoint to record already-executed orders.'
    );
  }

  /**
   * Placeholder for order cancellation - NOT FOR ACTUAL USE
   */
  async cancelOrderPlaceholder(ctx: RequestContext, dexAccountId: number, cancelData: CancelOrderRequest): Promise<OrderResponse> {
    logger.warn('cancelOrderPlaceholder called - this should not be used for actual order cancellation');
    
    throw new ApiError(
      ErrorCode.NOT_IMPLEMENTED,
      'Order cancellation should be done on the frontend.'
    );
  }
}