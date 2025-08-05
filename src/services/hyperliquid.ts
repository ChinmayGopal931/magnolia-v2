import { DatabaseRepository } from "@/db/repository";
import {
  CancelByCloidRequestSchema,
  CancelOrderRequestSchema,
  CancelResponse,
  Chain,
  HyperliquidAction,
  HyperliquidRequest,
  HyperliquidResponse,
  OrderResponse,
  PlaceOrderRequestSchema,
} from "@/types/hyperliquid";
import { ApiError, ErrorCode, RequestContext } from "@/types/common";
import { logger } from "@/utils/logger";
import { NonceManager } from "@/utils/nonce";
import { dexConfig } from "@/config/dex.config";
import axios, { AxiosInstance } from "axios";
import { ethers } from "ethers";
import { signL1Action } from "@nktkas/hyperliquid/signing";
import * as hl from "@nktkas/hyperliquid";

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
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Get current market prices
   * Returns a map of assetId -> price
   */
  async getMarketPrices(): Promise<Record<number, number>> {
    try {
      const response = await this.client.post("/info", {
        type: "allMids",
      });

      const prices: Record<number, number> = {};
      if (response.data && typeof response.data === "object") {
        Object.entries(response.data).forEach(([assetId, price]) => {
          prices[Number(assetId)] = Number(price);
        });
      }

      return prices;
    } catch (error) {
      logger.error("Failed to fetch market prices", { error });
      return {};
    }
  }

  /**
   * Get detailed asset prices including mark price, mid price, etc.
   * Returns a map of assetId -> price details
   */
  async getAssetPrices(): Promise<
    Map<
      number,
      {
        markPx: number;
        midPx: number;
        prevDayPx: number;
        oraclePx?: number;
        szDecimals: number;
        tickSize?: number;
        assetName?: string;
      }
    >
  > {
    try {
      const response = await this.client.post("/info", {
        type: "metaAndAssetCtxs",
      });

      const priceMap = new Map<
        number,
        {
          markPx: number;
          midPx: number;
          prevDayPx: number;
          oraclePx?: number;
          szDecimals: number;
          tickSize?: number;
          assetName?: string;
        }
      >();

      if (
        response.data && Array.isArray(response.data) &&
        response.data.length >= 2
      ) {
        const [meta, assetCtxs] = response.data;

        if (meta?.universe && Array.isArray(assetCtxs)) {
          meta.universe.forEach((asset: any, index: number) => {
            if (assetCtxs[index]) {
              const ctx = assetCtxs[index];
              priceMap.set(index, {
                markPx: parseFloat(ctx.markPx || "0"),
                midPx: parseFloat(ctx.midPx || "0"),
                prevDayPx: parseFloat(ctx.prevDayPx || "0"),
                oraclePx: parseFloat(ctx.oraclePx || "0"),
                szDecimals: asset.szDecimals || 0,
                // Check if there's tick size information in the metadata
                tickSize: asset.tickSize || asset.minTick || asset.priceTick ||
                  undefined,
                assetName: asset.name, // Store name for reference if needed
              });
            }
          });
        }
      }

      logger.info("Fetched asset prices", {
        assetCount: priceMap.size,
        samplePrices: Array.from(priceMap.entries()).slice(0, 3).map((
          [assetId, prices],
        ) => ({
          assetId,
          assetName: prices.assetName,
          markPx: prices.markPx,
          midPx: prices.midPx,
        })),
      });

      return priceMap;
    } catch (error) {
      logger.error("Failed to fetch asset prices", { error });
      return new Map();
    }
  }

  private getTickSize(assetSymbol: string): number {
    const HYPERLIQUID_TICK_SIZES: { [symbol: string]: number } = {
      // Major assets
      "BTC": 1.0,
      "ETH": 0.1,

      // High-priced assets (>$1000)
      "MKR": 0.1,
      "PAXG": 0.1,

      // Mid-priced assets ($10-$1000)
      "SOL": 0.01,
      "BNB": 0.01,
      "AVAX": 0.01,
      "ATOM": 0.01,
      "AAVE": 0.01,

      // Low-priced assets (<$10)
      "PURR": 0.0001,
      "DOGE": 0.0001,
      "MEME": 0.000001,
      // ... add more as you discover them
    };

    return HYPERLIQUID_TICK_SIZES[assetSymbol] || 0.01; // Default fallback
  }

  /**
   * Format price according to Hyperliquid decimal rules
   * For perps: max decimals = 6 - szDecimals
   * For spot: max decimals = 8 - szDecimals
   */
  private formatPrice(
    price: number,
    szDecimals: number,
    isSpot: boolean = false,
    assetSymbol?: string,
  ): string {
    const maxDecimals = isSpot ? 8 : 6;
    const allowedDecimals = maxDecimals - szDecimals;

    // Special handling for BTC - it requires whole number prices (tick size = 1.0)
    if (assetSymbol === "BTC" && !isSpot) {
      return Math.round(price).toString();
    }

    // Get tick size for the asset
    const tickSize = this.getTickSize(assetSymbol || "");

    // Round to nearest tick
    const roundedToTick = Math.round(price / tickSize) * tickSize;

    // Then round to allowed decimal places
    const multiplier = Math.pow(10, allowedDecimals);
    const roundedPrice = Math.round(roundedToTick * multiplier) / multiplier;

    // Convert to string and remove trailing zeros
    return roundedPrice.toString();
  }

  /**
   * Fetch and log the actual asset universe from Hyperliquid
   */
  async fetchAndLogUniverse(): Promise<void> {
    try {
      const response = await this.client.post("/info", {
        type: "meta",
      });

      if (response.data?.universe) {
        logger.info("Hyperliquid Universe Assets:", {
          assetCount: response.data.universe.length,
          first10Assets: response.data.universe.slice(0, 100).map((
            asset: any,
            index: number,
          ) => ({
            index,
            name: asset.name,
            szDecimals: asset.szDecimals,
            // Log any other properties that might indicate tick size
            ...asset,
          })),
        });

        // Log specific assets we're having issues with
        const problemAssets = ["ETH", "PURR"];
        problemAssets.forEach((assetName) => {
          const asset = response.data.universe.find((a: any) =>
            a.name === assetName
          );
          if (asset) {
            logger.info(`Asset ${assetName} full metadata:`, asset);
          }
        });
      }
    } catch (error) {
      logger.error("Failed to fetch universe", { error });
    }
  }

  /**
   * Create or update a DEX account (agent wallet)
   */
  async createOrUpdateDexAccount(ctx: RequestContext, data: {
    address: string;
    accountType: "master" | "agent_wallet";
    agentName?: string;
    encryptedPrivateKey?: string;
    nonce?: string;
    metadata?: any;
  }) {
    // Check if account already exists
    const existingAccount = await this.db.getDexAccountByAddress(
      data.address,
      "hyperliquid",
    );

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
      dexType: "hyperliquid",
      ...data,
    });
  }

  /**
   * Get user's DEX accounts
   */
  async getUserDexAccounts(ctx: RequestContext) {
    return await this.db.getUserDexAccounts(ctx.userId!, "hyperliquid");
  }

  /**
   * Check if user has an agent wallet
   */
  async hasAgentWallet(ctx: RequestContext): Promise<boolean> {
    const accounts = await this.db.getUserDexAccounts(
      ctx.userId!,
      "hyperliquid",
    );
    return accounts.some((acc) => acc.accountType === "agent_wallet");
  }

  /**
   * Place orders on Hyperliquid
   * Now uses the SDK implementation which works for both limit and market orders
   */
  async placeOrder(
    ctx: RequestContext,
    dexAccountId: number,
    orderData: any,
  ): Promise<OrderResponse> {
    // Use the SDK implementation which handles both limit and market orders correctly
    return this.placeOrderWithSDK(ctx, dexAccountId, orderData);
  }


  /**
   * Cancel orders
   */
  async cancelOrder(
    ctx: RequestContext,
    dexAccountId: number,
    cancelData: any,
  ): Promise<CancelResponse> {
    // Validate request
    const validated = CancelOrderRequestSchema.parse(cancelData);

    // Get DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, "Access denied to this account");
    }

    // Build action
    const action: HyperliquidAction = {
      type: "cancel",
      cancels: validated.cancels.map((cancel) => {
        // Use provided assetId or fall back to parsing asset string as number
        const assetId = cancel.assetId || Number(cancel.asset);
        return {
          a: assetId,
          o: Number(cancel.orderId),
        };
      }),
    };

    // Get or generate nonce
    const nonce = validated.nonce ||
      await this.nonceManager.getNextNonce(dexAccount.address);

    // Sign the cancellation if signature not provided
    let signature: any = validated.signature;

    if (!signature) {
      if (!dexAccount.encryptedPrivateKey) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          "Cannot sign orders for accounts without stored private keys",
        );
      }

      const wallet = new ethers.Wallet(dexAccount.encryptedPrivateKey);

      signature = await signL1Action({
        wallet: wallet,
        action: action as any,
        nonce: Number(nonce),
        isTestnet: this.config.chain === "Testnet",
      });

      logger.info("Signed cancel order server-side", {
        userId: ctx.userId,
        dexAccountId,
      });
    }

    // Send request
    const request: HyperliquidRequest = {
      action,
      nonce: Number(nonce),
      signature,
    };

    try {
      const response = await this.client.post<HyperliquidResponse>(
        "/exchange",
        request,
      );

      // Update order status in database
      // Note: We would need to track order IDs to update them properly

      return response.data.response as unknown as CancelResponse;
    } catch (error) {
      logger.error("Failed to cancel order", { error, dexAccountId });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, "Failed to cancel order");
    }
  }

  /**
   * Cancel orders by client order ID
   */
  async cancelOrderByCloid(
    ctx: RequestContext,
    dexAccountId: number,
    cancelData: any,
  ): Promise<CancelResponse> {
    // Validate request
    const validated = CancelByCloidRequestSchema.parse(cancelData);

    // Get DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, "Access denied to this account");
    }

    // Build action
    const action: HyperliquidAction = {
      type: "cancelByCloid",
      cancels: validated.cancels.map((cancel) => {
        // Use provided assetId or fall back to parsing asset string as number
        const assetId = cancel.assetId || Number(cancel.asset);
        return {
          asset: assetId,
          cloid: cancel.cloid,
        };
      }),
    };

    // Get or generate nonce
    const nonce = validated.nonce ||
      await this.nonceManager.getNextNonce(dexAccount.address);

    // Sign the cancellation if signature not provided
    let signature: any = validated.signature;

    if (!signature) {
      if (!dexAccount.encryptedPrivateKey) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          "Cannot sign orders for accounts without stored private keys",
        );
      }

      const wallet = new ethers.Wallet(dexAccount.encryptedPrivateKey);

      signature = await signL1Action({
        wallet: wallet,
        action: action as any,
        nonce: Number(nonce),
        isTestnet: this.config.chain === "Testnet",
      });

      logger.info("Signed cancel by cloid server-side", {
        userId: ctx.userId,
        dexAccountId,
      });
    }

    // Send request
    const request: HyperliquidRequest = {
      action,
      nonce: Number(nonce),
      signature,
    };

    try {
      const response = await this.client.post<HyperliquidResponse>(
        "/exchange",
        request,
      );

      // Update order status in database
      for (const cancel of validated.cancels) {
        const orders = await this.db.getHyperliquidOrders({
          dexAccountId,
          clientOrderId: cancel.cloid,
        });

        for (const order of orders) {
          await this.db.updateHyperliquidOrder(order.id, {
            status: "cancelled",
          });
        }
      }

      return response.data.response as unknown as CancelResponse;
    } catch (error) {
      logger.error("Failed to cancel order by cloid", { error, dexAccountId });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, "Failed to cancel order");
    }
  }

  /**
   * Close a position with a market order
   */
  async closePosition(
    ctx: RequestContext,
    dexAccountId: number,
    data: {
      assetSymbol: string; // Asset symbol (e.g., "BTC", "ETH")
      assetIndex: number; // Asset index (numeric ID)
      size?: string; // Optional: if not provided, will close the entire position
    },
  ): Promise<OrderResponse> {
    // Get DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, "Access denied to this account");
    }

    // Get the master wallet address for this agent wallet
    // Agent wallets trade on behalf of master wallets, but positions are held by the master
    const masterAddress = (dexAccount.metadata as any)?.masterAddress ||
      dexAccount.address;

    logger.info("Using master wallet for position lookup", {
      agentWallet: dexAccount.address,
      masterAddress,
      hasMetadata: !!dexAccount.metadata,
      metadata: dexAccount.metadata,
    });

    // Use the provided asset index
    const assetId = data.assetIndex;
    logger.info("Using asset index", {
      assetSymbol: data.assetSymbol,
      assetIndex: data.assetIndex,
    });

    // Check if this is a spot position
    // According to docs: For spot assets, use 10000 + index
    const isSpot = assetId >= 10000;

    // Get current position from Hyperliquid API using the master wallet
    let response;
    if (isSpot) {
      // For spot positions, use spotClearinghouseState
      response = await this.client.post("/info", {
        type: "spotClearinghouseState",
        user: masterAddress,
      });
      
      logger.info("Fetched spot clearinghouse state", {
        agentWallet: dexAccount.address,
        masterWallet: masterAddress,
        hasBalances: !!response.data?.balances,
        balanceCount: response.data?.balances?.length || 0,
      });
    } else {
      // For perp positions, use regular clearinghouseState
      response = await this.client.post("/info", {
        type: "clearinghouseState",
        user: masterAddress,
      });

      logger.info("Fetched clearinghouse state", {
        agentWallet: dexAccount.address,
        masterWallet: masterAddress,
        hasAssetPositions: !!response.data?.assetPositions,
        positionCount: response.data?.assetPositions?.length || 0,
      });
    }

    const positions = response.data;

    console.log("positions", positions);

    let position: any;
    let positionSize: number;
    let closeSize: string;

    if (isSpot) {
      // For spot positions, look for balances
      logger.info("Looking for spot balance", {
        assetSymbol: data.assetSymbol,
        assetIndex: data.assetIndex,
        balances: positions.balances,
      });

      // Find the balance for this asset
      const balance = positions.balances?.find((b: any) => {
        // Check both by symbol and potentially by some identifier
        return b.coin === data.assetSymbol || b.token === data.assetSymbol;
      });

      if (!balance || !balance.total || parseFloat(balance.total) === 0) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          `No spot balance found for ${data.assetSymbol}`,
        );
      }

      // For spot, we're always selling (closing a long position)
      positionSize = parseFloat(balance.total);
      closeSize = data.size || balance.total;
      
      logger.info("Spot balance found", {
        assetSymbol: data.assetSymbol,
        totalBalance: balance.total,
        holdBalance: balance.hold,
        availableBalance: balance.token,
        closeSize,
      });

    } else {
      // For perp positions, use existing logic
      if (positions.assetPositions) {
        positions.assetPositions.forEach((p: any, index: number) => {
          logger.debug(`Position ${index}`, {
            coin: p.position?.coin,
            szi: p.position?.szi,
            entryPx: p.position?.entryPx,
            unrealizedPnl: p.position?.unrealizedPnl,
            marginUsed: p.position?.marginUsed,
          });
        });
      }

      position = positions.assetPositions?.find((p: any) => {
        // The coin field can be either the symbol (e.g., "BTC") or the asset ID as a string (e.g., "3")
        return p.position?.coin === data.assetSymbol ||
          p.position?.coin === assetId.toString();
      });

      logger.info("Position lookup result", {
        assetSymbol: data.assetSymbol,
        assetIndex: data.assetIndex,
        found: !!position,
        positionSize: position?.position?.szi,
      });

      if (!positions.assetPositions || positions.assetPositions.length === 0) {
        throw new ApiError(
          ErrorCode.INVALID_REQUEST,
          `No open positions found for this account`,
        );
      }

      if (!position || !position.position.szi || position.position.szi === "0") {
        // List available positions for better error message
        const availableAssets = positions.assetPositions
          .filter((p: any) => p.position?.szi && p.position.szi !== "0")
          .map((p: any) => {
            return `Asset ${p.position.coin} (${p.position.szi})`;
          });

        if (availableAssets.length > 0) {
          throw new ApiError(
            ErrorCode.INVALID_REQUEST,
            `No open position found for ${data.assetSymbol}. Available positions: ${
              availableAssets.join(", ")
            }`,
          );
        } else {
          throw new ApiError(
            ErrorCode.INVALID_REQUEST,
            `No open positions found for this account`,
          );
        }
      }

      positionSize = parseFloat(position.position.szi);
      closeSize = data.size || Math.abs(positionSize).toString();
    }

    // Determine the closing side
    const isLong = isSpot || positionSize > 0;  // Spot is always long
    const closingSide = isLong ? "sell" : "buy";

    logger.info("Closing position", {
      assetSymbol: data.assetSymbol,
      assetIndex: data.assetIndex,
      isSpot,
      positionSize: isSpot ? closeSize : position?.position?.szi,
      closingSide,
      closeSize,
      dexAccountId,
    });

    // Place order to close the position
    const orderData = {
      orders: [{
        assetSymbol: data.assetSymbol,
        assetIndex: data.assetIndex,
        assetId: assetId, // Keep for backward compatibility in placeOrder
        asset: data.assetSymbol, // Keep for backward compatibility
        side: closingSide,
        orderType: "market",
        size: closeSize,
        // For spot positions, we place regular sell orders
        // For perp positions, we use reduce-only orders
        reduceOnly: !isSpot,
        isSpot: isSpot, // Pass this flag to help with order processing
      }],
      grouping: "na" as const,
    };

    // Use the existing placeOrder method which supports both SDK and manual signing
    return this.placeOrder(ctx, dexAccountId, orderData);
  }

  /**
   * Close a position with a market order using asset ID
   */
  async closePositionWithAssetId(
    ctx: RequestContext,
    positionId: number,
    data: {
      assetId: number; // Required asset ID
      size?: string; // Optional: if not provided, will close the entire position
      closedPnl: string; // Final P&L for the position
    }
  ): Promise<any> {
    // Get position details
    const position = await this.db.getPositionWithSnapshots(positionId);
    if (!position || position.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Position not found');
    }

    if (position.status !== 'open') {
      throw new ApiError(ErrorCode.INVALID_REQUEST, 'Position is not open');
    }

    // Get the relevant snapshot for this asset
    const relevantSnapshot = position.snapshots.find(
      (s) => s.hyperliquidOrderId && s.order
    );

    if (!relevantSnapshot) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'No Hyperliquid order found for this position');
    }

    const dexAccountId = relevantSnapshot.dexAccountId;

    // Place market order to close position
    const orderResponse = await this.placeOrder(ctx, dexAccountId, {
      orders: [{
        assetSymbol: relevantSnapshot.symbol || '', // Use symbol from snapshot
        assetIndex: data.assetId,
        asset: relevantSnapshot.symbol || '', // Keep for backward compatibility
        assetId: data.assetId, // Keep for backward compatibility
        side: relevantSnapshot.side === 'long' ? 'sell' : 
               relevantSnapshot.side === 'short' ? 'buy' : 'sell', // spot positions are always closed with sell
        orderType: 'market',
        size: data.size || relevantSnapshot.size,
        reduceOnly: relevantSnapshot.side !== 'spot', // No reduce-only for spot
      }],
    });

    // Update position status
    const updatedPosition = await this.db.updatePosition(positionId, {
      status: 'closed',
      closedPnl: data.closedPnl,
      closedAt: new Date(),
    });

    return {
      position: updatedPosition,
      closeOrder: orderResponse,
    };
  }

  /**
   * Get open orders from Hyperliquid API
   */
  async getOpenOrdersFromAPI(address: string) {
    try {
      const response = await this.client.post("/info", {
        type: "openOrders",
        user: address,
      });

      return response.data || [];
    } catch (error) {
      logger.error("Failed to fetch open orders from API", { error, address });
      return [];
    }
  }

  /**
   * Get frontend open orders from Hyperliquid API (includes additional UI-friendly data)
   */
  async getFrontendOpenOrdersFromAPI(address: string) {
    try {
      const response = await this.client.post("/info", {
        type: "frontendOpenOrders",
        user: address,
      });

      return response.data || [];
    } catch (error) {
      logger.error("Failed to fetch frontend open orders from API", {
        error,
        address,
      });
      return [];
    }
  }

  /**
   * Get active asset data (leverage, max trade sizes, available to trade)
   */
  async getActiveAssetData(address: string, asset: string) {
    try {
      const response = await this.client.post("/info", {
        type: "activeAssetData",
        user: address,
        coin: asset,
      });

      return response.data;
    } catch (error) {
      logger.error("Failed to fetch active asset data", {
        error,
        address,
        asset,
      });
      return null;
    }
  }

  /**
   * Get orders
   */
  async getOrders(
    ctx: RequestContext,
    dexAccountId: number,
    filters: {
      assetSymbol?: string;
      assetIndex?: number;
      status?:
        | "open"
        | "filled"
        | "cancelled"
        | "failed"
        | "pending"
        | "rejected"
        | "triggered"
        | "marginCanceled"
        | "liquidatedCanceled"
        | "expired";
      includeApiOrders?: boolean; // Optionally fetch and merge with API orders
    },
  ) {
    // Verify access
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, "Access denied to this account");
    }

    // Get orders from database
    const dbOrders = await this.db.getHyperliquidOrders({
      dexAccountId,
      ...filters,
      status: filters.status as
        | "open"
        | "filled"
        | "cancelled"
        | "failed"
        | "pending"
        | "rejected"
        | "triggered"
        | "marginCanceled"
        | "liquidatedCanceled"
        | "expired"
        | undefined,
    });

    // Optionally fetch and merge with API orders
    if (filters.includeApiOrders && filters.status === "open") {
      const apiOrders = await this.getFrontendOpenOrdersFromAPI(
        dexAccount.address,
      );

      // Convert API orders to our format and merge
      const formattedApiOrders = apiOrders.map((order: any) => ({
        id: order.oid,
        hlOrderId: order.oid?.toString(),
        asset: order.coin,
        side: order.side === "A" ? "buy" : "sell",
        orderType: order.orderType || "limit",
        price: order.limitPx,
        size: order.sz,
        status: "open" as const,
        timestamp: order.timestamp,
        // Additional fields from API
        origSize: order.origSz,
        cloid: order.cloid,
      }));

      // Merge and deduplicate based on hlOrderId
      const orderMap = new Map();
      [...dbOrders, ...formattedApiOrders].forEach((order) => {
        orderMap.set(order.hlOrderId || order.id, order);
      });

      return Array.from(orderMap.values());
    }

    return dbOrders;
  }

  /**
   * Get user positions
   */
  async getUserPositions(
    ctx: RequestContext,
    filters?: { status?: string; positionType?: string },
  ) {
    const positions = await this.db.getUserPositions(ctx.userId!, filters);

    // Fetch position details with snapshots
    const positionsWithSnapshots = await Promise.all(
      positions.map((pos) => this.db.getPositionWithSnapshots(pos.id)),
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
      positionType: "single" | "delta_neutral";
      snapshots: Array<{
        orderId: number;
        assetId: number; // Required asset ID
        symbol: string;
        side: "long" | "short" | "spot";
        entryPrice: string;
        size: string;
        liquidationPrice?: string;
      }>;
      metadata?: any;
    },
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

        const order = orders.find((o) => o.id === snapshot.orderId);
        if (!order) {
          throw new ApiError(ErrorCode.NOT_FOUND, "Order not found");
        }

        // Calculate notional value
        const notionalValue = parseFloat(snapshot.size) *
          parseFloat(snapshot.entryPrice);

        await this.db.createPositionSnapshot({
          positionId: position.id,
          dexType: "hyperliquid",
          dexAccountId: order.dexAccountId,
          symbol: snapshot.symbol,
          side: snapshot.side,
          entryPrice: snapshot.entryPrice,
          currentPrice: snapshot.entryPrice, // Same as entry initially
          liquidationPrice: snapshot.liquidationPrice,
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
      status?: "open" | "closed" | "liquidated";
      totalPnl?: string;
      closedPnl?: string;
      metadata?: any;
    },
  ) {
    // Verify ownership
    const position = await this.db.getPositionWithSnapshots(positionId);
    if (!position || position.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, "Access denied to this position");
    }

    // Update position
    const updated = await this.db.updatePosition(positionId, {
      ...data,
      closedAt: data.status === "closed" || data.status === "liquidated"
        ? new Date()
        : undefined,
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
      assetSymbol?: string;
      assetIndex?: number;
    },
  ) {
    // Verify access
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, "Access denied to this account");
    }

    // For now, return filled orders as fills
    const orders = await this.db.getHyperliquidOrders({
      dexAccountId,
      status: "filled",
      assetSymbol: filters.assetSymbol,
      assetIndex: filters.assetIndex,
    });

    // Apply date filters if provided
    let filteredOrders = orders;
    if (filters.startDate) {
      filteredOrders = filteredOrders.filter((o) =>
        new Date(o.createdAt) >= filters.startDate!
      );
    }
    if (filters.endDate) {
      filteredOrders = filteredOrders.filter((o) =>
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
      case "market":
        // Hyperliquid doesn't have true market orders
        // Use IOC (Immediate or Cancel) limit orders instead
        return {
          limit: {
            tif: "Ioc",
          },
        };
      case "limit":
        // If postOnly is true, use 'Alo' (Add Liquidity Only)
        const tif = order.postOnly ? "Alo" : (order.timeInForce || "Gtc");
        return {
          limit: {
            tif: tif,
          },
        };
      case "trigger_market":
      case "trigger_limit":
        return {
          trigger: {
            isMarket: order.orderType === "trigger_market",
            triggerPx: order.triggerPrice,
            tpsl: order.triggerCondition,
          },
        };
      default:
        return { limit: { tif: "Gtc" } };
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
    },
  ) {
    try {
      // Check if user already has an agent wallet
      const existingAccounts = await this.db.getUserDexAccounts(
        ctx.userId!,
        "hyperliquid",
      );
      const existingAgentWallet = existingAccounts.find((acc) =>
        acc.accountType === "agent_wallet"
      );

      if (existingAgentWallet) {
        throw new ApiError(
          ErrorCode.CONFLICT,
          "User already has an agent wallet",
        );
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
            throw new ApiError(
              ErrorCode.INVALID_REQUEST,
              "Agent address and private key do not match",
            );
          }
        } catch (e) {
          throw new ApiError(
            ErrorCode.INVALID_REQUEST,
            "Invalid agent private key",
          );
        }

        logger.info("Using pre-generated agent wallet", {
          userId: ctx.userId,
          agentAddress,
          masterAddress: data.masterAddress,
        });
      } else {
        // Generate a new wallet (backward compatibility)
        const wallet = ethers.Wallet.createRandom();
        agentAddress = wallet.address;
        privateKey = wallet.privateKey;

        logger.info("Generated new agent wallet", {
          userId: ctx.userId,
          agentAddress,
          masterAddress: data.masterAddress,
        });
      }

      // Use actionData from frontend if provided (when using SDK), otherwise create it
      let action: HyperliquidAction;

      if (data.actionData) {
        // Use the pre-formatted action from frontend SDK
        action = data.actionData;

        // Clean up empty agentName if needed (SDK behavior)
        if (action.type === "approveAgent" && action.agentName === "") {
          delete action.agentName;
        }
      } else {
        // Fallback to creating action (backward compatibility)
        action = {
          type: "approveAgent" as const,
          agentAddress,
          agentName: data.agentName,
          hyperliquidChain: this.config.chain,
          signatureChainId: this.config.signatureChainId,
          nonce: Number(data.nonce),
        };
      }

      // Send approval request to Hyperliquid
      const request: HyperliquidRequest = {
        action,
        nonce: Number(data.nonce),
        signature: data.signature, // Can be string or {r, s, v} format
      };

      const response = await this.client.post<HyperliquidResponse>(
        "/exchange",
        request,
      );

      if (response.data.status !== "ok") {
        const errorMessage = typeof response.data.response?.error === "string"
          ? response.data.response.error
          : response.data.response?.error || "Failed to approve agent wallet";
        logger.error("Agent approval failed", {
          error: errorMessage,
          response: response.data,
        });
        throw new ApiError(ErrorCode.INTERNAL_ERROR, errorMessage);
      }

      // Save the agent wallet to the database
      const agentAccount = await this.db.createDexAccount({
        userId: ctx.userId!,
        dexType: "hyperliquid",
        address: agentAddress,
        accountType: "agent_wallet",
        encryptedPrivateKey: privateKey, // Storing plain text for now as requested
        agentName: data.agentName,
        metadata: {
          masterAddress: data.masterAddress,
          approvedAt: new Date().toISOString(),
        },
      });

      logger.info("Agent wallet created and approved successfully", {
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
      logger.error("Failed to create and approve agent wallet", {
        error,
        userId: ctx.userId,
      });

      if (error instanceof ApiError) {
        throw error;
      }

      // Check for specific Hyperliquid errors
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error?.message ||
          error.response?.data?.message ||
          error.message;

        if (
          errorMessage.includes("Must deposit before performing actions") ||
          errorMessage.includes("insufficient funds") ||
          errorMessage.includes("account does not exist")
        ) {
          throw new ApiError(
            ErrorCode.INVALID_REQUEST,
            "Master account needs to deposit funds to Hyperliquid before approving an agent wallet",
          );
        }
      }

      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        "Failed to create and approve agent wallet",
      );
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
    },
  ) {
    // Verify access to DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, "Access denied to this account");
    }

    logger.info("Recording Hyperliquid deposit", {
      userId: ctx.userId,
      dexAccountId,
      amount: data.amount,
      tokenSymbol: data.tokenSymbol,
      txHash: data.txHash,
    });

    // Create transaction record using position snapshot
    const snapshot = await this.db.createPositionSnapshot({
      positionId: 0, // Using 0 for non-position transactions
      dexType: "hyperliquid",
      dexAccountId,
      symbol: data.tokenSymbol,
      side: "spot", // Deposits are spot transactions
      entryPrice: "1",
      currentPrice: "1",
      size: data.amount,
      notionalValue: data.amount,
      metadata: {
        type: "deposit",
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
    },
  ) {
    // Verify access to DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, "Access denied to this account");
    }

    logger.info("Recording Hyperliquid withdrawal", {
      userId: ctx.userId,
      dexAccountId,
      amount: data.amount,
      tokenSymbol: data.tokenSymbol,
      txHash: data.txHash,
    });

    // Create transaction record
    const snapshot = await this.db.createPositionSnapshot({
      positionId: 0, // Using 0 for non-position transactions
      dexType: "hyperliquid",
      dexAccountId,
      symbol: data.tokenSymbol,
      side: "spot", // Withdrawals are spot transactions
      entryPrice: "1",
      currentPrice: "1",
      size: data.amount,
      notionalValue: data.amount,
      metadata: {
        type: "withdrawal",
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
      type?: "deposit" | "withdrawal";
      startDate?: string;
      endDate?: string;
      limit?: number;
    },
  ) {
    // Verify access
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, "Access denied to this account");
    }

    // Query snapshots with transaction metadata
    const allSnapshots = await this.db.getLatestPositionSnapshots(0);

    let transactions = allSnapshots.filter((snapshot) => {
      if (snapshot.dexAccountId !== dexAccountId) return false;

      const metadata = snapshot.metadata as any;
      if (
        !metadata.type ||
        (metadata.type !== "deposit" && metadata.type !== "withdrawal")
      ) {
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

    return transactions.map((snapshot) => {
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

  /**
   * Place spot order on Hyperliquid
   * Spot assets use asset IDs of 10000 + index
   */
  async placeSpotOrder(
    ctx: RequestContext,
    dexAccountId: number,
    orderData: any,
  ): Promise<OrderResponse> {
    // Transform spot orders to use spot asset IDs
    const transformedOrderData = {
      ...orderData,
      orders: orderData.orders.map((order: any) => ({
        ...order,
        asset: order.asset, // Keep the asset symbol, will handle in getAssetId
        isSpot: true,
      })),
    };

    // Use the existing placeOrder method which handles SDK signing
    return this.placeOrder(ctx, dexAccountId, transformedOrderData);
  }

  /**
   * Get spot balances for an account
   */
  async getSpotBalances(
    ctx: RequestContext,
    dexAccountId: number,
  ): Promise<any> {
    // Verify access
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, "Access denied to this account");
    }

    try {
      // Get spot clearinghouse state
      const response = await this.client.post("/info", {
        type: "spotClearinghouseState",
        user: dexAccount.address,
      });

      const spotState = response.data;

      // Format balances for response
      const balances = spotState?.balances || [];

      return {
        balances: balances.map((balance: any) => ({
          coin: balance.coin,
          hold: balance.hold,
          token: balance.token,
          total: balance.total,
        })),
        rawData: spotState,
      };
    } catch (error) {
      logger.error("Failed to fetch spot balances", { error, dexAccountId });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        "Failed to fetch spot balances",
      );
    }
  }

  /**
   * Get spot orders
   */
  async getSpotOrders(
    ctx: RequestContext,
    dexAccountId: number,
    filters?: {
      asset?: string;
      status?: string;
      includeApiOrders?: boolean;
    },
  ): Promise<any[]> {
    // For spot orders, we need to query with spot asset IDs
    // Transform the filters if needed
    const spotFilters = filters
      ? {
        ...filters,
        isSpot: true,
      }
      : { isSpot: true };

    // Use the existing getOrders method
    return this.getOrders(ctx, dexAccountId, spotFilters as any);
  }

  /**
   * Get spot metadata including available trading pairs
   */
  async getSpotMetadata(): Promise<any> {
    try {
      const response = await this.client.post("/info", {
        type: "spotMeta",
      });

      return response.data;
    } catch (error) {
      logger.error("Failed to fetch spot metadata", { error });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        "Failed to fetch spot metadata",
      );
    }
  }

  /**
   * Place order using the Hyperliquid SDK
   * This bypasses our manual implementation and uses the official SDK
   * Note: This works for both limit and market orders!
   */
  async placeOrderWithSDK(
    ctx: RequestContext,
    dexAccountId: number,
    orderData: any,
  ): Promise<OrderResponse> {
    logger.info("Placing order with SDK", {
      dexAccountId,
      orderCount: orderData.orders?.length || 0,
    });

    // Validate request
    const validated = PlaceOrderRequestSchema.parse(orderData);

    // Get DEX account
    const dexAccount = await this.db.getDexAccount(dexAccountId);
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, "Access denied to this account");
    }

    if (!dexAccount.encryptedPrivateKey) {
      throw new ApiError(
        ErrorCode.INVALID_REQUEST,
        "Cannot sign orders for accounts without stored private keys",
      );
    }

    try {
      // Initialize SDK transport
      const transport = new hl.HttpTransport({
        isTestnet: this.config.chain === "Testnet",
      });

      // IMPORTANT: We need to verify that the private key derives to the correct address
      let privateKey = dexAccount.encryptedPrivateKey;

      // Ensure private key has 0x prefix
      if (!privateKey.startsWith("0x")) {
        privateKey = `0x${privateKey}`;
      }

      // Validate private key format (should be 64 hex chars after 0x)
      if (privateKey.length !== 66) {
        logger.error("SDK: Invalid private key length", {
          length: privateKey.length,
          expectedLength: 66,
        });
        throw new ApiError(
          ErrorCode.INTERNAL_ERROR,
          "Invalid private key format",
        );
      }

      // Create a test wallet to verify the address
      const testWallet = new ethers.Wallet(privateKey);
      logger.info("SDK: Verifying private key derives to correct address", {
        storedAddress: dexAccount.address,
        derivedAddress: testWallet.address,
        addressMatch: dexAccount.address.toLowerCase() ===
          testWallet.address.toLowerCase(),
      });

      if (
        dexAccount.address.toLowerCase() !== testWallet.address.toLowerCase()
      ) {
        logger.error(
          "SDK: Critical error - private key does not derive to stored address",
          {
            storedAddress: dexAccount.address,
            derivedAddress: testWallet.address,
          },
        );
        throw new ApiError(
          ErrorCode.INTERNAL_ERROR,
          "Private key does not match stored address",
        );
      }

      // Initialize SDK exchange client with the private key directly
      // The SDK accepts private keys and will handle the signing internally
      const exchClient = new hl.ExchangeClient({
        wallet: privateKey as `0x${string}`,
        transport,
        isTestnet: this.config.chain === "Testnet",
      });

      // Build orders array for SDK
      const sdkOrders = await Promise.all(
        validated.orders.map(async (order, index) => {
          // Get the original order to check for isSpot flag
          const originalOrder = orderData.orders?.[index] || {};
          
          // Use provided assetId or fall back to parsing asset string as number
          let assetId: number;
          if (originalOrder.assetId !== undefined) {
            assetId = originalOrder.assetId;
          } else {
            assetId = Number(order.asset);
            if (isNaN(assetId)) {
              throw new ApiError(
                ErrorCode.INVALID_REQUEST,
                `Asset ID is required for placing orders. Asset: ${order.asset}`
              );
            }
          }
          
          logger.debug("SDK: Using asset ID", {
            asset: order.asset,
            assetId,
            isSpot: originalOrder.isSpot,
          });

          // Handle pricing for market orders
          let orderPrice = order.price;

          logger.info("SDK: Processing order", {
            asset: order.asset,
            orderType: order.orderType,
            isSpot: originalOrder.isSpot,
            hasIsSpotFlag: "isSpot" in originalOrder,
            orderKeys: Object.keys(order),
            originalOrderKeys: Object.keys(originalOrder),
          });

          if (order.orderType === "market") {
            // For spot market orders, we need to fetch spot prices and use aggressive limits
            if (originalOrder.isSpot) {
              try {
                // Get spot metadata and asset contexts which includes prices
                const response = await this.client.post("/info", {
                  type: "spotMetaAndAssetCtxs",
                });

                const [_spotMeta, assetCtxs] = response.data;
                const spotPairIndex = assetId - 10000; // Get the spot pair index

                // Get the price data from asset contexts
                if (assetCtxs && assetCtxs[spotPairIndex]) {
                  const priceData = assetCtxs[spotPairIndex];
                  // For spot, prefer mark price over mid price as it might be the reference
                  const currentPrice = parseFloat(
                    priceData.markPx || priceData.midPx,
                  );

                  if (currentPrice > 0) {
                    // Use mark price for spot orders
                    const effectivePrice = currentPrice;

                    // For spot market orders, use more aggressive slippage for IOC orders
                    // IOC orders need to match immediately or they're rejected
                    const slippageMultiplier = order.side === "buy"
                      ? 1.01
                      : 0.99; // 1% slippage
                    const rawPrice = effectivePrice * slippageMultiplier;

                    // For spot pairs: max decimals = 8 - szDecimals
                    // PURR has szDecimals = 0, so max 8 decimal places
                    // Round to 4 decimal places for cleaner prices
                    // This respects both the 5 significant figures rule and decimal limits
                    const roundedPrice = Math.round(rawPrice * 10000) / 10000;

                    // Convert to string and remove trailing zeros
                    orderPrice = roundedPrice.toString();

                    logger.info(
                      "SDK: Spot market order using minimal slippage",
                      {
                        asset: order.asset,
                        side: order.side,
                        currentPrice,
                        effectivePrice,
                        rawPrice: rawPrice.toFixed(8),
                        adjustedPrice: orderPrice,
                        slippage: "1%",
                        isSpot: originalOrder.isSpot,
                        spotPairIndex,
                        priceData: JSON.stringify(priceData),
                      },
                    );
                  } else {
                    throw new ApiError(
                      ErrorCode.INVALID_REQUEST,
                      `No valid price data available for ${order.asset} spot market. Cannot place market order.`
                    );
                  }
                } else {
                  throw new ApiError(
                    ErrorCode.INVALID_REQUEST,
                    `No market data available for ${order.asset} spot (index: ${spotPairIndex}). Cannot place market order.`
                  );
                }
              } catch (error) {
                logger.error(
                  "SDK: Failed to fetch spot prices for market order",
                  {
                    error: error instanceof Error ? error.message : error,
                    asset: order.asset,
                  },
                );
                if (error instanceof ApiError) {
                  throw error;
                }
                throw new ApiError(
                  ErrorCode.INTERNAL_ERROR,
                  `Failed to fetch spot market prices: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
              }
            } else {
              // For perpetual market orders, calculate aggressive limit price
              try {
                const assetPrices = await this.getAssetPrices();

                const priceData = assetPrices.get(assetId);

                if (priceData && priceData.midPx > 0) {
                  console.log("priceData", priceData);
                  console.log("priceData.midPx", priceData.midPx);
                  console.log(
                    order.reduceOnly ? "reduceOnly" : "not reduceOnly",
                  );
                  console.log("order.side", order.side);

                  // Use oracle price when available, fallback to mid price
                  const referencePrice = priceData.oraclePx || priceData.midPx;
                  console.log(
                    "Using reference price:",
                    referencePrice,
                    priceData.oraclePx ? "(oracle)" : "(mid)",
                  );

                  // Slippage from reference price
                  const slippageMultiplier = order.reduceOnly
                    ? (order.side === "buy" ? 1.02 : 0.98) // 2% slippage for reduce-only
                    : (order.side === "buy" ? 1.05 : 0.95); // 5% slippage for regular orders
                  const rawPrice = referencePrice * slippageMultiplier;
                  orderPrice = this.formatPrice(
                    rawPrice,
                    priceData.szDecimals || 0,
                    false,
                    order.asset,
                  );
                  console.log("orderPrice", orderPrice);
                  console.log(order.asset, "order.asset");

                  // Calculate tick size for logging
                  const tickSize = this.getTickSize(order.asset || '');
                  console.log("tickSize", tickSize);

                  const slippagePercent = order.reduceOnly ? "2%" : "5%";
                  logger.info("SDK: Market order using current market price", {
                    asset: order.asset,
                    side: order.side,
                    referencePrice,
                    currentMidPrice: priceData.midPx,
                    currentMarkPrice: priceData.markPx,
                    oraclePx: priceData.oraclePx,
                    rawPrice: rawPrice.toFixed(8),
                    adjustedPrice: orderPrice,
                    szDecimals: priceData.szDecimals,
                    tickSize,
                    slippage: slippagePercent,
                    reduceOnly: order.reduceOnly,
                  });
                } else {
                  // Fallback to simple market prices if detailed prices unavailable
                  const marketPrices = await this.getMarketPrices();
                  const currentPrice = marketPrices[assetId];

                  if (currentPrice && currentPrice > 0) {
                    // For reduce-only orders, use less aggressive slippage to avoid invalid price errors
                    const slippageMultiplier = order.reduceOnly
                      ? (order.side === "sell" ? 1.05 : 0.95) // 2% slippage for reduce-only
                      : (order.side === "sell" ? 1.1 : 0.9); // 5% slippage for regular orders
                    const rawPrice = currentPrice * slippageMultiplier;
                    // When using fallback, we don't have szDecimals, so use conservative 2 decimals
                    orderPrice = this.formatPrice(
                      rawPrice,
                      4,
                      false,
                      order.asset,
                    ); // 6 - 4 = 2 decimals

                    logger.info("SDK: Market order using fallback price", {
                      asset: order.asset,
                      side: order.side,
                      currentPrice,
                      adjustedPrice: orderPrice,
                      slippage: "5%",
                    });
                  } else {
                    throw new ApiError(
                      ErrorCode.INVALID_REQUEST,
                      `No valid price data available for ${order.asset}. Cannot place market order.`
                    );
                  }
                }
              } catch (priceError) {
                logger.error("SDK: Failed to fetch market prices for order", {
                  error: priceError,
                  asset: order.asset,
                });
                if (priceError instanceof ApiError) {
                  throw priceError;
                }
                throw new ApiError(
                  ErrorCode.INTERNAL_ERROR,
                  `Failed to fetch market prices: ${priceError instanceof Error ? priceError.message : 'Unknown error'}`
                );
              }
            }
          }

          const sdkOrder: any = {
            a: assetId, // Asset ID
            b: order.side === "buy", // isBuy
            s: order.size, // Size
            r: order.reduceOnly || false, // reduceOnly
            t: this.buildOrderType(order), // Order type
            // c: order.clientOrderId ? order.clientOrderId as `0x${string}` : null, // Client order ID
          };

          // Always include price field
          if (orderPrice !== undefined) {
            sdkOrder.p = orderPrice;
          } else {
            // This should not happen if market order logic is correct
            logger.error("SDK: No price set for order", { order });
            sdkOrder.p = "0";
          }

          logger.info("SDK: Order details", {
            assetId,
            side: order.side,
            price: order.price,
            size: order.size,
            orderType: order.orderType,
            postOnly: order.postOnly,
            tif: sdkOrder.t,
            cloid: order.clientOrderId,
          });

          return sdkOrder;
        }),
      );

      console.log("SDK ORDERS", sdkOrders);
      console.log("t", sdkOrders[0].t);

      // Place order using SDK
      logger.info("SDK: Placing order", {
        orderCount: sdkOrders.length,
        grouping: validated.grouping || "na",
        hasMarketOrder: validated.orders.some((o: any) =>
          o.orderType === "market"
        ),
        agentAddress: dexAccount.address,
        firstOrder: sdkOrders[0],
      });

      try {
        // For agent wallets, we don't set vaultAddress
        // The SDK will use the wallet's own address for signing
        const result = await exchClient.order({
          orders: sdkOrders,
          grouping: (validated.grouping || "na") as any,
        });

        logger.info("SDK: Order placed successfully", {
          resultType: (result as any)?.type,
          hasData: !!(result as any)?.data,
        });

        // Store orders in database (same as original implementation)
        const resultData = (result as any).data;
        if (resultData?.statuses) {
          for (let i = 0; i < validated.orders.length; i++) {
            const order = validated.orders[i];
            const orderResponse = resultData.statuses[i];

            await this.db.createHyperliquidOrder({
              dexAccountId,
              userId: ctx.userId!,
              clientOrderId: order.clientOrderId,
              assetSymbol: order.assetSymbol || order.asset || '', // Fallback for compatibility
              assetIndex: order.assetIndex || order.assetId || 0, // Fallback for compatibility
              side: order.side,
              orderType: order.orderType,
              price: order.price,
              size: order.size,
              status: orderResponse?.error
                ? "rejected"
                : orderResponse?.filled
                ? "filled"
                : "pending",
              reduceOnly: order.reduceOnly,
              postOnly: order.postOnly,
              timeInForce: order.timeInForce,
              triggerPrice: order.triggerPrice,
              triggerCondition: order.triggerCondition,
              oraclePriceOffset: order.oraclePriceOffset,
              auctionStartPrice: order.auctionStartPrice,
              auctionEndPrice: order.auctionEndPrice,
              auctionDuration: order.auctionDuration,
              signature: "SDK_SIGNED",
              nonce: "SDK_MANAGED",
              builderFee: validated.builderFee?.toString(),
              rawResponse: orderResponse,
            });
          }
        }

        // Return SDK response as OrderResponse
        return result as unknown as OrderResponse;
      } catch (sdkError) {
        // Log detailed SDK error
        logger.error("SDK: Order placement failed with SDK error", {
          error: sdkError,
          errorMessage: sdkError instanceof Error
            ? sdkError.message
            : "Unknown error",
          errorStack: sdkError instanceof Error ? sdkError.stack : undefined,
          agentAddress: dexAccount.address,
        });

        // Check if the error message contains address information
        if (
          sdkError instanceof Error &&
          sdkError.message.includes("does not exist")
        ) {
          const addressMatch = sdkError.message.match(/0x[a-fA-F0-9]{40}/g);
          if (addressMatch) {
            logger.error("SDK: Address mismatch detected in error", {
              errorAddresses: addressMatch,
              expectedAddress: dexAccount.address,
              privateKeyDerivedAddress: testWallet.address,
            });
          }
        }

        throw sdkError;
      }
    } catch (error) {
      logger.error("SDK: Order placement failed", {
        error,
        errorMessage: error instanceof Error ? error.message : error,
        dexAccountId,
      });

      // Log error details for debugging

      if (error instanceof Error) {
        // Check if it's an SDK-specific error with more details
        const errorMessage = error.message;

        if (errorMessage.includes("80% away from the reference price")) {
          throw new ApiError(
            ErrorCode.INVALID_REQUEST,
            `SDK: ${errorMessage}`,
          );
        }

        throw new ApiError(
          ErrorCode.INTERNAL_ERROR,
          `SDK order failed: ${errorMessage}`,
        );
      }

      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        "SDK: Failed to place order",
      );
    }
  }
}
