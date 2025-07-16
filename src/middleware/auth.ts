import { Request, Response, NextFunction } from 'express';
import { ApiError, ErrorCode, RequestContext } from '@/types/common';
import { DatabaseRepository } from '@/db/repository';
import { ethers } from 'ethers';
import { logger } from '@/utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

const db = new DatabaseRepository();

export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get auth header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Authorization header required',
        401
      );
    }

    // Parse auth header (Bearer <address>:<signature>:<timestamp>)
    const [bearer, credentials] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !credentials) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Invalid authorization format',
        401
      );
    }

    const [address, signature, timestamp] = credentials.split(':');
    if (!address || !signature || !timestamp) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Invalid credentials format',
        401
      );
    }

    // Verify timestamp (prevent replay attacks)
    const requestTime = parseInt(timestamp);
    const now = Math.floor(Date.now() / 1000); // Convert to seconds
    const maxAge = 5 * 60; // 5 minutes in seconds
    
    if (isNaN(requestTime) || Math.abs(now - requestTime) > maxAge) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Request timestamp expired',
        401
      );
    }

    // Verify signature
    const message = `Authenticate to Magnolia\nAddress: ${address}\nTimestamp: ${timestamp}`;
    const recoveredAddress = ethers.verifyMessage(message, signature);
    
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Invalid signature',
        401
      );
    }

    // Get or create user
    let user = await db.findUserByWallet(address);
    if (!user) {
      user = await db.createUser(address);
      logger.info('New user created', { address });
    }

    // Create request context
    req.context = {
      userId: user.id,
      timestamp: new Date(),
      requestId: generateRequestId(),
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    } else {
      logger.error('Authentication error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: ErrorCode.INTERNAL_ERROR,
      });
    }
  }
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}