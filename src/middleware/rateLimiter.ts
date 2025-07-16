import rateLimit from 'express-rate-limit';
import { ErrorCode } from '@/types/common';

// Create different rate limiters for different endpoints
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes default
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests default
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message: 'Rate limit exceeded. Please try again later.',
    });
  },
});

// Stricter rate limiter for order placement
export const orderRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 orders per minute
  message: 'Too many order requests',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many order requests',
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message: 'Order rate limit exceeded. Please slow down.',
    });
  },
});

// Looser rate limiter for read operations
export const readRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
  message: 'Too many read requests',
  standardHeaders: true,
  legacyHeaders: false,
});