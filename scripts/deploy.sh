#!/bin/bash

# AWS Deployment Script for Magnolia V2
# This script handles the complete deployment process

set -e  # Exit on any error

echo "🚀 Starting Magnolia V2 AWS Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
    exit 1
fi

if ! command -v sam &> /dev/null; then
    echo -e "${RED}❌ SAM CLI not found. Please install it first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All prerequisites met${NC}"

# Set default values
STACK_NAME="magnolia-v2"
REGION="us-east-1"
DB_PASSWORD=""
HL_KEY=""
DRIFT_KEY=""
TELEGRAM_TOKEN=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --stack-name)
            STACK_NAME="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --db-password)
            DB_PASSWORD="$2"
            shift 2
            ;;
        --hl-key)
            HL_KEY="$2"
            shift 2
            ;;
        --drift-key)
            DRIFT_KEY="$2"
            shift 2
            ;;
        --telegram-token)
            TELEGRAM_TOKEN="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Prompt for database password if not provided
if [ -z "$DB_PASSWORD" ]; then
    echo -e "${YELLOW}Please enter a database password (min 8 characters):${NC}"
    read -s DB_PASSWORD
    echo
fi

# Validate password length
if [ ${#DB_PASSWORD} -lt 8 ]; then
    echo -e "${RED}❌ Database password must be at least 8 characters${NC}"
    exit 1
fi

# Build the application
echo -e "${YELLOW}Building application...${NC}"
npm run build

# Create S3 bucket for SAM deployments (if it doesn't exist)
BUCKET_NAME="magnolia-sam-deployments-$(aws sts get-caller-identity --query Account --output text)"
echo -e "${YELLOW}Creating/checking S3 bucket: ${BUCKET_NAME}${NC}"

if aws s3 ls "s3://${BUCKET_NAME}" 2>&1 | grep -q 'NoSuchBucket'; then
    aws s3 mb "s3://${BUCKET_NAME}" --region "${REGION}"
    echo -e "${GREEN}✅ Created S3 bucket${NC}"
else
    echo -e "${GREEN}✅ S3 bucket already exists${NC}"
fi

# Build SAM application
echo -e "${YELLOW}Building SAM application...${NC}"
sam build --region "${REGION}"

# Deploy SAM application
echo -e "${YELLOW}Deploying SAM application...${NC}"

PARAMS="DatabasePassword=${DB_PASSWORD}"
[ ! -z "$HL_KEY" ] && PARAMS="${PARAMS} HyperliquidKey=${HL_KEY}"
[ ! -z "$DRIFT_KEY" ] && PARAMS="${PARAMS} DriftKey=${DRIFT_KEY}"
[ ! -z "$TELEGRAM_TOKEN" ] && PARAMS="${PARAMS} TelegramToken=${TELEGRAM_TOKEN}"

sam deploy \
    --stack-name "${STACK_NAME}" \
    --s3-bucket "${BUCKET_NAME}" \
    --capabilities CAPABILITY_IAM \
    --region "${REGION}" \
    --parameter-overrides ${PARAMS} \
    --no-confirm-changeset

# Get outputs
echo -e "${YELLOW}Getting deployment outputs...${NC}"

API_URL=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
    --output text)

DB_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
    --output text)

echo -e "${GREEN}✅ Deployment completed!${NC}"
echo
echo -e "${YELLOW}Deployment Information:${NC}"
echo "API URL: ${API_URL}"
echo "Database Endpoint: ${DB_ENDPOINT}"
echo
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Run database migrations:"
echo "   export DATABASE_URL=postgresql://magnoliaadmin:${DB_PASSWORD}@${DB_ENDPOINT}:5432/magnolia"
echo "   npm run db:migrate"
echo
echo "2. Test the API:"
echo "   curl ${API_URL}/health"
echo
echo "3. Set up Telegram webhook (if using):"
echo "   curl -X POST \"https://api.telegram.org/bot\${TELEGRAM_TOKEN}/setWebhook\" -d \"url=${API_URL}/telegram/webhook\""