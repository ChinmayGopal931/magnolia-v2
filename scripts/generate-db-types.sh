#!/bin/bash

# Script to generate database types from schema

echo "🔧 Generating database types..."

# Generate Drizzle migrations
npm run db:generate

# Push schema to database (this will create tables if they don't exist)
npm run db:push

echo "✅ Database types generated successfully!"
echo ""
echo "To apply the schema to your database, run:"
echo "  psql -U postgres -d your_database_name -f database/migrations/001_initial_schema.sql"
echo ""
echo "Or if using Docker:"
echo "  docker-compose up -d"