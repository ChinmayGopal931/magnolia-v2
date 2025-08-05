import { Request, Response, NextFunction } from 'express';
import { DatabaseRepository } from '@/db/repository';
import { ApiResponse, ApiError, ErrorCode, RequestContext } from '@/types/common';
import { z } from 'zod';
import { ethers } from 'ethers';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { logger } from '@/utils/logger';

const db = new DatabaseRepository();

/**
 * Validation schema for linking wallets
 */
export const linkWalletSchema = z.object({
  newWalletAddress: z.string().min(1),
  newWalletType: z.enum(['evm', 'solana']),
  linkingMessage: z.string().min(1),
  newWalletSignature: z.string().min(1),
  primaryWalletSignature: z.string().min(1),
});

export type LinkWalletRequest = z.infer<typeof linkWalletSchema>;

/**
 * Verify signature based on wallet type
 */
function verifySignature(message: string, signature: string, address: string, walletType: 'evm' | 'solana'): boolean {
  try {
    if (walletType === 'evm') {
      // Verify Ethereum signature
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } else {
      // Verify Solana signature
      const publicKey = bs58.decode(address);
      const signatureBytes = Buffer.from(signature, 'hex');
      const messageBytes = new TextEncoder().encode(message);
      
      return nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKey
      );
    }
  } catch (error) {
    logger.error('Signature verification failed', { error, address, walletType });
    return false;
  }
}

/**
 * Link a new wallet to existing user account
 * POST /api/auth/link-wallet
 */
export const linkWalletHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctx = req.context as RequestContext;
    const validated = linkWalletSchema.parse(req.body);
    
    // Get user's primary wallet
    const primaryWallet = await db.getPrimaryWallet(ctx.userId!);
    if (!primaryWallet) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Primary wallet not found'
      );
    }
    
    // Verify primary wallet signature
    const primaryValid = verifySignature(
      validated.linkingMessage,
      validated.primaryWalletSignature,
      primaryWallet.walletAddress,
      primaryWallet.walletType as 'evm' | 'solana'
    );
    
    if (!primaryValid) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Invalid primary wallet signature'
      );
    }
    
    // Verify new wallet signature
    const newWalletValid = verifySignature(
      validated.linkingMessage,
      validated.newWalletSignature,
      validated.newWalletAddress,
      validated.newWalletType
    );
    
    if (!newWalletValid) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Invalid new wallet signature'
      );
    }
    
    // Check if wallet already exists
    const existingWallet = await db.findWalletByAddress(validated.newWalletAddress);
    if (existingWallet) {
      throw new ApiError(
        ErrorCode.CONFLICT,
        'Wallet already linked to another account'
      );
    }
    
    // Link the wallet
    const linkedWallet = await db.linkWallet(
      ctx.userId!,
      validated.newWalletAddress,
      validated.newWalletType
    );
    
    logger.info('Wallet linked successfully', {
      userId: ctx.userId,
      newWallet: validated.newWalletAddress,
      walletType: validated.newWalletType,
    });
    
    // Get all user wallets
    const userWallets = await db.getUserWallets(ctx.userId!);
    
    const response: ApiResponse = {
      success: true,
      data: {
        linkedWallet,
        allWallets: userWallets,
      },
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
};