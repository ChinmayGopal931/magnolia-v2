import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as dotenv from 'dotenv';

dotenv.config();

let queryClient: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

// Lazy initialization
function initDatabase() {
  if (!dbInstance) {
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL is not set in environment variables');
      // Return a dummy db object for health checks
      return null;
    }

    // Create postgres connection
    queryClient = postgres(process.env.DATABASE_URL, {
      max: 10, // Maximum number of connections
      idle_timeout: 20,
      connect_timeout: 10,
    });

    // Create drizzle instance
    dbInstance = drizzle(queryClient, { schema });
  }
  return dbInstance;
}

// Export a getter for the db
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    const instance = initDatabase();
    if (!instance) {
      throw new Error('Database not initialized. DATABASE_URL is not set.');
    }
    return instance[prop as keyof typeof instance];
  }
});

// Export the query client for migrations
export { queryClient };

// Graceful shutdown
process.on('SIGINT', async () => {
  if (queryClient) {
    await queryClient.end();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await queryClient.end();
  process.exit(0);
});