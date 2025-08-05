#!/bin/bash

echo "Preparing Lambda Layer..."

# Clean up
rm -rf layer-deps
mkdir -p layer-deps/nodejs

# Create package.json for the layer with heavy dependencies
cat > layer-deps/nodejs/package.json << 'EOF'
{
  "name": "magnolia-layer",
  "version": "1.0.0",
  "dependencies": {
    "@drift-labs/sdk": "^2.128.0-beta.7",
    "@nktkas/hyperliquid": "^0.23.1",
    "@solana/web3.js": "^1.98.2",
    "drizzle-orm": "^0.29.3",
    "ethers": "^6.10.0",
    "postgres": "^3.4.3"
  }
}
EOF

# Install dependencies
cd layer-deps/nodejs
npm install --production --no-optional

# Show size
echo "Layer size:"
du -sh .

# Go back to root
cd ../..

# Now update dist/package.json to only include light dependencies
cat > dist/package.json << 'EOF'
{
  "name": "magnolia-lambda",
  "version": "1.0.0",
  "dependencies": {
    "@aws-sdk/client-ssm": "^3.859.0",
    "@vendia/serverless-express": "^4.12.6",
    "axios": "^1.10.0",
    "bs58": "^6.0.0",
    "buffer": "^6.0.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "tweetnacl": "^1.0.3",
    "winston": "^3.11.0",
    "zod": "^3.22.4"
  }
}
EOF

echo "Done! Ready to deploy with:"
echo "sam build -t template-with-layer.yaml && sam deploy"