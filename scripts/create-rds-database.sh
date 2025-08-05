#!/bin/bash

# RDS Database creation script for Magnolia V2
# Uses AWS Free Tier eligible settings

DB_INSTANCE_IDENTIFIER="magnolia-v2-db"
DB_NAME="magnolia"
MASTER_USERNAME="magnolia_admin"
# Generate a secure password
MASTER_PASSWORD="Magnolia$(date +%s)!"

echo "Creating RDS PostgreSQL database..."
echo "Instance: $DB_INSTANCE_IDENTIFIER"
echo "Database: $DB_NAME"
echo "Username: $MASTER_USERNAME"
echo "Password: $MASTER_PASSWORD"
echo ""

# Create the RDS instance
aws rds create-db-instance \
  --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15.7 \
  --master-username $MASTER_USERNAME \
  --master-user-password "$MASTER_PASSWORD" \
  --allocated-storage 20 \
  --storage-type gp2 \
  --vpc-security-group-ids sg-088fbb3caaabf043b \
  --backup-retention-period 7 \
  --no-multi-az \
  --publicly-accessible \
  --db-name $DB_NAME \
  --region us-east-1

echo ""
echo "Database creation initiated. This will take 5-10 minutes."
echo ""
echo "IMPORTANT: Save these credentials securely!"
echo "Username: $MASTER_USERNAME"
echo "Password: $MASTER_PASSWORD"
echo ""
echo "Waiting for database to be available..."

# Wait for the database to be available
aws rds wait db-instance-available \
  --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
  --region us-east-1

echo "Database is now available!"

# Get the endpoint
ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
  --query "DBInstances[0].Endpoint.Address" \
  --output text \
  --region us-east-1)

echo ""
echo "Database Endpoint: $ENDPOINT"
echo ""
echo "Connection String:"
echo "postgresql://$MASTER_USERNAME:$MASTER_PASSWORD@$ENDPOINT:5432/$DB_NAME"