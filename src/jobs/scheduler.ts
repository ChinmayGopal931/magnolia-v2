import { logger } from '@/utils/logger';
import { runFundingOptimizationJob } from './funding-optimization-job';

/**
 * Simple Job Scheduler
 * 
 * Manages the execution of periodic jobs for the application.
 * Currently supports the funding rate optimization job.
 */

export class JobScheduler {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  /**
   * Start the job scheduler
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Job scheduler is already running');
      return;
    }

    logger.info('Starting job scheduler');

    // Schedule delta neutral funding engine to run every hour
    // Funding rates are typically updated hourly on most DEXes
    this.scheduleJob('delta-neutral-funding', this.runDeltaNeutralFunding.bind(this), 60 * 60 * 1000); // 1 hour

    // You can add more jobs here as needed
    // this.scheduleJob('position-sync', this.runPositionSync.bind(this), 5 * 60 * 1000); // 5 minutes

    this.isRunning = true;
    logger.info('Job scheduler started successfully');
  }

  /**
   * Stop the job scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Job scheduler is not running');
      return;
    }

    logger.info('Stopping job scheduler');

    // Clear all intervals
    for (const [jobName, interval] of this.intervals) {
      clearInterval(interval);
      logger.info(`Stopped job: ${jobName}`);
    }

    this.intervals.clear();
    this.isRunning = false;
    logger.info('Job scheduler stopped successfully');
  }

  /**
   * Schedule a job to run at specified intervals
   */
  private scheduleJob(jobName: string, jobFunction: () => Promise<void>, intervalMs: number): void {
    logger.info(`Scheduling job: ${jobName}`, { intervalMs: `${intervalMs}ms` });

    // Run immediately
    this.safeExecuteJob(jobName, jobFunction);

    // Schedule to run at intervals
    const interval = setInterval(() => {
      this.safeExecuteJob(jobName, jobFunction);
    }, intervalMs);

    this.intervals.set(jobName, interval);
  }

  /**
   * Safely execute a job with error handling
   */
  private async safeExecuteJob(jobName: string, jobFunction: () => Promise<void>): Promise<void> {
    try {
      logger.info(`Executing job: ${jobName}`);
      await jobFunction();
    } catch (error) {
      logger.error(`Job failed: ${jobName}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Don't re-throw - we want the scheduler to continue running other jobs
    }
  }

  /**
   * Delta neutral funding engine runner
   */
  private async runDeltaNeutralFunding(): Promise<void> {
    await runFundingOptimizationJob();
  }

  /**
   * Get scheduler status
   */
  getStatus(): { 
    isRunning: boolean; 
    activeJobs: string[]; 
    uptime?: number;
  } {
    return {
      isRunning: this.isRunning,
      activeJobs: Array.from(this.intervals.keys()),
    };
  }
}

// Singleton instance
let schedulerInstance: JobScheduler | null = null;

/**
 * Get the singleton scheduler instance
 */
export function getScheduler(): JobScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new JobScheduler();
  }
  return schedulerInstance;
}

/**
 * Initialize and start the job scheduler
 */
export function initializeScheduler(): JobScheduler {
  const scheduler = getScheduler();
  scheduler.start();
  return scheduler;
}

/**
 * Handle graceful shutdown
 */
export function setupGracefulShutdown(): void {
  const cleanup = () => {
    logger.info('Received shutdown signal, stopping job scheduler...');
    if (schedulerInstance) {
      schedulerInstance.stop();
    }
    process.exit(0);
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGQUIT', cleanup);
}