#!/bin/bash

echo "Building TypeScript..."
npm run build

echo "Creating bundle directory..."
mkdir -p .aws-sam/build

echo "Bundling Lambda function with esbuild..."
npx esbuild dist/lambda/api-handler.js \
  --bundle \
  --outfile=.aws-sam/build/lambda-bundle.js \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --minify \
  --external:aws-sdk \
  --external:@aws-sdk/* \
  --legal-comments=none

echo "Bundle created!"
ls -lh .aws-sam/build/lambda-bundle.js