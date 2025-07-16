#!/bin/bash

# Database reset script for development

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
DB_NAME="${DB_NAME:-magnolia_dex}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

echo -e "${YELLOW}WARNING: This will completely reset the database!${NC}"
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo -n "Are you sure you want to continue? (y/N): "
read -r response

if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "Reset cancelled."
    exit 0
fi

echo -e "${YELLOW}Dropping and recreating database...${NC}"

# Drop existing database
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "DROP DATABASE IF EXISTS $DB_NAME"

# Create new database
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database recreated${NC}"
else
    echo -e "${RED}✗ Failed to recreate database${NC}"
    exit 1
fi

# Run setup script
echo -e "${YELLOW}Running setup script...${NC}"
./database/scripts/setup.sh

echo -e "\n${GREEN}✓ Database reset completed!${NC}"