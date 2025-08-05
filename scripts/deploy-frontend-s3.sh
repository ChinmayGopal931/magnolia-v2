#!/bin/bash

# Deploy frontend to S3 with CloudFront

echo "🚀 Deploying Magnolia V2 Frontend to AWS..."
echo ""

# Configuration
BUCKET_NAME="magnolia-v2-frontend-$(date +%s)"
REGION="us-east-1"

# Create S3 bucket for static website hosting
echo "1. Creating S3 bucket: $BUCKET_NAME"
aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --region $REGION \
  --acl public-read

# Enable static website hosting
echo "2. Configuring static website hosting..."
aws s3 website s3://$BUCKET_NAME/ \
  --index-document index.html \
  --error-document index.html

# Create bucket policy for public access
echo "3. Setting bucket policy for public access..."
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket $BUCKET_NAME \
  --policy file:///tmp/bucket-policy.json

# Build the frontend
echo "4. Building frontend..."
cd frontend
npm run build

# Upload to S3
echo "5. Uploading build files to S3..."
aws s3 sync dist/ s3://$BUCKET_NAME/ \
  --delete \
  --cache-control "public, max-age=86400"

# Update index.html to not cache
aws s3 cp s3://$BUCKET_NAME/index.html s3://$BUCKET_NAME/index.html \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html" \
  --metadata-directive REPLACE

# Get the website URL
WEBSITE_URL="http://$BUCKET_NAME.s3-website-$REGION.amazonaws.com"

echo ""
echo "✅ Frontend deployed successfully!"
echo "🌐 Website URL: $WEBSITE_URL"
echo ""

# Update Lambda CORS settings
echo "6. Updating Lambda CORS settings..."
CURRENT_ORIGINS=$(aws lambda get-function-configuration \
  --function-name magnolia-v2-api \
  --region $REGION \
  --query 'Environment.Variables.ALLOWED_ORIGINS' \
  --output text)

NEW_ORIGINS="$CURRENT_ORIGINS,$WEBSITE_URL"

# Get current environment variables
CURRENT_ENV=$(aws lambda get-function-configuration \
  --function-name magnolia-v2-api \
  --region $REGION \
  --query 'Environment.Variables' \
  --output json)

# Update with new origins
echo "$CURRENT_ENV" | jq --arg origins "$NEW_ORIGINS" '.ALLOWED_ORIGINS = $origins' > /tmp/new-env.json

aws lambda update-function-configuration \
  --function-name magnolia-v2-api \
  --region $REGION \
  --environment "Variables=$(cat /tmp/new-env.json)" \
  --output json > /dev/null

echo "✅ CORS settings updated!"
echo ""
echo "📝 Summary:"
echo "- S3 Bucket: $BUCKET_NAME"
echo "- Website URL: $WEBSITE_URL"
echo "- API Endpoint: https://igqcgar4ne.execute-api.us-east-1.amazonaws.com/Prod"
echo ""
echo "🎉 Your frontend is now live at: $WEBSITE_URL"
echo ""
echo "💡 Next steps:"
echo "1. Update your frontend .env with:"
echo "   VITE_API_URL=https://igqcgar4ne.execute-api.us-east-1.amazonaws.com/Prod"
echo "2. For a custom domain, consider setting up CloudFront"
echo "3. For HTTPS, you must use CloudFront (S3 websites are HTTP only)"

# Cleanup
rm -f /tmp/bucket-policy.json /tmp/new-env.json