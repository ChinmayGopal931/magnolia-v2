#!/bin/sh
set -e

echo "Starting Magnolia V2..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until pg_isready -h "${DATABASE_HOST:-postgres}" -p "${DATABASE_PORT:-5432}" -U "${DATABASE_USER:-magnolia_user}"; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "PostgreSQL is ready!"

# Run migrations
echo "Running database migrations..."
npm run db:migrate || {
  echo "Migration failed, but continuing (database might already be migrated)"
}

# Start the application
echo "Starting application..."
exec "$@"