#!/bin/bash

# Deploy frontend to S3 with CloudFront (HTTPS enabled)

echo "🚀 Deploying Magnolia V2 Frontend with CloudFront..."
echo ""

# Configuration
BUCKET_NAME="magnolia-v2-frontend-$(aws sts get-caller-identity --query Account --output text)"
REGION="us-east-1"

# Check if bucket exists
if aws s3 ls "s3://$BUCKET_NAME" 2>&1 | grep -q 'NoSuchBucket'; then
  echo "1. Creating S3 bucket: $BUCKET_NAME"
  aws s3api create-bucket \
    --bucket $BUCKET_NAME \
    --region $REGION
else
  echo "1. Using existing bucket: $BUCKET_NAME"
fi

# Create bucket policy for CloudFront access
echo "2. Setting bucket policy for CloudFront access..."
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontAccess",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket $BUCKET_NAME \
  --policy file:///tmp/bucket-policy.json 2>/dev/null || true

# Build the frontend
echo "3. Building frontend..."
cd frontend
npm run build

# Upload to S3
echo "4. Uploading build files to S3..."
aws s3 sync dist/ s3://$BUCKET_NAME/ \
  --delete \
  --cache-control "public, max-age=86400"

# Update index.html to not cache
aws s3 cp s3://$BUCKET_NAME/index.html s3://$BUCKET_NAME/index.html \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html" \
  --metadata-directive REPLACE

cd ..

# Check if CloudFront distribution exists
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='Magnolia V2 Frontend'].Id" \
  --output text 2>/dev/null || echo "")

if [ -z "$DISTRIBUTION_ID" ] || [ "$DISTRIBUTION_ID" == "None" ]; then
  echo "5. Creating CloudFront distribution..."
  
  # Create CloudFront distribution
  cat > /tmp/cloudfront-config.json <<EOF
{
  "CallerReference": "magnolia-v2-$(date +%s)",
  "Comment": "Magnolia V2 Frontend",
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-$BUCKET_NAME",
        "DomainName": "$BUCKET_NAME.s3.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-$BUCKET_NAME",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"]
    },
    "Compress": true,
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {
        "Forward": "none"
      }
    },
    "TrustedSigners": {
      "Enabled": false,
      "Quantity": 0
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 300
      }
    ]
  },
  "Enabled": true,
  "PriceClass": "PriceClass_100"
}
EOF

  DISTRIBUTION_OUTPUT=$(aws cloudfront create-distribution \
    --distribution-config file:///tmp/cloudfront-config.json \
    --output json)
  
  DISTRIBUTION_ID=$(echo "$DISTRIBUTION_OUTPUT" | jq -r '.Distribution.Id')
  DOMAIN_NAME=$(echo "$DISTRIBUTION_OUTPUT" | jq -r '.Distribution.DomainName')
else
  echo "5. Using existing CloudFront distribution: $DISTRIBUTION_ID"
  
  # Invalidate cache
  aws cloudfront create-invalidation \
    --distribution-id $DISTRIBUTION_ID \
    --paths "/*" \
    --output json > /dev/null
  
  DOMAIN_NAME=$(aws cloudfront get-distribution \
    --id $DISTRIBUTION_ID \
    --query 'Distribution.DomainName' \
    --output text)
fi

CLOUDFRONT_URL="https://$DOMAIN_NAME"

echo ""
echo "✅ Frontend deployed successfully!"
echo "🌐 CloudFront URL: $CLOUDFRONT_URL"
echo ""

# Update Lambda CORS settings
echo "6. Updating Lambda CORS settings..."
CURRENT_ENV=$(aws lambda get-function-configuration \
  --function-name magnolia-v2-api \
  --region $REGION \
  --query 'Environment.Variables' \
  --output json)

# Add CloudFront URL to allowed origins
CURRENT_ORIGINS=$(echo "$CURRENT_ENV" | jq -r '.ALLOWED_ORIGINS')
if [[ ! "$CURRENT_ORIGINS" == *"$CLOUDFRONT_URL"* ]]; then
  NEW_ORIGINS="$CURRENT_ORIGINS,$CLOUDFRONT_URL"
  
  echo "$CURRENT_ENV" | jq --arg origins "$NEW_ORIGINS" '.ALLOWED_ORIGINS = $origins' > /tmp/new-env.json
  
  aws lambda update-function-configuration \
    --function-name magnolia-v2-api \
    --region $REGION \
    --environment "Variables=$(cat /tmp/new-env.json)" \
    --output json > /dev/null
  
  echo "✅ CORS settings updated!"
else
  echo "✅ CloudFront URL already in CORS settings"
fi

echo ""
echo "📝 Summary:"
echo "- S3 Bucket: $BUCKET_NAME"
echo "- CloudFront Distribution: $DISTRIBUTION_ID"
echo "- CloudFront URL: $CLOUDFRONT_URL"
echo "- API Endpoint: https://igqcgar4ne.execute-api.us-east-1.amazonaws.com/Prod"
echo ""
echo "🎉 Your frontend is now live at: $CLOUDFRONT_URL"
echo ""
echo "⏳ Note: CloudFront deployment takes 5-15 minutes to propagate globally"
echo ""
echo "💡 Next steps:"
echo "1. Wait for CloudFront to deploy (check status in AWS Console)"
echo "2. Access your app at: $CLOUDFRONT_URL"
echo "3. The URL is automatically whitelisted in your API CORS settings"

# Cleanup
rm -f /tmp/bucket-policy.json /tmp/cloudfront-config.json /tmp/new-env.json