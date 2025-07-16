import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

async function setupDatabase() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔧 Setting up database...');

  // Create connection
  const sql = postgres(connectionString, { max: 1 });

  try {
    // Read and execute the migration file
    const migrationPath = join(__dirname, '../database/migrations/001_initial_schema.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Split by semicolons but be careful with function definitions
    const statements = migrationSQL
      .split(/;\s*$/m)
      .filter(stmt => stmt.trim().length > 0)
      .map(stmt => stmt.trim() + ';');

    // Execute each statement
    for (const statement of statements) {
      if (statement.includes('CREATE FUNCTION') || statement.includes('CREATE TRIGGER')) {
        // These need special handling due to $$ delimiters
        await sql.unsafe(statement);
      } else {
        await sql.unsafe(statement);
      }
    }

    console.log('✅ Database schema created successfully!');
    
    // Verify tables were created
    const tables = await sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `;
    
    console.log('\n📋 Created tables:');
    tables.forEach(table => {
      console.log(`  - ${table.tablename}`);
    });

    // Verify types were created
    const types = await sql`
      SELECT typname 
      FROM pg_type 
      WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND typtype = 'e'
      ORDER BY typname;
    `;
    
    console.log('\n📋 Created enum types:');
    types.forEach(type => {
      console.log(`  - ${type.typname}`);
    });

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Run the setup
setupDatabase().catch(console.error);