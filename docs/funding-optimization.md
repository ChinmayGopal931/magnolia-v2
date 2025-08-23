# Delta Neutral Funding Rate Optimization

This document describes the automated funding rate optimization system for delta-neutral positions in Magnolia V2.

## Overview

The funding optimization system automatically monitors open positions and closes them when funding rates become unfavorable, ensuring maximum profitability from funding rate arbitrage strategies.

## How It Works

### Delta Neutral Strategy

A delta-neutral strategy maintains a portfolio that is insensitive to small price movements in the underlying asset. In cryptocurrency perpetual futures, this is achieved by:

1. Taking offsetting long and short positions in the same asset
2. Capturing funding rate payments regardless of price direction
3. Automatically rebalancing when funding rates change

### Funding Rate Logic

The system follows this logic for position management:

- **Positive Funding Rate** (longs pay shorts): Close long positions to avoid paying funding
- **Negative Funding Rate** (shorts pay longs): Close short positions to avoid paying funding

This ensures the portfolio always receives funding payments instead of paying them.

## Components

### 1. FundingMonitorService (`/src/services/funding-monitor.ts`)

Core service that:
- Fetches funding rates from Hyperliquid and Drift APIs
- Analyzes positions with `fundingOptimizationEnabled = true`
- Determines which positions should be closed
- Executes position closures using existing DEX services

### 2. FundingOptimizationJob (`/src/jobs/funding-optimization-job.ts`)

Cron job that:
- Wraps the funding monitor service
- Provides error handling and logging
- Can be executed manually or automatically

### 3. JobScheduler (`/src/jobs/scheduler.ts`)

Scheduler that:
- Runs funding optimization every hour (when funding rates update)
- Manages multiple job types
- Handles graceful shutdown

### 4. API Endpoints (`/src/routes/jobs/`)

REST endpoints for:
- `POST /api/jobs/funding-optimization` - Manually trigger optimization
- `GET /api/jobs/status` - Check scheduler status

## Database Schema

### Positions Table

The `positions` table includes:
```sql
fundingOptimizationEnabled BOOLEAN DEFAULT FALSE NOT NULL
```

### Position Snapshots

The `positionSnapshots` table stores position legs with:
- DEX type (hyperliquid, drift, lighter)
- Symbol and side (long/short/spot)
- Entry prices and sizes
- Metadata (asset IDs, market indices)

## Configuration

### Environment Variables

No additional environment variables are required. The system uses existing DEX configurations.

### Enable Funding Optimization

To enable funding optimization for a position:

```sql
UPDATE positions 
SET funding_optimization_enabled = true 
WHERE id = <position_id>;
```

## API Usage

### Check Job Status

```bash
GET /api/jobs/status
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": {
    "scheduler": {
      "isRunning": true,
      "activeJobs": ["funding-optimization"]
    },
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

### Manual Trigger

```bash
POST /api/jobs/funding-optimization
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": {
    "message": "Funding optimization job completed successfully",
    "executionTime": "1250ms",
    "triggeredBy": 123,
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

## Funding Rate APIs

### Hyperliquid

```javascript
// Get funding rate history
const response = await fetch('https://api.hyperliquid.xyz/info', {
  method: 'POST',
  body: JSON.stringify({
    type: 'fundingHistory',
    coin: 'BTC',
    startTime: Date.now() - 3600000 // Last hour
  })
});
```

### Drift Protocol

Drift funding rates are accessed through the Drift SDK. Implementation requires:
- DriftClient initialization
- Market data subscription
- Funding rate extraction from market state

## Monitoring and Alerts

The system logs all activities with structured logging:

- Position analysis and decisions
- Funding rate retrievals
- Position closures (successful and failed)
- Job execution timing and results

## Risk Management

### Safeguards

1. **Position Validation**: Only processes positions with `fundingOptimizationEnabled = true`
2. **User Authorization**: Verifies position ownership before closure
3. **Error Handling**: Continues processing other positions if one fails
4. **Logging**: Comprehensive audit trail of all actions

### Limitations

1. **API Dependency**: Relies on external DEX APIs for funding rates
2. **Execution Risk**: Market conditions may change between analysis and execution
3. **Partial Closures**: If some position legs fail to close, position remains open

## Performance Considerations

- **Batch API Calls**: Groups funding rate requests by DEX
- **Efficient Queries**: Uses database indexes for position lookup
- **Async Processing**: Handles multiple positions concurrently
- **Error Isolation**: One position failure doesn't affect others

## Development and Testing

### Manual Testing

```bash
# Run the job directly
npm run dev
# Then in another terminal:
curl -X POST http://localhost:3000/api/jobs/funding-optimization \
  -H "Authorization: Bearer <token>"
```

### Unit Testing

Test individual components:
- FundingMonitorService methods
- Database queries
- API integrations

### Integration Testing

Test the complete flow:
- Position creation with funding optimization enabled
- Funding rate changes
- Automated position closure

## Future Enhancements

1. **Configurable Thresholds**: Allow users to set funding rate thresholds
2. **Notification System**: Alert users when positions are closed
3. **Advanced Strategies**: Support for more complex delta-neutral strategies
4. **Performance Metrics**: Track profitability and success rates
5. **Cross-DEX Arbitrage**: Optimize funding across different exchanges

## Troubleshooting

### Common Issues

1. **Missing Asset IDs**: Ensure position metadata includes required DEX-specific identifiers
2. **API Failures**: Check DEX API availability and rate limits
3. **Position Closure Failures**: Verify account permissions and balances
4. **Database Locks**: Monitor for long-running queries during high load

### Logs to Monitor

- Job execution logs: `Starting/completing funding optimization job`
- Position analysis: `Position X flagged for closure`
- API errors: `Failed to get funding rate for X`
- Closure results: `Successfully closed position X due to unfavorable funding`