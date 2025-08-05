#!/bin/bash

# Build script for Lambda deployment with optimized package size

echo "Building Lambda package..."

# Clean previous builds
rm -rf lambda-build
mkdir -p lambda-build

# Copy source files
echo "Copying source files..."
cp -r dist/* lambda-build/

# Create minimal package.json
echo "Creating minimal package.json..."
cat > lambda-build/package.json << 'EOF'
{
  "name": "magnolia-lambda",
  "version": "1.0.0",
  "main": "lambda/api-handler-cjs.js",
  "dependencies": {
    "@aws-sdk/client-ssm": "^3.859.0",
    "@drift-labs/sdk": "^2.128.0-beta.7",
    "@nktkas/hyperliquid": "^0.23.1",
    "@solana/web3.js": "^1.98.2",
    "@vendia/serverless-express": "^4.12.6",
    "axios": "^1.10.0",
    "bs58": "^6.0.0",
    "buffer": "^6.0.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "drizzle-orm": "^0.29.3",
    "ethers": "^6.10.0",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "postgres": "^3.4.3",
    "tweetnacl": "^1.0.3",
    "winston": "^3.11.0",
    "zod": "^3.22.4"
  }
}
EOF

# Install production dependencies only
echo "Installing production dependencies..."
cd lambda-build
npm install --production --no-optional

# Remove unnecessary files
echo "Cleaning up..."
find . -name "*.md" -type f -delete
find . -name "*.txt" -type f -delete
find . -name "test" -type d -exec rm -rf {} +
find . -name "tests" -type d -exec rm -rf {} +
find . -name "docs" -type d -exec rm -rf {} +
find . -name ".git" -type d -exec rm -rf {} +
find . -name "examples" -type d -exec rm -rf {} +

# Show final size
echo "Final package size:"
du -sh .

echo "Build complete!"