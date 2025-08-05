import { Request, Response, NextFunction } from 'express';
import { ApiError, ErrorCode } from '@/types/common';
import { logger } from '@/utils/logger';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Create a clean error object for logging
  const logError: any = {
    message: error.message,
    path: req.path,
    method: req.method,
    requestId: req.context?.requestId,
  };

  // Add stack trace only in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    logError['stack'] = error.stack.split('\n').slice(0, 3).join('\n');
  }

  // Log the error with clean formatting
  logger.error('Request failed', logError);

  // Handle known API errors
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }

  // Handle validation errors from services
  if (error.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      code: ErrorCode.INVALID_REQUEST,
      message: error.message,
    });
    return;
  }

  // Handle database errors
  if (error.message?.includes('database') || error.message?.includes('connection')) {
    res.status(503).json({
      success: false,
      error: 'Database error',
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message: 'A database error occurred. Please try again later.',
    });
    return;
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: ErrorCode.INTERNAL_ERROR,
    message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
  });
}