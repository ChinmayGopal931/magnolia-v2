import { Request, Response, NextFunction } from 'express';
import { DatabaseRepository } from '@/db/repository';
import { ApiResponse, RequestContext } from '@/types/common';
import { logger } from '@/utils/logger';
import { privateKeyToAccount } from 'viem/accounts';
import { ethers } from 'ethers';

const db = new DatabaseRepository();

/**
 * Debug endpoint to verify agent wallet private keys
 * GET /api/hyperliquid/debug/verify-wallet/:dexAccountId
 */
export const verifyWalletHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const { dexAccountId } = req.params;
    
    // Get DEX account
    const dexAccount = await db.getDexAccount(Number(dexAccountId));
    if (!dexAccount || dexAccount.userId !== ctx.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this account'
      });
    }
    
    if (!dexAccount.encryptedPrivateKey) {
      return res.json({
        success: false,
        error: 'No private key stored for this account'
      });
    }
    
    // Derive addresses using different methods
    let privateKey = dexAccount.encryptedPrivateKey;
    if (!privateKey.startsWith('0x')) {
      privateKey = `0x${privateKey}`;
    }
    
    // Method 1: Using viem
    const viemAccount = privateKeyToAccount(privateKey as `0x${string}`);
    
    // Method 2: Using ethers
    const ethersWallet = new ethers.Wallet(privateKey);
    
    // Method 3: Manual derivation (what the SDK might be doing internally)
    const { getPublicKey } = await import('@noble/secp256k1');
    const { keccak_256 } = await import('@noble/hashes/sha3');
    const { bytesToHex, hexToBytes } = await import('@noble/secp256k1/etc');
    
    const cleanPrivKey = privateKey.slice(2); // Remove 0x
    const publicKey = getPublicKey(cleanPrivKey, false);
    const publicKeyWithoutPrefix = publicKey.slice(1);
    const hash = keccak_256(publicKeyWithoutPrefix);
    const addressBytes = hash.slice(-20);
    const manualAddress = `0x${bytesToHex(addressBytes)}`;
    
    const response: ApiResponse = {
      success: true,
      data: {
        storedAddress: dexAccount.address,
        viemDerivedAddress: viemAccount.address,
        ethersDerivedAddress: ethersWallet.address,
        manualDerivedAddress: manualAddress,
        allMatch: dexAccount.address.toLowerCase() === viemAccount.address.toLowerCase() &&
                  dexAccount.address.toLowerCase() === ethersWallet.address.toLowerCase() &&
                  dexAccount.address.toLowerCase() === manualAddress.toLowerCase(),
        privateKeyLength: privateKey.length,
        privateKeyPrefix: privateKey.substring(0, 6) + '...',
        accountType: dexAccount.accountType,
        agentName: dexAccount.agentName
      }
    };
    
    logger.info('Wallet verification', response.data);
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to verify wallet', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    next(error);
  }
};