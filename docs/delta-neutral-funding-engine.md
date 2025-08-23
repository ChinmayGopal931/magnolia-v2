# Delta Neutral Funding Rate Engine

This document describes the **active rebalancing** delta-neutral funding rate engine for Magnolia V2. This system doesn't just close unfavorable positions - it **flips** them to the profitable side, keeping your delta-neutral portfolio "in the water" at all times.

## Overview

The Delta Neutral Funding Engine is an automated system that:

1. **Monitors funding rates** across Hyperliquid and Drift
2. **Identifies unfavorable positions** that are paying funding instead of receiving it
3. **Actively rebalances** by closing the unfavorable leg and immediately opening the opposite side
4. **Maximizes funding rate profits** by always being on the receiving end

## Core Strategy: Active Rebalancing

### Traditional Approach (What We DON'T Do)
- Monitor funding rates
- Close positions when rates become unfavorable
- Wait for rates to improve before re-entering

### Our Approach: Delta Neutral Flipping
- Monitor funding rates continuously  
- **When long position has positive funding rate → FLIP to short**
- **When short position has negative funding rate → FLIP to long**
- Keep positions active at all times to capture funding opportunities

## How It Works

### 1. Funding Rate Analysis

**Positive Funding Rate** (FR > 0):
- Longs pay shorts
- If we're long → **FLIP TO SHORT** to receive funding
- If we're short → stay short (already profitable)

**Negative Funding Rate** (FR < 0):  
- Shorts pay longs
- If we're short → **FLIP TO LONG** to receive funding
- If we're long → stay long (already profitable)

### 2. Execution Flow

For each unfavorable position leg:

1. **Close** the current unfavorable position
2. **Immediately open** the opposite side (same size, same asset)
3. **Update database** to reflect the new position state
4. **Continue monitoring** for the next flip opportunity

## Components

### DeltaNeutralFundingService (`/src/services/delta-neutral-engine.ts`)

The core engine that:
- **Fetches funding rates** from DEX APIs
- **Analyzes positions** with `fundingOptimizationEnabled = true`
- **Determines rebalancing actions** (what to close, what to open)
- **Executes atomic flips** using existing DEX services
- **Updates position snapshots** in the database

Key methods:
- `runFundingEngine()` - Main execution method
- `checkPositionsForRebalancing()` - Identifies positions needing flips
- `rebalanceUnfavorablePositions()` - Executes the flips
- `determineRebalanceAction()` - Decides if/how to flip a position

### DeltaNeutralFundingJob (`/src/jobs/funding-optimization-job.ts`)

Scheduled job that:
- Runs every hour when funding rates update
- Wraps the funding engine with error handling
- Provides detailed execution logging
- Can be triggered manually via API

### Database Integration

Uses existing schema with enhanced methods:
- `getOpenPositionsWithFundingOptimization()` - Find positions to monitor  
- `deletePositionSnapshot()` - Remove old position leg
- `createPositionSnapshot()` - Add new flipped position leg

## Configuration

### Enable for Positions

To enable delta-neutral rebalancing for a position:

```sql
UPDATE positions 
SET funding_optimization_enabled = true,
    position_type = 'delta_neutral'
WHERE id = <position_id>;
```

### Minimum Profitable Rate

The engine only triggers rebalancing when the funding rate exceeds the minimum threshold:

```typescript
// 0.01% per hour minimum to cover transaction costs
private static readonly MIN_PROFITABLE_RATE = 0.0001;
```

## API Endpoints

### Manual Trigger
```bash
POST /api/jobs/funding-optimization
Authorization: Bearer <token>
```

### Check Status
```bash  
GET /api/jobs/status
Authorization: Bearer <token>
```

## Funding Rate Sources

### Hyperliquid API
```javascript
const response = await fetch('https://api.hyperliquid.xyz/info', {
  method: 'POST',
  body: JSON.stringify({
    type: 'fundingHistory',
    coin: 'BTC',
    startTime: Date.now() - 3600000
  })
});
```

### Drift Protocol
Currently uses placeholder - requires Drift SDK implementation for live funding rates.

## Risk Management

### Execution Safeguards
1. **Atomic Operations**: Each flip is a two-step atomic operation
2. **Error Isolation**: One failed flip doesn't affect others  
3. **Size Preservation**: New leg uses exact same size as closed leg
4. **Market Orders**: Uses immediate-or-cancel orders for speed
5. **Database Consistency**: Updates are transactional

### Cost Considerations
- **Transaction Fees**: Each flip incurs 2x transaction costs (close + open)
- **Slippage**: Market orders may have price impact
- **Minimum Threshold**: Only flips when funding rate > 0.01% to ensure profitability

## Position States

### Before Rebalancing
```
Position ID: 123
├── Hyperliquid: BTC-PERP LONG 1.0 BTC (paying 0.05% funding)
└── Drift: BTC-PERP SHORT 1.0 BTC (receiving 0.03% funding)
Net Funding: -0.02% (paying overall)
```

### After Rebalancing  
```
Position ID: 123
├── Hyperliquid: BTC-PERP SHORT 1.0 BTC (receiving 0.05% funding)  
└── Drift: BTC-PERP SHORT 1.0 BTC (receiving 0.03% funding)
Net Funding: +0.08% (receiving overall)
```

## Monitoring and Logging

### Key Metrics Tracked
- Positions checked per cycle
- Rebalancing actions triggered  
- Successful vs failed flips
- Funding rates captured
- Transaction costs incurred

### Log Examples
```
[INFO] Delta neutral funding engine starting
[INFO] Found 5 positions to check for funding rebalancing  
[INFO] Position 123 flagged for rebalancing: BTC-PERP long->short (FR: 0.0234%)
[INFO] Successfully rebalanced position 123: flipped BTC-PERP long to short
[INFO] Delta neutral funding engine completed: 2 positions rebalanced
```

## Performance Optimizations

### Batch Operations
- Groups funding rate API calls by DEX
- Processes multiple positions concurrently
- Uses database transactions for consistency

### Intelligent Scheduling  
- Runs hourly aligned with funding rate updates
- Skips execution if no positions need rebalancing
- Graceful error handling prevents service disruption

## Future Enhancements

1. **Cross-DEX Arbitrage**: Compare funding rates across DEXes
2. **Dynamic Thresholds**: Adjust minimum rates based on volatility
3. **Position Sizing**: Optimize sizes based on funding differentials  
4. **Slippage Protection**: Add limit orders with fallbacks
5. **Profit Tracking**: Calculate actual funding P&L over time
6. **Notification System**: Alert users when positions are rebalanced

## Troubleshooting

### Common Issues

**Position Not Rebalancing**
- Check `fundingOptimizationEnabled = true`
- Verify funding rate exceeds minimum threshold
- Ensure position has required metadata (asset IDs, market indices)

**Rebalancing Failures**
- Check DEX account balances and permissions
- Verify API connectivity to funding rate sources
- Review position metadata for missing required fields

**Database Inconsistencies**  
- Monitor position snapshot updates
- Check for failed transactions in logs
- Verify old snapshots are properly deleted

### Debug Commands

```bash
# Check positions eligible for rebalancing
SELECT * FROM positions 
WHERE status = 'open' 
AND funding_optimization_enabled = true;

# View recent position snapshots
SELECT * FROM position_snapshots 
WHERE position_id = <id> 
ORDER BY snapshot_at DESC;

# Monitor job execution logs
grep "Delta neutral funding engine" /var/log/magnolia.log
```

This engine ensures your delta-neutral positions are **always profitable** by actively flipping to capture favorable funding rates, maximizing returns while maintaining market-neutral exposure.