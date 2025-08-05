# Magnolia V2 - 6-Month Free Tier Architecture

## Complete Architecture (100% Free for 6 Months)

```
┌─────────────────────────────────────────────────────┐
│          API Gateway (1M requests/month free)       │
│                 api.magnolia.com                    │
└──────────────────┬──────────────────────────────────┘
                   │
         ┌─────────┴─────────┬────────────────┐
         │                   │                │
┌────────┴────────┐ ┌───────┴──────┐ ┌──────┴───────┐
│ Lambda Function │ │Lambda Monitor│ │Lambda Telegram│
│   API Handler   │ │  (Scheduled) │ │   Webhook     │
│  (1M req free)  │ │ Every 30 min │ │  (Bot logic)  │
└────────┬────────┘ └───────┬──────┘ └──────┬───────┘
         │                   │                │
         └─────────┬─────────┴────────────────┘
                   │
         ┌─────────┴─────────┬──────────────────┐
         │                   │                  │
┌────────┴────────┐ ┌───────┴──────┐ ┌─────────┴────────┐
│ RDS PostgreSQL  │ │   DynamoDB   │ │ Parameter Store  │
│   (t3.micro)    │ │  (25GB free) │ │ (Free for keys)  │
│  750 hrs/month  │ │ Cache & State│ │ Standard params  │
└─────────────────┘ └──────────────┘ └──────────────────┘
```

## Services We'll Use (All Free)

### 1. **AWS Lambda** (Always Free)
- **Free Tier**: 1M requests + 400,000 GB-seconds/month
- **Our Usage**: ~15K requests/month (1.5% of limit)
- **Functions**:
  - `magnolia-api`: Main API handler
  - `magnolia-monitor`: Position monitoring
  - `magnolia-telegram`: Telegram bot webhook

### 2. **API Gateway** (Always Free)
- **Free Tier**: 1M API calls/month
- **Our Usage**: ~10K calls/month (1% of limit)
- **Endpoints**: REST API for all routes

### 3. **RDS PostgreSQL** (12 Months Free)
- **Free Tier**: 750 hours t3.micro + 20GB storage
- **Our Usage**: 730 hours/month (97% of limit)
- **Purpose**: Main database (your existing schema)

### 4. **DynamoDB** (Always Free)
- **Free Tier**: 25GB storage + 25 read/write units
- **Our Usage**: <1GB (4% of limit)
- **Tables**: 4 tables for caching

### 5. **Systems Manager Parameter Store** (Free Alternative to Secrets Manager)
- **Free Tier**: 10,000 parameters (Standard)
- **Our Usage**: ~10 parameters
- **Purpose**: Store API keys and private keys

### 6. **EventBridge** (Always Free)
- **Free Tier**: All default bus events
- **Our Usage**: Scheduling Lambda functions

### 7. **CloudWatch** (Always Free)
- **Free Tier**: 10 metrics + 5GB logs + 1M API requests
- **Our Usage**: <1GB logs (20% of limit)

### 8. **SNS** (Always Free)  
- **Free Tier**: 1M publishes + 100K HTTP deliveries
- **Our Usage**: Internal notifications only

## Implementation Details

### 1. API Lambda Function
```typescript
// lambda/api-handler.ts
import { APIGatewayProxyHandler } from 'aws-lambda';
import serverlessExpress from '@vendia/serverless-express';
import { app } from '../src/app'; // Your Express app

const serverlessApp = serverlessExpress({ app });

export const handler: APIGatewayProxyHandler = (event, context) => {
  return serverlessApp(event, context);
};
```

### 2. Free Secrets Storage (Parameter Store)
```typescript
// services/secrets.service.ts
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

export class SecretsService {
  private static cache = new Map<string, string>();
  
  static async getSecret(name: string): Promise<string> {
    // Check cache first
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }
    
    try {
      const command = new GetParameterCommand({
        Name: `/magnolia/${name}`,
        WithDecryption: false // Free tier doesn't include encryption
      });
      
      const response = await ssmClient.send(command);
      const value = response.Parameter?.Value || '';
      
      // Cache for Lambda lifetime
      this.cache.set(name, value);
      return value;
    } catch (error) {
      console.error(`Failed to get secret ${name}:`, error);
      // Fallback to environment variable
      return process.env[name.toUpperCase()] || '';
    }
  }
}

// Usage:
const hyperliquidKey = await SecretsService.getSecret('hyperliquid_key');
const driftKey = await SecretsService.getSecret('drift_key');
const telegramToken = await SecretsService.getSecret('telegram_token');
```

### 3. Store Secrets in Parameter Store
```bash
# Store your secrets (one-time setup)
aws ssm put-parameter \
  --name "/magnolia/hyperliquid_key" \
  --value "your-private-key" \
  --type "String"

aws ssm put-parameter \
  --name "/magnolia/drift_key" \
  --value "your-drift-key" \
  --type "String"

aws ssm put-parameter \
  --name "/magnolia/telegram_token" \
  --value "your-bot-token" \
  --type "String"

aws ssm put-parameter \
  --name "/magnolia/db_url" \
  --value "postgresql://user:pass@rds-endpoint/magnolia" \
  --type "String"
```

### 4. DynamoDB Tables (SAM Template)
```yaml
Resources:
  # 1. Position Monitoring Cache
  PositionCacheTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: magnolia-position-cache
      BillingMode: PROVISIONED
      ProvisionedThroughput:
        ReadCapacityUnits: 5  # Well within free tier
        WriteCapacityUnits: 5
      AttributeDefinitions:
        - AttributeName: positionId
          AttributeType: S
      KeySchema:
        - AttributeName: positionId
          KeyType: HASH
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  # 2. Telegram Settings
  TelegramSettingsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: magnolia-telegram
      BillingMode: PROVISIONED
      ProvisionedThroughput:
        ReadCapacityUnits: 2
        WriteCapacityUnits: 2
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: N
      KeySchema:
        - AttributeName: userId
          KeyType: HASH

  # 3. Alert History  
  AlertHistoryTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: magnolia-alerts
      BillingMode: PROVISIONED
      ProvisionedThroughput:
        ReadCapacityUnits: 3
        WriteCapacityUnits: 5
      AttributeDefinitions:
        - AttributeName: alertKey
          AttributeType: S
      KeySchema:
        - AttributeName: alertKey
          KeyType: HASH
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  # 4. Funding Rate Cache
  FundingCacheTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: magnolia-funding
      BillingMode: PROVISIONED
      ProvisionedThroughput:
        ReadCapacityUnits: 5
        WriteCapacityUnits: 3
      AttributeDefinitions:
        - AttributeName: pair
          AttributeType: S
      KeySchema:
        - AttributeName: pair
          KeyType: HASH
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true
```

### 5. Monitoring Lambda (Runs Every 30 Minutes)
```typescript
// lambda/monitor.ts
import { EventBridgeEvent } from 'aws-lambda';

export const handler = async (event: EventBridgeEvent<'Scheduled Event', any>) => {
  console.log('Starting position monitoring...');
  
  // 1. Get database connection
  const dbUrl = await SecretsService.getSecret('db_url');
  const db = await connectToDatabase(dbUrl);
  
  // 2. Get all open positions
  const positions = await db.query(
    'SELECT * FROM positions WHERE status = $1',
    ['open']
  );
  
  // 3. Check each position
  for (const position of positions.rows) {
    // Check cache first
    const cached = await getCachedPosition(position.id);
    if (cached && !needsRefresh(cached)) {
      continue;
    }
    
    // Get current prices
    const prices = await fetchCurrentPrices(position.symbol);
    
    // Calculate risk
    const risk = calculateLiquidationRisk(position, prices);
    
    // Update cache
    await updatePositionCache(position.id, { risk, prices });
    
    // Send alert if needed
    if (risk > 0.8) {
      await sendTelegramAlert(position);
    }
  }
  
  return { statusCode: 200 };
};
```

### 6. Complete SAM Deployment Template
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: nodejs18.x
    Timeout: 30
    MemorySize: 512
    Environment:
      Variables:
        NODE_ENV: production

Resources:
  # API Lambda
  ApiFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: magnolia-api
      CodeUri: ./dist
      Handler: lambda/api-handler.handler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: "*"
        - SSMParameterReadPolicy:
            ParameterName: "magnolia/*"
        - Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action:
                - rds:DescribeDBInstances
                - rds-db:connect
              Resource: "*"
      Events:
        ApiEvent:
          Type: Api
          Properties:
            Path: /{proxy+}
            Method: ANY

  # Monitoring Lambda
  MonitorFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: magnolia-monitor
      CodeUri: ./dist
      Handler: lambda/monitor.handler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: "*"
        - SSMParameterReadPolicy:
            ParameterName: "magnolia/*"
      Events:
        ScheduleEvent:
          Type: Schedule
          Properties:
            Schedule: rate(30 minutes)
            Name: magnolia-monitor-schedule
            Enabled: true

  # Telegram Webhook Lambda
  TelegramFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: magnolia-telegram
      CodeUri: ./dist
      Handler: lambda/telegram.handler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: "*"
        - SSMParameterReadPolicy:
            ParameterName: "magnolia/*"
      Events:
        TelegramWebhook:
          Type: Api
          Properties:
            Path: /telegram/webhook
            Method: POST

  # RDS Instance
  Database:
    Type: AWS::RDS::DBInstance
    Properties:
      DBInstanceIdentifier: magnolia-db
      DBInstanceClass: db.t3.micro
      Engine: postgres
      EngineVersion: '15.4'
      MasterUsername: magnoliaadmin
      MasterUserPassword: !Sub '{{resolve:ssm:/magnolia/db_password}}'
      AllocatedStorage: 20
      StorageType: gp2
      BackupRetentionPeriod: 7
      PreferredBackupWindow: "03:00-04:00"
      PreferredMaintenanceWindow: "sun:04:00-sun:05:00"
      MultiAZ: false  # Single AZ to stay in free tier
      PubliclyAccessible: false
      VPCSecurityGroups:
        - !Ref DatabaseSecurityGroup

  # Security Group for RDS
  DatabaseSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for Magnolia RDS
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 5432
          ToPort: 5432
          SourceSecurityGroupId: !Ref LambdaSecurityGroup

  # Lambda Security Group
  LambdaSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for Lambda functions
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0

Outputs:
  ApiUrl:
    Description: API Gateway endpoint URL
    Value: !Sub 'https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/'
  
  TelegramWebhookUrl:
    Description: Telegram webhook URL
    Value: !Sub 'https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/telegram/webhook'
```

## Deployment Steps

### 1. Initial Setup
```bash
# Install SAM CLI
pip install aws-sam-cli

# Create parameter store values
aws ssm put-parameter --name "/magnolia/db_password" --value "your-secure-password" --type "String"
aws ssm put-parameter --name "/magnolia/hyperliquid_key" --value "your-hl-key" --type "String"
aws ssm put-parameter --name "/magnolia/drift_key" --value "your-drift-key" --type "String"
aws ssm put-parameter --name "/magnolia/telegram_token" --value "your-bot-token" --type "String"
```

### 2. Build and Deploy
```bash
# Build the application
npm run build

# Package for deployment
sam build

# Deploy (first time)
sam deploy --guided

# Subsequent deploys
sam deploy
```

### 3. Set Up Telegram Webhook
```bash
# Get your API URL from the deployment output
API_URL="https://xxx.execute-api.region.amazonaws.com/Prod"

# Set Telegram webhook
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${API_URL}/telegram/webhook"
```

## Cost Analysis (6 Months)

```yaml
Service           | Usage              | Free Tier      | Cost
------------------|-------------------|----------------|------
Lambda            | 15K requests/mo   | 1M/mo          | $0
Lambda Compute    | 5K GB-sec/mo      | 400K GB-sec/mo | $0
API Gateway       | 10K requests/mo   | 1M/mo          | $0
RDS t3.micro      | 730 hours/mo      | 750 hrs/mo     | $0
DynamoDB Storage  | 0.5GB             | 25GB           | $0
DynamoDB Read     | 5 units           | 25 units       | $0
DynamoDB Write    | 5 units           | 25 units       | $0
Parameter Store   | 10 parameters     | 10K params     | $0
CloudWatch Logs   | 0.5GB/mo          | 5GB/mo         | $0
EventBridge       | 1,440 events/mo   | Unlimited      | $0
Data Transfer     | <1GB              | 15GB           | $0

TOTAL for 6 months: $0.00
```


## Security Considerations

Since we're not using Secrets Manager encryption:

1. **Parameter Store** - Stores as plain text (free tier)
2. **Environment Variables** - Backup option
3. **Database Password** - Use strong passwords
4. **API Keys** - Rotate regularly

For production after 6 months, consider upgrading to:
- Secrets Manager ($0.40/secret/month)
- VPC with private subnets
- Multi-AZ RDS for high availability

## Monitoring Your Usage

```bash
# Check Lambda invocations
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=magnolia-api \
  --statistics Sum \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T23:59:59Z \
  --period 2592000

# Check DynamoDB usage
aws dynamodb describe-table --table-name magnolia-position-cache
```

## Next Steps After 6 Months

When your free plan expires:
1. **Months 7-12**: RDS stays free (12-month tier)
2. **Month 13+**: Only RDS costs money (~$17/month)
3. Your $100 credits cover ~6 months of RDS

This architecture gives you a complete, production-ready system that costs $0 for the first year!