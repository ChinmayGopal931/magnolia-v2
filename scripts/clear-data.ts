import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

async function clearAllData() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sql = postgres(connectionString, { max: 1 });

  try {
    console.log('🗑️  Clearing all data from tables...');
    
    // Truncate all tables in one command with RESTART IDENTITY to reset sequences
    await sql`
      TRUNCATE TABLE 
        users, 
        user_wallets, 
        dex_accounts, 
        hyperliquid_orders, 
        drift_orders, 
        positions, 
        position_snapshots 
      RESTART IDENTITY CASCADE;
    `;
    
    console.log('✅ All data cleared successfully!');
    console.log('   - All tables are now empty');
    console.log('   - Auto-increment IDs reset to 1');
    console.log('   - Schema remains unchanged');
    
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

clearAllData().catch(console.error);