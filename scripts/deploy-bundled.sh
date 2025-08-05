#!/bin/bash

echo "Building TypeScript..."
npm run build

echo "Creating deployment directory..."
rm -rf .aws-sam
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
  --legal-comments=none \
  --tree-shaking=true

echo "Bundle size:"
ls -lh .aws-sam/build/lambda-bundle.js

echo "Deploying to AWS..."
sam deploy \
  --template template-bundle.yaml \
  --stack-name magnolia-api-production \
  --capabilities CAPABILITY_IAM \
  --region us-east-1 \
  --no-confirm-changeset \
  --parameter-overrides file://parameters.json