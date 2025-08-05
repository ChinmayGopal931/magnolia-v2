#!/bin/bash

# Add a new origin to Lambda CORS settings

if [ -z "$1" ]; then
  echo "Usage: ./add-cors-origin.sh <origin-url>"
  echo "Example: ./add-cors-origin.sh https://myapp.example.com"
  exit 1
fi

NEW_ORIGIN="$1"
REGION="us-east-1"

echo "Adding $NEW_ORIGIN to CORS allowed origins..."

# Get current environment
CURRENT_ENV=$(aws lambda get-function-configuration \
  --function-name magnolia-v2-api \
  --region $REGION \
  --query 'Environment.Variables' \
  --output json)

# Get current origins
CURRENT_ORIGINS=$(echo "$CURRENT_ENV" | jq -r '.ALLOWED_ORIGINS')

# Check if already exists
if [[ "$CURRENT_ORIGINS" == *"$NEW_ORIGIN"* ]]; then
  echo "✅ Origin already in allowed list"
  exit 0
fi

# Add new origin
NEW_ORIGINS="$CURRENT_ORIGINS,$NEW_ORIGIN"

# Update environment
echo "$CURRENT_ENV" | jq --arg origins "$NEW_ORIGINS" '.ALLOWED_ORIGINS = $origins' > /tmp/new-env.json

aws lambda update-function-configuration \
  --function-name magnolia-v2-api \
  --region $REGION \
  --environment "Variables=$(cat /tmp/new-env.json)" \
  --output json > /dev/null

echo "✅ Successfully added $NEW_ORIGIN to CORS allowed origins"
echo "Current allowed origins: $NEW_ORIGINS"

rm -f /tmp/new-env.json