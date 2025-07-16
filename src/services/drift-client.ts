import { dexConfig } from '@/config/dex.config';
import { logger } from '@/utils/logger';

/**
 * Drift Client Configuration Service
 * This service manages Drift SDK configuration based on the environment
 */
export class DriftClientConfig {
  private config: {
    programId: string;
    rpcUrl: string;
    dataApiUrl: string;
    env: 'mainnet-beta' | 'devnet';
  };

  constructor() {
    const driftConfig = dexConfig.getDriftConfig();
    
    // Use custom RPC URL if provided, otherwise use default
    const rpcUrl = process.env.SOLANA_RPC_URL || driftConfig.rpcUrl;
    
    this.config = {
      programId: driftConfig.programId,
      rpcUrl,
      dataApiUrl: driftConfig.dataApiUrl,
      env: driftConfig.env,
    };

    logger.info('DriftClientConfig initialized', {
      environment: dexConfig.getEnvironment(),
      programId: this.config.programId,
      rpcUrl: this.config.rpcUrl,
      dataApiUrl: this.config.dataApiUrl,
      env: this.config.env,
    });
  }

  getConfig() {
    return this.config;
  }

  getProgramId() {
    return this.config.programId;
  }

  getRpcUrl() {
    return this.config.rpcUrl;
  }

  getDataApiUrl() {
    return this.config.dataApiUrl;
  }

  getEnv() {
    return this.config.env;
  }

  /**
   * Get configuration for initializing Drift SDK
   */
  getSDKConfig() {
    return {
      env: this.config.env,
      programID: this.config.programId,
      provider: {
        connection: {
          rpcEndpoint: this.config.rpcUrl,
        },
      },
    };
  }
}

// Export singleton instance
export const driftClientConfig = new DriftClientConfig();