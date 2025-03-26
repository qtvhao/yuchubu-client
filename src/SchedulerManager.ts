import { Profiler } from './Profiler.js';
import { SyncChannelAnalyticsScheduler } from './schedulers/SyncChannelAnalyticsScheduler.js';
import { TaskDispatcher } from './TaskDispatcher.js';

// === Scheduler Setup ===

export class SchedulerManager {
  private scheduler: SyncChannelAnalyticsScheduler;
  private dispatcher: TaskDispatcher;

  constructor() {
    this.scheduler = new SyncChannelAnalyticsScheduler();
    this.dispatcher = new TaskDispatcher();
    this.scheduler.on('syncSuccess', this.handleSyncSuccess.bind(this));
    process.on('SIGINT', this.handleShutdown.bind(this));
  }

  start(): void {
    this.scheduler.start();
  }

  private async handleSyncSuccess(): Promise<void> {
    console.log('syncSuccess');
    const totalProfiler = new Profiler('Total dispatch process');

    try {
      const success = await this.dispatcher.dispatchTaskWithRetry();

      totalProfiler.end();
      // ✅ Finished: Total dispatch process — 127.43s
      // ✅ Finished: Total dispatch process — 178.87s
      // ✅ Finished: Total dispatch process — 154.48s

      if (success) {
        console.log('Dispatch succeeded. Stopping scheduler.');
        this.stopScheduler(0);
      } else {
        console.error('Dispatch failed after retries. Stopping scheduler.');
        this.stopScheduler(1);
      }

    } catch (error) {
      console.error('Unexpected error occurred:', (error as Error).message);
      this.stopScheduler(1);
    }
  }

  private handleShutdown(): void {
    console.log('Gracefully shutting down scheduler...');
    this.stopScheduler(0);
  }

  private stopScheduler(exitCode: number = 0): void {
    console.log('Stopping scheduler...');
    this.scheduler.stop();
    process.exit(exitCode);
  }
}
