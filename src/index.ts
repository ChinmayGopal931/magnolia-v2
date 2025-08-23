import { app } from './app';
import { logger } from './utils/logger';
import { initializeScheduler, setupGracefulShutdown } from './jobs/scheduler';

const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Network: ${process.env.NETWORK_ENV || 'testnet'}`);
  
  // Initialize job scheduler
  initializeScheduler();
  logger.info('Job scheduler initialized');
});

// Setup graceful shutdown
setupGracefulShutdown();