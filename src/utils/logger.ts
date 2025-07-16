import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

// Custom formatter for development
const devFormat = winston.format.printf(({ level, message, timestamp, service, ...metadata }) => {
  let msg = `${timestamp} [${level}] ${message}`;
  
  // Handle error objects specially
  if (metadata.error) {
    const error = metadata.error;
    if (error.response?.data) {
      // External API error (like from Hyperliquid)
      msg += `\n  API Error: ${JSON.stringify(error.response.data, null, 2)}`;
      msg += `\n  Status: ${error.response.status} ${error.response.statusText}`;
    } else if (error.message) {
      // Regular error
      msg += `\n  Error: ${error.message}`;
      if (process.env.NODE_ENV === 'development' && error.stack) {
        msg += `\n  Stack: ${error.stack.split('\n').slice(1, 3).join('\n')}`;
      }
    }
    // Remove the error object from metadata to avoid duplicate logging
    delete metadata.error;
  }
  
  // Add other metadata if present
  const metadataKeys = Object.keys(metadata);
  if (metadataKeys.length > 0) {
    msg += '\n  ' + metadataKeys.map(key => `${key}: ${JSON.stringify(metadata[key])}`).join('\n  ');
  }
  
  return msg;
});

// Use pretty format in development, JSON in production
const consoleFormat = process.env.NODE_ENV === 'production'
  ? winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      devFormat
    );

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'magnolia-v2' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
    })
  );
}