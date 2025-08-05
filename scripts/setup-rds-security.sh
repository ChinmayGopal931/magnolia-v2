#!/bin/bash

echo "Setting up RDS security group..."

# Get default VPC ID
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query "Vpcs[0].VpcId" --output text --region us-east-1)
echo "Default VPC ID: $VPC_ID"

# Create security group for RDS
SG_ID=$(aws ec2 create-security-group \
  --group-name magnolia-rds-sg \
  --description "Security group for Magnolia RDS database" \
  --vpc-id $VPC_ID \
  --query "GroupId" \
  --output text \
  --region us-east-1 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=magnolia-rds-sg" \
    --query "SecurityGroups[0].GroupId" \
    --output text \
    --region us-east-1)

echo "Security Group ID: $SG_ID"

# Allow PostgreSQL from anywhere (for initial setup - we'll restrict this later)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 5432 \
  --cidr 0.0.0.0/0 \
  --region us-east-1 2>/dev/null || echo "PostgreSQL rule already exists"

# Allow PostgreSQL from Lambda (within VPC)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 5432 \
  --source-group $SG_ID \
  --region us-east-1 2>/dev/null || echo "Self-referencing rule already exists"

echo "Security group setup complete!"
echo "Security Group ID: $SG_ID"