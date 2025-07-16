import { DatabaseRepository } from '@/db/repository';
import { logger } from './logger';

export class NonceManager {
  private db: DatabaseRepository;
  private nonceCache: Map<string, bigint>;
  private readonly NONCE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

  constructor() {
    this.db = new DatabaseRepository();
    this.nonceCache = new Map();
  }

  /**
   * Get the next valid nonce for an address
   * Hyperliquid requires nonces to be within (T - 2 days, T + 1 day)
   */
  async getNextNonce(address: string): Promise<bigint> {
    try {
      const now = Date.now();
      
      // Check cache first
      const cachedNonce = this.nonceCache.get(address);
      if (cachedNonce) {
        const nextNonce = cachedNonce + 1n;
        
        // Verify it's within valid window
        if (this.isNonceValid(nextNonce)) {
          this.nonceCache.set(address, nextNonce);
          return nextNonce;
        }
      }

      // Get from database - find the dex account
      const dexAccount = await this.db.getDexAccountByAddress(address, 'hyperliquid');
      
      // Start with current timestamp if no previous nonce or if it's too old
      let nextNonce = BigInt(now);
      if (dexAccount?.nonce) {
        const lastNonce = BigInt(dexAccount.nonce);
        if (this.isNonceValid(lastNonce + 1n)) {
          nextNonce = lastNonce + 1n;
        }
      }

      // Ensure we don't reuse timestamps
      if (nextNonce <= BigInt(now)) {
        nextNonce = BigInt(now);
      }

      this.nonceCache.set(address, nextNonce);
      return nextNonce;
    } catch (error) {
      logger.error('Error getting next nonce', { error, address });
      // Fallback to timestamp
      return BigInt(Date.now());
    }
  }

  /**
   * Update the nonce for an address after successful transaction
   */
  async updateNonce(address: string, nonce: bigint): Promise<void> {
    try {
      this.nonceCache.set(address, nonce);
      
      // Update in database
      const dexAccount = await this.db.getDexAccountByAddress(address, 'hyperliquid');
      
      if (dexAccount) {
        await this.db.updateDexAccount(dexAccount.id, { nonce: nonce.toString() });
      }
    } catch (error) {
      logger.error('Error updating nonce', { error, address, nonce });
    }
  }

  /**
   * Check if a nonce is within the valid time window
   */
  private isNonceValid(nonce: bigint): boolean {
    const now = Date.now();
    const nonceTime = Number(nonce);
    
    // Must be within (T - 2 days, T + 1 day)
    const minTime = now - this.NONCE_WINDOW_MS;
    const maxTime = now + (24 * 60 * 60 * 1000); // 1 day
    
    return nonceTime > minTime && nonceTime < maxTime;
  }

  /**
   * Clear expired nonces from cache
   */
  clearExpiredNonces(): void {
    const now = Date.now();
    const minValidTime = now - this.NONCE_WINDOW_MS;
    
    for (const [address, nonce] of this.nonceCache.entries()) {
      if (Number(nonce) < minValidTime) {
        this.nonceCache.delete(address);
      }
    }
  }
}

// Singleton instance
export const nonceManager = new NonceManager();

// Clear expired nonces periodically
setInterval(() => {
  nonceManager.clearExpiredNonces();
}, 60 * 60 * 1000); // Every hour