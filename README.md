# Magnolia V2 - Delta Neutral Position Tracker

A professional backend service for tracking delta neutral positions across multiple perpetual DEXes, starting with Hyperliquid integration.

## Features

- **Multi-DEX Support**: Built to support multiple perpetual DEXes (Hyperliquid, Drift)
- **Agent Wallet System**: Support for Hyperliquid's agent wallet architecture
- **Position Tracking**: Real-time position tracking and management
- **Order Management**: Place, modify, and cancel orders with signature verification
- **Audit Logging**: Comprehensive audit trail for all actions
- **Nonce Management**: Automatic nonce handling for Hyperliquid's requirements

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Ethereum signature-based auth
- **API Client**: Hyperliquid SDK (@nktkas/hyperliquid)

## Setup

### Prerequisites

1. Docker and Docker Compose
2. Node.js 18+ (for local development without Docker)
3. Make (optional, for easier command execution)

### Quick Start with Docker

```bash
# Clone the repository
git clone <repository-url>
cd magnolia-v2

# Start development environment
make dev
# OR without make:
docker-compose up

# The API will be available at http://localhost:3000
# PostgreSQL will be available at localhost:5432
```

### Manual Installation (without Docker)

```bash
# Install dependencies
npm install

# Set up PostgreSQL database
# Create a database named 'magnolia_v2'

# Copy environment variables
cp .env.example .env

# Update .env with your configuration
# - DATABASE_URL: PostgreSQL connection string
# - HYPERLIQUID_CHAIN: Mainnet or Testnet
# - Other configuration as needed

# Run migrations
npm run db:migrate
```

## Development

### Using Docker (Recommended)

```bash
# Start development environment
make dev                 # Start with logs
make up                  # Start in background

# View logs
make logs               # Application logs
docker-compose logs -f  # All services

# Access containers
make shell              # Application shell
make db-shell           # PostgreSQL shell

# Database operations
make migrate            # Run migrations
make studio             # Open Drizzle Studio (port 4983)

# Stop services
make down
```

### Without Docker

```bash
# Run in development mode with hot reload
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Build for production
npm run build

# Run production build
npm start
```

## API Documentation

### Authentication

All API endpoints require authentication using Ethereum signatures:

```
Authorization: Bearer <address>:<signature>:<timestamp>
```

The signature should sign the message:
```
Authenticate to Magnolia
Address: <address>
Timestamp: <timestamp>
```

### Endpoints

#### Agent Management

**Approve Agent Wallet**
```
POST /api/hyperliquid/agents/:agentId/approve
Body: {
  agentAddress: string,
  agentName?: string,
  signature: string,
  action: object
}
```

#### Order Management

**Place Orders**
```
POST /api/hyperliquid/accounts/:accountId/orders
Body: {
  orders: Array<{
    asset: number,
    isBuy: boolean,
    price: string,
    size: string,
    // ... other order params
  }>,
  signature: string
}
```

**Cancel Orders**
```
POST /api/hyperliquid/accounts/:accountId/orders/cancel
Body: {
  cancels: Array<{
    asset: number,
    orderId: number
  }>,
  signature: string
}
```

**Get Open Orders**
```
GET /api/hyperliquid/accounts/:accountId/orders?asset=<asset>
```

#### Position Management

**Get Positions**
```
GET /api/hyperliquid/accounts/:accountId/positions
```

**Update Positions**
```
POST /api/hyperliquid/accounts/:accountId/positions
Body: {
  positions: Array<{
    asset: string,
    side: 'buy' | 'sell',
    size: string,
    entryPrice: string,
    // ... other position data
  }>
}
```

#### Trade History

**Get Trades**
```
GET /api/hyperliquid/accounts/:accountId/trades?limit=100&startDate=<date>&endDate=<date>
```

## Project Structure

```
src/
├── db/
│   ├── connection.ts     # Database connection setup
│   ├── schema.ts         # Drizzle schema definitions
│   └── hyperliquid.ts    # Hyperliquid-specific queries
├── services/
│   └── hyperliquid.ts    # Business logic and API integration
├── routes/
│   └── hyperliquid.ts    # Express route handlers
├── types/
│   ├── common.ts         # Common type definitions
│   └── hyperliquid.ts    # Hyperliquid-specific types
├── middleware/
│   ├── auth.ts           # Authentication middleware
│   ├── validation.ts     # Request validation
│   ├── rateLimiter.ts    # Rate limiting
│   └── errorHandler.ts   # Global error handling
├── utils/
│   ├── logger.ts         # Winston logger setup
│   └── nonce.ts          # Nonce management
├── scripts/
│   └── migrate.ts        # Database migration script
└── index.ts              # Application entry point
```

## Security Considerations

1. **Signature Verification**: All trading operations require valid signatures
2. **Rate Limiting**: Configurable rate limits to prevent abuse
3. **Nonce Management**: Prevents replay attacks with time-windowed nonces
4. **Audit Logging**: All actions are logged for security analysis
5. **Environment Variables**: Sensitive configuration stored in environment

## Error Handling

The API uses standardized error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

Common error codes:
- `INVALID_REQUEST`: Validation failed
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Access denied
- `NOT_FOUND`: Resource not found
- `ORDER_REJECTED`: Exchange rejected the order
- `SIGNATURE_INVALID`: Invalid signature

## Contributing

1. Follow TypeScript best practices
2. Maintain comprehensive error handling
3. Add appropriate logging for debugging
4. Write clean, professional code
5. Update documentation for new features

## Docker Architecture

### Development Setup

The development environment uses Docker Compose with:
- **PostgreSQL 16**: Database with automatic initialization
- **Node.js App**: Hot-reloading development server
- **Drizzle Studio**: Database GUI (optional, port 4983)

### Production Setup

The production setup includes:
- **Multi-stage Docker build**: Optimized image size
- **Nginx reverse proxy**: SSL termination and rate limiting
- **Automated backups**: Daily PostgreSQL backups
- **Health checks**: Container health monitoring
- **Resource limits**: CPU and memory constraints

### Production Deployment

```bash
# Build production images
make build

# Start production environment
make prod

# With Nginx and backups
docker-compose -f docker-compose.prod.yml --profile with-nginx --profile with-backup up -d
```

### Database Management

```bash
# Create backup
make db-backup

# Restore from backup
make db-restore-file FILE=backups/backup_20240101_120000.sql.gz

# Access database
make db-shell
```

## Environment Variables

### Development
Use `.env.docker` as a template. The docker-compose.yml includes default values.

### Production
Copy `.env.prod.example` to `.env` and update:
- Strong passwords for PostgreSQL
- Production API keys
- Correct CORS origins
- SSL certificate paths (if using Nginx)

## Troubleshooting

### Common Issues

1. **Port conflicts**: Change ports in docker-compose.yml if 3000 or 5432 are in use
2. **Database connection**: Ensure PostgreSQL is healthy before app starts
3. **Permissions**: Run `chmod +x docker/entrypoint.sh` if needed
4. **Memory issues**: Increase Docker memory allocation in Docker Desktop

### Logs and Debugging

```bash
# View all logs
docker-compose logs

# Follow specific service
docker-compose logs -f app
docker-compose logs -f postgres

# Check container status
docker-compose ps
```

## License

MIT# magnolia-v2
