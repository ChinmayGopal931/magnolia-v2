#!/bin/bash

# Clean previous build
echo "Cleaning previous build..."
rm -rf dist

# Build TypeScript
echo "Building TypeScript..."
npm run build:lambda

# Copy minimal package.json to dist
echo "Copying minimal package.json..."
cp lambda-package.json dist/package.json

# Install production dependencies in dist
echo "Installing production dependencies..."
cd dist
npm install --omit=dev

# Remove unnecessary files
echo "Cleaning up..."
find . -name "*.map" -type f -delete
find . -name "*.ts" -type f -delete
find . -name "*.d.ts" -type f -delete
find . -name "README.md" -type f -delete
find . -name "LICENSE" -type f -delete
find . -name ".gitignore" -type f -delete

# Remove AWS SDK v2 (provided by Lambda runtime)
rm -rf node_modules/aws-sdk

echo "Lambda package prepared successfully!"
echo "Package contents:"
ls -la
echo ""
echo "Package size:"
du -sh .