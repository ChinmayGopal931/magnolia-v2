#!/bin/bash

# Script to set up environment variables for Lambda
# This includes sensitive private keys

echo "Setting up Lambda environment variables..."
echo ""
echo "⚠️  WARNING: This will configure private keys for trading!"
echo "Make sure you have:"
echo "1. A Solana wallet private key for Drift trading"
echo "2. (Optional) An EVM wallet private key for Hyperliquid"
echo ""

# Prompt for Solana private key
read -p "Enter your Solana private key (base58 format) for Drift trading: " SOLANA_KEY
if [ -z "$SOLANA_KEY" ]; then
    echo "❌ Solana private key is required for Drift trading"
    exit 1
fi

# Prompt for EVM private key (optional)
read -p "Enter your EVM private key (0x... format) for Hyperliquid (optional, press Enter to skip): " EVM_KEY

# Build the environment variables JSON
ENV_VARS='{
  "DATABASE_URL": "postgresql://magnolia_admin:Magnolia1754189353%21@magnolia-v2-db.cmbo2u8wu5qp.us-east-1.rds.amazonaws.com:5432/magnolia?sslmode=require",
  "NODE_ENV": "production",
  "ALLOWED_ORIGINS": "http://localhost:5173,http://localhost:3000,http://localhost:3001",
  "MAGNOLIA_SOLANA_PRIVATE_KEY": "'$SOLANA_KEY'"'

# Add EVM key if provided
if [ ! -z "$EVM_KEY" ]; then
    ENV_VARS="${ENV_VARS%\}*}"  # Remove closing brace
    ENV_VARS+=',
  "MAGNOLIA_EVM_PRIVATE_KEY": "'$EVM_KEY'"
}'
else
    ENV_VARS+='
}'
fi

echo ""
echo "Updating Lambda function configuration..."

# Update Lambda
aws lambda update-function-configuration \
  --function-name magnolia-v2-api \
  --environment "Variables=$ENV_VARS" \
  --region us-east-1 \
  --output json > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ Lambda environment variables updated successfully!"
    echo ""
    echo "Private keys have been configured. Your backend can now:"
    echo "- Execute trades on Drift (Solana)"
    if [ ! -z "$EVM_KEY" ]; then
        echo "- Execute trades on Hyperliquid (EVM)"
    fi
    echo ""
    echo "⚠️  SECURITY NOTES:"
    echo "1. These keys have trading permissions - keep them secure!"
    echo "2. Consider using AWS Secrets Manager for production"
    echo "3. Monitor your Lambda logs for any suspicious activity"
else
    echo "❌ Failed to update Lambda configuration"
    exit 1
fi