import { DatabaseRepository } from '@/db/repository';
import {
  HyperliquidAction,
  HyperliquidRequest,
  HyperliquidResponse,
  OrderResponse,
  CancelResponse,
  Chain,
  OrderGrouping,
  PlaceOrderRequestSchema,
  CancelOrderRequestSchema,
  CancelByCloidRequestSchema,
} from '@/types/hyperliquid';
import { ApiError, ErrorCode, RequestContext } from '@/types/common';
import { logger } from '@/utils/logger';
import { NonceManager } from '@/utils/nonce';
import { dexConfig } from '@/config/dex.config';
import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { privateKeyToAccount } from 'viem/accounts';
// Import signL1Action dynamically to avoid module resolution issues

export class HyperliquidService {
  private db: DatabaseRepository;
  private client: AxiosInstance;
  private nonceManager: NonceManager;
  private config: {
    apiUrl: string;
    chain: Chain;
    signatureChainId: string;
  };

  constructor() {
    this.db = new DatabaseRepository();
    this.nonceManager = new NonceManager();
    
    // Get config from centralized configuration
    const hlConfig = dexConfig.getHyperliquidConfig();
    this.config = {
      apiUrl: hlConfig.apiUrl,
      chain: hlConfig.chain as Chain,
      signatureChainId: hlConfig.signatureChainId,
    };

    // Initialize HTTP client
    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info('HyperliquidService initialized', {
      environment: dexConfig.getEnvironment(),
      apiUrl: this.config.apiUrl,
      chain: this.config.chain,
    });
  }

  /**
   * Create or update a DEX account (agent wallet)
   */
  async createOrUpdateDexAccount(ctx: RequestContext, data: {
    address: string;
    accountType: 'master' | 'agent_wallet';
    agentName?: string;
    encryptedPrivateKey?: string;
    nonce?: string;
    metadata?: any;
  }) {
    // Check if account already exists
    const existingAccount = await this.db.getDexAccountByAddress(data.address, 'hyperliquid');
    
    if (existingAccount) {
      // Update existing account
      return await this.db.updateDexAccount(existingAccount.id, {
        nonce: data.nonce,
        metadata: data.metadata,
      });
    }

    // Create new account
    return await this.db.createDexAccount({
      userId: ctx.userId!,
      dexType: 'hyperliquid',
      ...data,
    });
  }

  /**
   * Get user's DEX accounts
   */
  async getUserDexAccounts(ctx: RequestContext) {
    return await this.db.getUserDexAccounts(ctx.userId!, 'hyperliquid');
  }

  /**
   * Check if user has an agent wallet
   */
  async hasAgentWallet(ctx: RequestContext): Promise<boolean> {
    const accounts = await this.db.getUserDexAccounts(ctx.userId!, 'hyperliquid');
    return accounts.some(acc => acc.accountType === 'agent_wallet');
  }

  /**
   * Place orders on Hyperliquid
   */
  async placeOrder(
    ctx: RequestContext,
    dexAccountId: number,
    orderData: any
  ): Promise<OrderResponse> {
    // Validate request
    const validated = PlaceOrderRequestSchema.parse(orderData);
    
    // Get DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    // Get or generate nonce
    const nonce = validated.nonce || await this.nonceManager.getNextNonce(dexAccount.address);

    // Build Hyperliquid action
    const action: HyperliquidAction = {
      type: 'order',
      orders: validated.orders.map(order => ({
        a: Number(order.asset), // 0 = BTC, 1 = ETH, etc.
        b: order.side === 'buy',
        p: order.price || '0', // Use string as-is
        s: order.size, // Use string as-is
        r: order.reduceOnly || false,
        t: this.buildOrderType(order),
        c: order.clientOrderId,
      })),
      grouping: (validated.grouping || 'na') as OrderGrouping,
    };

    // Add builder fee if specified
    if (validated.builderFee && validated.builderFee > 0) {
      (action as any).builder = {
        b: dexAccount.address, // Builder receives the fee
        f: validated.builderFee,
      };
    }

    // Sign the order if signature not provided
    let signature: any = validated.signature;
    
    if (!signature) {
      // Check if this is an agent wallet account
      if (!dexAccount.encryptedPrivateKey) {
        throw new ApiError(ErrorCode.INVALID_REQUEST, 'Cannot sign orders for accounts without stored private keys');
      }
      
      // Import the signing function from SDK and viem account
      const { signL1Action } = await import('@nktkas/hyperliquid/signing');
      
      // Create account from private key using viem (like in the example)
      const account = privateKeyToAccount(dexAccount.encryptedPrivateKey as `0x${string}`);
      
      // Ensure the address is lowercase (Hyperliquid requirement)
      logger.info('Agent wallet address', { 
        original: account.address,
        lowercase: account.address.toLowerCase()
      });
      
      // Sign the action using viem account
      signature = await signL1Action({
        wallet: account,
        action: action as any, // Type assertion needed due to SDK type limitations
        nonce: Number(nonce),
        isTestnet: this.config.chain === 'Testnet'
      });
      
      logger.info('Signed order server-side', { 
        userId: ctx.userId,
        dexAccountId,
        orderCount: action.orders.length 
      });
    }

    // Send request to Hyperliquid
    const request: HyperliquidRequest = {
      action,
      nonce: Number(nonce),
      signature,
    };
    
    // Log the exact request being sent
    logger.info('Sending order request to Hyperliquid', {
      request: JSON.stringify(request, null, 2),
      signatureType: typeof signature
    });

    try {
      const response = await this.client.post<HyperliquidResponse>('/exchange', request);
      
      // Store orders in database
      for (let i = 0; i < validated.orders.length; i++) {
        const order = validated.orders[i];
        const orderResponse = response.data.response?.data?.statuses?.[i];
        
        await this.db.createHyperliquidOrder({
          dexAccountId,
          userId: ctx.userId!,
          clientOrderId: order.clientOrderId,
          asset: order.asset,
          side: order.side,
          orderType: order.orderType,
          price: order.price,
          size: order.size,
          status: orderResponse?.error ? 'rejected' : 'pending',
          reduceOnly: order.reduceOnly,
          postOnly: order.postOnly,
          timeInForce: order.timeInForce,
          triggerPrice: order.triggerPrice,
          triggerCondition: order.triggerCondition,
          oraclePriceOffset: order.oraclePriceOffset,
          auctionStartPrice: order.auctionStartPrice,
          auctionEndPrice: order.auctionEndPrice,
          auctionDuration: order.auctionDuration,
          signature: validated.signature,
          nonce: nonce.toString(),
          builderFee: validated.builderFee?.toString(),
          rawResponse: orderResponse,
        });
      }

      // Update account nonce
      await this.db.updateDexAccount(dexAccountId, { nonce: nonce.toString() });

      return response.data.response as unknown as OrderResponse;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data;
        const errorMessage = typeof errorData === 'string' 
          ? errorData 
          : errorData?.error || errorData?.message || 'Unknown error';
        
        logger.error('Hyperliquid API request failed', {
          status: error.response?.status,
          message: errorMessage,
          dexAccountId,
          orderCount: validated.orders.length,
          // Only log signature type for debugging
          signatureType: typeof request.signature
        });
        
        // Return a clean error message
        if (error.response?.status === 422) {
          throw new ApiError(ErrorCode.INVALID_REQUEST, `Invalid request format: ${errorMessage}`);
        } else if (error.response?.status === 400) {
          throw new ApiError(ErrorCode.INVALID_REQUEST, errorMessage);
        } else if (error.response?.status === 401) {
          throw new ApiError(ErrorCode.UNAUTHORIZED, 'Invalid signature or nonce');
        } else {
          throw new ApiError(ErrorCode.INTERNAL_ERROR, errorMessage);
        }
      }
      
      logger.error('Unexpected error placing order', { error: error instanceof Error ? error.message : error, dexAccountId });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to place order');
    }
  }

  /**
   * Cancel orders
   */
  async cancelOrder(
    ctx: RequestContext,
    dexAccountId: number,
    cancelData: any
  ): Promise<CancelResponse> {
    // Validate request
    const validated = CancelOrderRequestSchema.parse(cancelData);
    
    // Get DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    // Build action
    const action: HyperliquidAction = {
      type: 'cancel',
      cancels: validated.cancels.map(cancel => ({
        a: Number(cancel.asset),
        o: Number(cancel.orderId),
      })),
    };

    // Get or generate nonce
    const nonce = validated.nonce || await this.nonceManager.getNextNonce(dexAccount.address);
    
    // Sign the cancellation if signature not provided
    let signature: any = validated.signature;
    
    if (!signature) {
      if (!dexAccount.encryptedPrivateKey) {
        throw new ApiError(ErrorCode.INVALID_REQUEST, 'Cannot sign orders for accounts without stored private keys');
      }
      
      const { signL1Action } = await import('@nktkas/hyperliquid/signing');
      const account = privateKeyToAccount(dexAccount.encryptedPrivateKey as `0x${string}`);

      signature = await signL1Action({
        wallet: account,
        action: action as any,
        nonce: Number(nonce),
        isTestnet: this.config.chain === 'Testnet'
      });
      
      logger.info('Signed cancel order server-side', { userId: ctx.userId, dexAccountId });
    }

    // Send request
    const request: HyperliquidRequest = {
      action,
      nonce: Number(nonce),
      signature,
    };

    try {
      const response = await this.client.post<HyperliquidResponse>('/exchange', request);
      
      // Update order status in database
      // Note: We would need to track order IDs to update them properly
      
      return response.data.response as unknown as CancelResponse;
    } catch (error) {
      logger.error('Failed to cancel order', { error, dexAccountId });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to cancel order');
    }
  }

  /**
   * Cancel orders by client order ID
   */
  async cancelOrderByCloid(
    ctx: RequestContext,
    dexAccountId: number,
    cancelData: any
  ): Promise<CancelResponse> {
    // Validate request
    const validated = CancelByCloidRequestSchema.parse(cancelData);
    
    // Get DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    // Build action
    const action: HyperliquidAction = {
      type: 'cancelByCloid',
      cancels: validated.cancels.map(cancel => ({
        asset: Number(cancel.asset),
        cloid: cancel.cloid,
      })),
    };

    // Get or generate nonce
    const nonce = validated.nonce || await this.nonceManager.getNextNonce(dexAccount.address);
    
    // Sign the cancellation if signature not provided
    let signature: any = validated.signature;
    
    if (!signature) {
      if (!dexAccount.encryptedPrivateKey) {
        throw new ApiError(ErrorCode.INVALID_REQUEST, 'Cannot sign orders for accounts without stored private keys');
      }
      
      const { signL1Action } = await import('@nktkas/hyperliquid/signing');
      const account = privateKeyToAccount(dexAccount.encryptedPrivateKey as `0x${string}`);
      
      signature = await signL1Action({
        wallet: account,
        action: action as any,
        nonce: Number(nonce),
        isTestnet: this.config.chain === 'Testnet'
      });
      
      logger.info('Signed cancel by cloid server-side', { userId: ctx.userId, dexAccountId });
    }

    // Send request
    const request: HyperliquidRequest = {
      action,
      nonce: Number(nonce),
      signature,
    };

    try {
      const response = await this.client.post<HyperliquidResponse>('/exchange', request);
      
      // Update order status in database
      for (const cancel of validated.cancels) {
        const orders = await this.db.getHyperliquidOrders({
          dexAccountId,
          clientOrderId: cancel.cloid,
        });
        
        for (const order of orders) {
          await this.db.updateHyperliquidOrder(order.id, {
            status: 'cancelled',
          });
        }
      }
      
      return response.data.response as unknown as CancelResponse;
    } catch (error) {
      logger.error('Failed to cancel order by cloid', { error, dexAccountId });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to cancel order');
    }
  }

  /**
   * Get orders
   */
  async getOrders(
    ctx: RequestContext,
    dexAccountId: number,
    filters: { asset?: string; status?: 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired' }
  ) {
    // Verify access
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    return await this.db.getHyperliquidOrders({
      dexAccountId,
      ...filters,
      status: filters.status as 'open' | 'filled' | 'cancelled' | 'failed' | 'pending' | 'rejected' | 'triggered' | 'marginCanceled' | 'liquidatedCanceled' | 'expired' | undefined,
    });
  }

  /**
   * Get user positions
   */
  async getUserPositions(
    ctx: RequestContext,
    filters?: { status?: string; positionType?: string }
  ) {
    const positions = await this.db.getUserPositions(ctx.userId!, filters);
    
    // Fetch position details with snapshots
    const positionsWithSnapshots = await Promise.all(
      positions.map(pos => this.db.getPositionWithSnapshots(pos.id))
    );

    return positionsWithSnapshots;
  }

  /**
   * Create a new position
   */
  async createPosition(
    ctx: RequestContext,
    data: {
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
  ) {
    return await this.db.transaction(async (_tx) => {
      // Create position
      const position = await this.db.createPosition({
        userId: ctx.userId!,
        positionType: data.positionType,
        name: data.name,
        metadata: data.metadata,
      });

      // Create position snapshots
      for (const snapshot of data.snapshots) {
        // Verify order belongs to user and get order details
        const orders = await this.db.getHyperliquidOrders({
          userId: ctx.userId,
        });
        
        const order = orders.find(o => o.id === snapshot.orderId);
        if (!order) {
          throw new ApiError(ErrorCode.NOT_FOUND, 'Order not found');
        }

        // Calculate notional value
        const notionalValue = parseFloat(snapshot.size) * parseFloat(snapshot.entryPrice);

        await this.db.createPositionSnapshot({
          positionId: position.id,
          dexType: 'hyperliquid',
          dexAccountId: order.dexAccountId,
          symbol: snapshot.symbol,
          side: snapshot.side,
          entryPrice: snapshot.entryPrice,
          currentPrice: snapshot.entryPrice, // Same as entry initially
          size: snapshot.size,
          notionalValue: notionalValue.toString(),
          hyperliquidOrderId: snapshot.orderId,
        });
      }

      return await this.db.getPositionWithSnapshots(position.id);
    });
  }

  /**
   * Update position
   */
  async updatePosition(
    ctx: RequestContext,
    positionId: number,
    data: {
      status?: 'open' | 'closed' | 'liquidated';
      totalPnl?: string;
      metadata?: any;
    }
  ) {
    // Verify ownership
    const position = await this.db.getPositionWithSnapshots(positionId);
    if (!position || position.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this position');
    }

    // Update position
    const updated = await this.db.updatePosition(positionId, {
      ...data,
      closedAt: data.status === 'closed' || data.status === 'liquidated' ? new Date() : undefined,
    });

    return await this.db.getPositionWithSnapshots(updated.id);
  }

  /**
   * Get fills/trades for an account
   */
  async getFills(
    ctx: RequestContext,
    dexAccountId: number,
    filters: {
      limit?: number;
      startDate?: Date;
      endDate?: Date;
      asset?: string;
    }
  ) {
    // Verify access
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    // For now, return filled orders as fills
    const orders = await this.db.getHyperliquidOrders({
      dexAccountId,
      status: 'filled',
      asset: filters.asset,
    });

    // Apply date filters if provided
    let filteredOrders = orders;
    if (filters.startDate) {
      filteredOrders = filteredOrders.filter(o => 
        new Date(o.createdAt) >= filters.startDate!
      );
    }
    if (filters.endDate) {
      filteredOrders = filteredOrders.filter(o => 
        new Date(o.createdAt) <= filters.endDate!
      );
    }

    // Apply limit
    if (filters.limit) {
      filteredOrders = filteredOrders.slice(0, filters.limit);
    }

    return filteredOrders;
  }

  /**
   * Helper: Build order type for Hyperliquid API
   */
  private buildOrderType(order: any) {
    switch (order.orderType) {
      case 'limit':
        // If postOnly is true, use 'Alo' (Add Liquidity Only)
        // For testing, let's try 'Ioc' for market-like behavior
        const tif = order.postOnly ? 'Ioc' : (order.timeInForce || 'Gtc');
        return {
          limit: {
            tif: tif,
          },
        };
      case 'trigger_market':
      case 'trigger_limit':
        return {
          trigger: {
            isMarket: order.orderType === 'trigger_market',
            triggerPx: order.triggerPrice,
            tpsl: order.triggerCondition,
          },
        };
      default:
        return { limit: { tif: 'Gtc' } };
    }
  }

  /**
   * Create and approve an agent wallet for Hyperliquid trading
   */
  async createAndApproveAgentWallet(
    ctx: RequestContext,
    data: {
      masterAddress: string;
      agentName: string;
      signature: string | { r: string; s: string; v: number };
      nonce: string;
      agentAddress?: string; // Optional: if provided, use this address
      agentPrivateKey?: string; // Optional: if provided, use this private key
      actionData?: any; // Optional: pre-formatted action from frontend using SDK
    }
  ) {
    try {
      // Check if user already has an agent wallet
      const existingAccounts = await this.db.getUserDexAccounts(ctx.userId!, 'hyperliquid');
      const existingAgentWallet = existingAccounts.find(acc => acc.accountType === 'agent_wallet');
      
      if (existingAgentWallet) {
        throw new ApiError(ErrorCode.CONFLICT, 'User already has an agent wallet');
      }

      // Use provided agent wallet or generate a new one
      let agentAddress: string;
      let privateKey: string;
      
      if (data.agentAddress && data.agentPrivateKey) {
        // Use the pre-generated wallet from frontend
        agentAddress = data.agentAddress;
        privateKey = data.agentPrivateKey;
        
        // Validate the provided address and private key match
        try {
          const wallet = new ethers.Wallet(privateKey);
          if (wallet.address.toLowerCase() !== agentAddress.toLowerCase()) {
            throw new ApiError(ErrorCode.INVALID_REQUEST, 'Agent address and private key do not match');
          }
        } catch (e) {
          throw new ApiError(ErrorCode.INVALID_REQUEST, 'Invalid agent private key');
        }
        
        logger.info('Using pre-generated agent wallet', { 
          userId: ctx.userId,
          agentAddress,
          masterAddress: data.masterAddress 
        });
      } else {
        // Generate a new wallet (backward compatibility)
        const wallet = ethers.Wallet.createRandom();
        agentAddress = wallet.address;
        privateKey = wallet.privateKey;
        
        logger.info('Generated new agent wallet', { 
          userId: ctx.userId,
          agentAddress,
          masterAddress: data.masterAddress 
        });
      }

      // Use actionData from frontend if provided (when using SDK), otherwise create it
      let action: HyperliquidAction;
      
      if (data.actionData) {
        // Use the pre-formatted action from frontend SDK
        action = data.actionData;
        
        // Clean up empty agentName if needed (SDK behavior)
        if (action.type === 'approveAgent' && action.agentName === "") {
          delete action.agentName;
        }
      } else {
        // Fallback to creating action (backward compatibility)
        action = {
          type: 'approveAgent' as const,
          agentAddress,
          agentName: data.agentName,
          hyperliquidChain: this.config.chain,
          signatureChainId: this.config.signatureChainId,
          nonce: Number(data.nonce)
        };
      }

      // Send approval request to Hyperliquid
      const request: HyperliquidRequest = {
        action,
        nonce: Number(data.nonce),
        signature: data.signature, // Can be string or {r, s, v} format
      };

      const response = await this.client.post<HyperliquidResponse>('/exchange', request);
      
      if (response.data.status !== 'ok') {
        const errorMessage = typeof response.data.response?.error === 'string' 
          ? response.data.response.error
          : response.data.response?.error || 'Failed to approve agent wallet';
        logger.error('Agent approval failed', { error: errorMessage, response: response.data });
        throw new ApiError(ErrorCode.INTERNAL_ERROR, errorMessage);
      }

      // Save the agent wallet to the database
      const agentAccount = await this.db.createDexAccount({
        userId: ctx.userId!,
        dexType: 'hyperliquid',
        address: agentAddress,
        accountType: 'agent_wallet',
        encryptedPrivateKey: privateKey, // Storing plain text for now as requested
        agentName: data.agentName,
        metadata: {
          masterAddress: data.masterAddress,
          approvedAt: new Date().toISOString(),
        },
      });

      logger.info('Agent wallet created and approved successfully', {
        userId: ctx.userId,
        agentAddress,
        accountId: agentAccount.id,
      });

      // Return the account info (without private key)
      return {
        id: agentAccount.id,
        address: agentAccount.address,
        accountType: agentAccount.accountType,
        agentName: agentAccount.agentName,
        isActive: agentAccount.isActive,
        createdAt: agentAccount.createdAt,
      };
    } catch (error) {
      logger.error('Failed to create and approve agent wallet', { error, userId: ctx.userId });
      
      if (error instanceof ApiError) {
        throw error;
      }
      
      // Check for specific Hyperliquid errors
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error?.message || 
                           error.response?.data?.message || 
                           error.message;
        
        if (errorMessage.includes('Must deposit before performing actions') ||
            errorMessage.includes('insufficient funds') ||
            errorMessage.includes('account does not exist')) {
          throw new ApiError(
            ErrorCode.INVALID_REQUEST, 
            'Master account needs to deposit funds to Hyperliquid before approving an agent wallet'
          );
        }
      }
      
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create and approve agent wallet');
    }
  }

  /**
   * Record a deposit transaction
   * Note: Deposits on Hyperliquid happen on L1, this just tracks them
   */
  async recordDeposit(
    ctx: RequestContext,
    dexAccountId: number,
    data: {
      amount: string;
      tokenSymbol: string;
      txHash: string;
      fromAddress: string;
    }
  ) {
    // Verify access to DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    logger.info('Recording Hyperliquid deposit', {
      userId: ctx.userId,
      dexAccountId,
      amount: data.amount,
      tokenSymbol: data.tokenSymbol,
      txHash: data.txHash,
    });

    // Create transaction record using position snapshot
    const snapshot = await this.db.createPositionSnapshot({
      positionId: 0, // Using 0 for non-position transactions
      dexType: 'hyperliquid',
      dexAccountId,
      symbol: data.tokenSymbol,
      side: 'long', // Deposits increase balance
      entryPrice: '1',
      currentPrice: '1',
      size: data.amount,
      notionalValue: data.amount,
      metadata: {
        type: 'deposit',
        txHash: data.txHash,
        fromAddress: data.fromAddress,
      },
    });

    return {
      success: true,
      transactionId: snapshot.id,
      txHash: data.txHash,
      amount: data.amount,
      tokenSymbol: data.tokenSymbol,
    };
  }

  /**
   * Record a withdrawal transaction
   * Note: Withdrawals on Hyperliquid happen on L1, this just tracks them
   */
  async recordWithdrawal(
    ctx: RequestContext,
    dexAccountId: number,
    data: {
      amount: string;
      tokenSymbol: string;
      txHash: string;
      destinationAddress: string;
      nonce: string;
      signature: string;
    }
  ) {
    // Verify access to DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    logger.info('Recording Hyperliquid withdrawal', {
      userId: ctx.userId,
      dexAccountId,
      amount: data.amount,
      tokenSymbol: data.tokenSymbol,
      txHash: data.txHash,
    });

    // Create transaction record
    const snapshot = await this.db.createPositionSnapshot({
      positionId: 0, // Using 0 for non-position transactions
      dexType: 'hyperliquid',
      dexAccountId,
      symbol: data.tokenSymbol,
      side: 'short', // Withdrawals decrease balance
      entryPrice: '1',
      currentPrice: '1',
      size: data.amount,
      notionalValue: data.amount,
      metadata: {
        type: 'withdrawal',
        txHash: data.txHash,
        destinationAddress: data.destinationAddress,
        nonce: data.nonce,
        signature: data.signature,
      },
    });

    return {
      success: true,
      transactionId: snapshot.id,
      txHash: data.txHash,
      amount: data.amount,
      tokenSymbol: data.tokenSymbol,
    };
  }

  /**
   * Get deposit/withdrawal history
   */
  async getTransactionHistory(
    ctx: RequestContext,
    dexAccountId: number,
    filters?: {
      type?: 'deposit' | 'withdrawal';
      startDate?: string;
      endDate?: string;
      limit?: number;
    }
  ) {
    // Verify access
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied to this account');
    }

    // Query snapshots with transaction metadata
    const allSnapshots = await this.db.getLatestPositionSnapshots(0);
    
    let transactions = allSnapshots.filter(snapshot => {
      if (snapshot.dexAccountId !== dexAccountId) return false;
      
      const metadata = snapshot.metadata as any;
      if (!metadata.type || (metadata.type !== 'deposit' && metadata.type !== 'withdrawal')) {
        return false;
      }
      
      if (filters?.type && metadata.type !== filters.type) {
        return false;
      }
      
      const snapshotDate = new Date(snapshot.snapshotAt);
      if (filters?.startDate && snapshotDate < new Date(filters.startDate)) {
        return false;
      }
      if (filters?.endDate && snapshotDate > new Date(filters.endDate)) {
        return false;
      }
      
      return true;
    });

    // Sort by date descending
    transactions.sort((a, b) => 
      new Date(b.snapshotAt).getTime() - new Date(a.snapshotAt).getTime()
    );

    // Apply limit
    if (filters?.limit) {
      transactions = transactions.slice(0, filters.limit);
    }

    return transactions.map(snapshot => {
      const metadata = snapshot.metadata as any;
      return {
        id: snapshot.id,
        type: metadata.type,
        tokenSymbol: snapshot.symbol,
        amount: snapshot.size,
        txHash: metadata.txHash,
        timestamp: snapshot.snapshotAt,
        destinationAddress: metadata.destinationAddress,
        fromAddress: metadata.fromAddress,
      };
    });
  }
}