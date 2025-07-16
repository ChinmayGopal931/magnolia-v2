export type NetworkEnvironment = 'testnet' | 'mainnet';

interface DexConfig {
  hyperliquid: {
    apiUrl: string;
    chain: 'Mainnet' | 'Testnet';
    signatureChainId: string;
    webAppUrl: string;
  };
  drift: {
    programId: string;
    rpcUrl: string;
    dataApiUrl: string;
    env: 'mainnet-beta' | 'devnet';
    webAppUrl: string;
  };
}

const configs: Record<NetworkEnvironment, DexConfig> = {
  testnet: {
    hyperliquid: {
      apiUrl: 'https://api.hyperliquid-testnet.xyz',
      chain: 'Testnet',
      signatureChainId: '0x66eee',  // Arbitrum Sepolia testnet chain ID
      webAppUrl: 'https://app.hyperliquid-testnet.xyz',
    },
    drift: {
      programId: 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH',
      rpcUrl: 'https://api.devnet.solana.com',
      dataApiUrl: 'https://master-data.drift.trade',
      env: 'devnet',
      webAppUrl: 'https://app.drift.trade',
    },
  },
  mainnet: {
    hyperliquid: {
      apiUrl: 'https://api.hyperliquid.xyz',
      chain: 'Mainnet',
      signatureChainId: '0xa4b1',  // Arbitrum mainnet chain ID
      webAppUrl: 'https://app.hyperliquid.xyz',
    },
    drift: {
      programId: 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH',
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      dataApiUrl: 'https://data.api.drift.trade',
      env: 'mainnet-beta',
      webAppUrl: 'https://app.drift.trade',
    },
  },
};

export class DexConfiguration {
  private static instance: DexConfiguration;
  private environment: NetworkEnvironment;
  
  private constructor() {
    // Default to testnet for safety
    this.environment = (process.env.NETWORK_ENV as NetworkEnvironment) || 'testnet';
    
    if (!['testnet', 'mainnet'].includes(this.environment)) {
      console.warn(`Invalid NETWORK_ENV: ${this.environment}, defaulting to testnet`);
      this.environment = 'testnet';
    }
  }
  
  static getInstance(): DexConfiguration {
    if (!DexConfiguration.instance) {
      DexConfiguration.instance = new DexConfiguration();
    }
    return DexConfiguration.instance;
  }
  
  getEnvironment(): NetworkEnvironment {
    return this.environment;
  }
  
  getHyperliquidConfig() {
    return configs[this.environment].hyperliquid;
  }
  
  getDriftConfig() {
    return configs[this.environment].drift;
  }
  
  getFullConfig(): DexConfig {
    return configs[this.environment];
  }
  
  isTestnet(): boolean {
    return this.environment === 'testnet';
  }
  
  isMainnet(): boolean {
    return this.environment === 'mainnet';
  }
}

// Export singleton instance
export const dexConfig = DexConfiguration.getInstance();