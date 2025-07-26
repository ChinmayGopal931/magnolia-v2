// Hyperliquid Asset Mappings for TESTNET
// Updated from actual universe data
// Asset ID = array index in the universe array

export const HYPERLIQUID_ASSETS = {
  // TESTNET assets - verified from actual API response
  // IMPORTANT: These mappings are specific to testnet and differ from mainnet!
  SOL: 0,      // Solana (asset 0 on testnet)
  APT: 1,      // Aptos
  ATOM: 2,     // Cosmos
  BTC: 3,      // Bitcoin (asset 3 on testnet, not 0!)
  ETH: 4,      // Ethereum (asset 4 on testnet, not 1!)
  MATIC: 5,    // Polygon
  BNB: 6,      // Binance Coin
  AVAX: 7,     // Avalanche
  GMT: 8,      // STEPN
  DYDX: 9,     // dYdX
  LTC: 10,     // Litecoin
  ARB: 11,     // Arbitrum
  DOGE: 12,    // Dogecoin
  INJ: 13,     // Injective
  SUI: 14,     // Sui
  kPEPE: 15,   // PEPE (1000x)
  CRV: 16,     // Curve
  LDO: 17,     // Lido
  LINK: 18,    // Chainlink
  STX: 19,     // Stacks
  RNDR: 20,    // Render (delisted)
  CFX: 21,     // Conflux
  FTM: 22,     // Fantom (delisted)
  GMX: 23,     // GMX
  SNX: 24,     // Synthetix
  XRP: 25,     // Ripple
  BCH: 26,     // Bitcoin Cash
  AAVE: 28,    // Aave
  COMP: 29,    // Compound
  MKR: 30,     // Maker
  WLD: 31,     // Worldcoin
  FXS: 32,     // Frax Share
  HPOS: 33,    // HyperLiquid POS (delisted)
  RLB: 34,     // Rollbit (delisted)
  UNIBOT: 35,  // Unibot (delisted)
  YGG: 36,     // Yield Guild Games
  TRX: 37,     // Tron
  kSHIB: 38,   // SHIB (1000x)
  UNI: 39,     // Uniswap
  SEI: 40,     // Sei
  RUNE: 41,    // THORChain
  OX: 42,      // OX (delisted)
  FRIEND: 43,  // Friend.tech (delisted)
  SHIA: 44,    // Shia (delisted)
  CYBER: 45,   // Cyber (delisted)
  ZRO: 46,     // LayerZero
  BLZ: 47,     // Bluzelle (delisted)
  DOT: 48,     // Polkadot
  BANANA: 49,  // Banana Gun
  TRB: 50,     // Tellor
  FTT: 51,     // FTX Token
  LOOM: 52,    // Loom Network (delisted)
  OGN: 53,     // Origin Protocol
  RDNT: 54,    // Radiant (delisted)
  ARK: 55,     // Ark
  BNT: 56,     // Bancor (delisted)
  CANTO: 57,   // Canto (delisted)
  REQ: 58,     // Request
  BIGTIME: 59, // Big Time
  KAS: 60,     // Kaspa
  ORBS: 61,    // Orbs (delisted)
  BLUR: 62,    // Blur
  TIA: 63,     // Celestia
  BSV: 64,     // Bitcoin SV
  ADA: 65,     // Cardano
  TON: 66,     // Toncoin
  MINA: 67,    // Mina
  POLYX: 68,   // Polymesh
  GAS: 69,     // Gas
  PENDLE: 70,  // Pendle
  STG: 71,     // Stargate
  FET: 72,     // Fetch.ai
  STRAX: 73,   // Stratis (delisted)
  NEAR: 74,    // NEAR Protocol
  MEME: 75,    // Memecoin
  ORDI: 76,    // Ordinals
  BADGER: 77,  // Badger (delisted)
  NEO: 78,     // Neo
  ZEN: 79,     // Horizen
  FIL: 80,     // Filecoin
  PYTH: 81,    // Pyth Network
  SUSHI: 82,   // SushiSwap
  ILV: 83,     // Illuvium (delisted)
  IMX: 84,     // Immutable X
  kBONK: 85,   // BONK (1000x)
  SUPER: 87,   // SuperVerse
  USTC: 88,    // Terra Classic USD
  NFTI: 89,    // NFT Index (delisted)
  JUP: 90,     // Jupiter
  kLUNC: 91,   // Terra Classic (1000x)
  RSR: 92,     // Reserve Rights
  GALA: 93,    // Gala
  JTO: 94,     // Jito
  NTRN: 95,    // Neutron (delisted)
  ACE: 96,     // Ace
  MAV: 97,     // Maverick Protocol
  WIF: 98,     // dogwifhat
  CAKE: 99,    // PancakeSwap
  PEOPLE: 100, // ConstitutionDAO
  ENS: 101,    // Ethereum Name Service
  ETC: 102,    // Ethereum Classic
  XAI: 103,    // XAI
  MANTA: 104,  // Manta Network
  UMA: 105,    // UMA
  ONDO: 106,   // Ondo
  ALT: 107,    // AltLayer
  ZETA: 108,   // ZetaChain
  DYM: 109,    // Dymension
  MAVIA: 110,  // Heroes of Mavia
  W: 111,      // Wormhole
  PANDORA: 112,// Pandora (delisted)
  STRK: 113,   // Starknet
  PIXEL: 114,  // Pixels (delisted)
  AI: 115,     // Sleepless AI (delisted)
  TAO: 116,    // Bittensor
  AR: 117,     // Arweave
  MYRO: 118,   // Myro (delisted)
  kFLOKI: 119, // FLOKI (1000x)
  BOME: 120,   // BOME
  ETHFI: 121,  // Ether.fi
  ENA: 122,    // Ethena
  MNT: 123,    // Mantle
  TNSR: 124,   // Tensor
  SAGA: 125,   // Saga
  MERL: 126,   // Merlin Chain
  HBAR: 127,   // Hedera
  POPCAT: 128, // Popcat
  OMNI: 129,   // Omni Network
  EIGEN: 130,  // EigenLayer
  REZ: 131,    // Renzo
  NOT: 132,    // Notcoin
  TURBO: 133,  // Turbo
  BRETT: 134,  // Brett
  IO: 135,     // io.net
  ZK: 136,     // zkSync
  BLAST: 137,  // Blast
  LISTA: 138,  // Lista (delisted)
  MEW: 139,    // cat in a dogs world
  RENDER: 140, // Render
  kDOGS: 141,  // DOGS (1000x)
  POL: 142,    // Polygon
  CATI: 143,   // Catizen (delisted)
  CELO: 144,   // Celo
  HMSTR: 145,  // Hamster Kombat
  SCR: 146,    // Scroll
  NEIROETH: 147,// Neiro (ETH)
  kNEIRO: 148, // NEIRO (1000x)
  GOAT: 149,   // Goatseus Maximus
  MOODENG: 150,// Moo Deng
  GRASS: 151,  // Grass
  PURR: 152,   // Purr
  PNUT: 153,   // Peanut the Squirrel
  XLM: 154,    // Stellar
  CHILLGUY: 155,// Just a chill guy
  SAND: 156,   // The Sandbox
  IOTA: 157,   // IOTA
  ALGO: 158,   // Algorand
  HYPE: 159,   // Hyperliquid
  ME: 160,     // Magic Eden
  MOVE: 161,   // Movement
  VIRTUAL: 162,// Virtuals Protocol
  PENGU: 163,  // Pudgy Penguins
  USUAL: 164,  // Usual
  FARTCOIN: 165,// Fartcoin
  AI16Z: 166,  // ai16z
  AIXBT: 167,  // aixbt
  ZEREBRO: 168,// Zerebro
  BIO: 169,    // BIO Protocol
  GRIFFAIN: 170,// Griffain
  SPX: 171,    // SPX
  S: 172,      // S
  MORPHO: 173, // Morpho
  TRUMP: 174,  // Trump
  MELANIA: 175,// Melania
  ANIME: 176,  // Anime
  VINE: 177,   // Vine
  VVV: 178,    // VVV
  JELLY: 179,  // Jelly (delisted)
  BERA: 180,   // Berachain
  TST: 181,    // Test
  LAYER: 182,  // Layer
  IP: 183,     // IP
  OM: 184,     // MANTRA
  KAITO: 185,  // Kaito
  NIL: 186,    // Nil
  PAXG: 187,   // PAX Gold
  PROMPT: 188, // Prompt
  BABY: 189,   // Baby
  WCT: 190,    // WCT
  HYPER: 191,  // Hyper
  ZORA: 192,   // Zora
  INIT: 193,   // Init
  DOOD: 194,   // Dood
  LAUNCHCOIN: 195,// LaunchCoin
  NXPC: 196,   // NXPC
  SOPH: 197,   // Soph
  RESOLV: 198, // Resolv
  SYRUP: 199,  // Syrup
  PUMP: 200,   // Pump
} as const;

export type HyperliquidAssetSymbol = keyof typeof HYPERLIQUID_ASSETS;

// Spot assets from Hyperliquid API
// Based on actual spotMeta response - most are marked as non-canonical (@N format)
// Only PURR/USDC (index 0) is canonical on testnet
export const HYPERLIQUID_SPOT_ASSETS = {
  'PURR/USDC': 0,     // PURR/USDC index 0, canonical
  // The rest are non-canonical pairs with @N naming
  // We'll map the most common ones that might be available
  'HYPE': 150,        // Based on token index 150 in the tokens array
  // Add more as needed when they become canonical
} as const;

// Map of spot token indices from the spotMeta.tokens array
export const HYPERLIQUID_SPOT_TOKENS = {
  'USDC': 0,
  'PURR': 1,
  'HFUN': 2,
  'LICK': 3,
  'MANLET': 4,
  'JEFF': 5,
  'SIX': 6,
  'WAGMI': 7,
  'CAPPY': 8,
  'POINTS': 9,
  'TRUMP': 10,
  'HYPE': 150,
  // Add more tokens as needed
} as const;

export type HyperliquidSpotAssetSymbol = keyof typeof HYPERLIQUID_SPOT_ASSETS;
export type HyperliquidSpotTokenSymbol = keyof typeof HYPERLIQUID_SPOT_TOKENS;

export function getAssetId(symbol: string | number, isSpot?: boolean): number {
  // If already a number, validate and return
  if (typeof symbol === 'number') {
    return Math.floor(symbol);
  }
  
  // If it's a numeric string, parse it
  const numericValue = Number(symbol);
  if (!isNaN(numericValue)) {
    return Math.floor(numericValue);
  }
  
  // For spot assets, handle different formats
  if (isSpot) {
    const upperSymbol = symbol.toUpperCase();
    
    // Check if it's a spot pair (e.g., "PURR/USDC")
    if (upperSymbol in HYPERLIQUID_SPOT_ASSETS) {
      const spotIndex = HYPERLIQUID_SPOT_ASSETS[upperSymbol as HyperliquidSpotAssetSymbol];
      return 10000 + spotIndex;
    }
    
    // Check if it's just the base token (e.g., "PURR")
    // For single tokens, we'll try to find the USDC pair
    const pairSymbol = `${upperSymbol}/USDC`;
    if (pairSymbol in HYPERLIQUID_SPOT_ASSETS) {
      const spotIndex = HYPERLIQUID_SPOT_ASSETS[pairSymbol as HyperliquidSpotAssetSymbol];
      return 10000 + spotIndex;
    }
    
    throw new Error(`Unknown Hyperliquid spot asset: ${symbol}`);
  }
  
  // Otherwise, look up the perpetual symbol
  const upperSymbol = symbol.toUpperCase();
  if (upperSymbol in HYPERLIQUID_ASSETS) {
    return HYPERLIQUID_ASSETS[upperSymbol as HyperliquidAssetSymbol];
  }
  
  throw new Error(`Unknown Hyperliquid asset: ${symbol}`);
}

export function getAssetSymbol(assetId: number): string | undefined {
  // Check if it's a spot asset (ID >= 10000)
  if (assetId >= 10000) {
    const spotIndex = assetId - 10000;
    const spotEntry = Object.entries(HYPERLIQUID_SPOT_ASSETS).find(([_, index]) => index === spotIndex);
    return spotEntry?.[0];
  }
  
  // Otherwise, check perpetual assets
  const entry = Object.entries(HYPERLIQUID_ASSETS).find(([_, id]) => id === assetId);
  return entry?.[0];
}

// Helper to get all assets by ID for reverse lookup
export function getAssetsByIds(): Record<number, string> {
  const assetsByIds: Record<number, string> = {};
  Object.entries(HYPERLIQUID_ASSETS).forEach(([symbol, id]) => {
    assetsByIds[id] = symbol;
  });
  return assetsByIds;
}