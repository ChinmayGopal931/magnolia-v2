import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, queryClient } from '../db/connection';
import { logger } from '../utils/logger';
import * as dotenv from 'dotenv';

dotenv.config();

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');
    
    await migrate(db, { migrationsFolder: './drizzle' });
    
    logger.info('Migrations completed successfully');
    
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', { error });
    process.exit(1);
  } finally {
    await queryClient.end();
  }
}

// Run migrations
runMigrations();