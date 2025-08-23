import { DeltaNeutralFundingService } from '@/services/delta-neutral-engine';
import { logger } from '@/utils/logger';

/**
 * Delta Neutral Funding Rate Engine Job
 * 
 * This job runs periodically to monitor positions with funding optimization enabled
 * and automatically REBALANCES positions when funding rates become unfavorable.
 * 
 * Delta Neutral Rebalancing Strategy:
 * - When funding rate is positive (longs pay shorts) and position is long -> FLIP to short
 * - When funding rate is negative (shorts pay longs) and position is short -> FLIP to long
 * 
 * This ensures the portfolio always receives funding payments by actively flipping
 * to the profitable side, keeping positions "in the water" at all times.
 */

export class DeltaNeutralFundingJob {
  private deltaEngine: DeltaNeutralFundingService;

  constructor() {
    this.deltaEngine = new DeltaNeutralFundingService();
  }

  /**
   * Execute the delta neutral funding engine
   */
  async execute(): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting delta neutral funding engine');

      const result = await this.deltaEngine.runFundingEngine();

      const executionTime = Date.now() - startTime;

      logger.info('Delta neutral funding engine completed successfully', {
        executionTime: `${executionTime}ms`,
        checkedPositions: result.checkedPositions,
        positionsToRebalance: result.positionsToRebalance,
        successfullyRebalanced: result.successfullyRebalanced,
      });

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error('Delta neutral funding engine failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        executionTime: `${executionTime}ms`,
      });

      // Re-throw the error if you want the job scheduler to be aware of the failure
      throw error;
    }
  }

  /**
   * Validate job prerequisites before execution
   */
  async validatePrerequisites(): Promise<boolean> {
    try {
      // Check if database connection is available
      // Check if external APIs are reachable
      // Any other validation logic

      return true;
    } catch (error) {
      logger.error('Delta neutral funding engine prerequisites check failed', { error });
      return false;
    }
  }
}

// Export both old and new names for backward compatibility
export const FundingOptimizationJob = DeltaNeutralFundingJob;

/**
 * Main function to run the job (useful for testing or manual execution)
 */
export async function runFundingOptimizationJob(): Promise<void> {
  const job = new DeltaNeutralFundingJob();
  
  const isValid = await job.validatePrerequisites();
  if (!isValid) {
    throw new Error('Job prerequisites validation failed');
  }

  await job.execute();
}

export const runDeltaNeutralFundingJob = runFundingOptimizationJob;

// If this script is run directly (for testing purposes)
if (require.main === module) {
  runDeltaNeutralFundingJob()
    .then(() => {
      logger.info('Manual delta neutral funding engine execution completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Manual delta neutral funding engine execution failed', { error });
      process.exit(1);
    });
}