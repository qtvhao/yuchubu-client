import { Profiler } from './Profiler.js';
import { SyncChannelAnalyticsScheduler } from './schedulers/SyncChannelAnalyticsScheduler.js';
import { TaskDispatcher } from './TaskDispatcher.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

// === Scheduler Setup ===

export class SchedulerManager {
  private analyticsSyncScheduler: SyncChannelAnalyticsScheduler;
  private taskDispatcher: TaskDispatcher;

  constructor() {
    this.analyticsSyncScheduler = new SyncChannelAnalyticsScheduler();
    this.taskDispatcher = new TaskDispatcher();
    this.analyticsSyncScheduler.on('syncSuccess', this.handleSyncSuccess.bind(this));
    process.on('SIGINT', this.handleShutdownSignal.bind(this));
  }

  start(): void {
    this.analyticsSyncScheduler.start();
  }

  private async handleSyncSuccess(): Promise<void> {
    const totalProfiler = this.startTotalDispatchProfiler();

    try {
      const taskId = await this.taskDispatcher.dispatchTaskWithRetry();
      totalProfiler.end();

      if (taskId) {
        await this.handleDispatchSuccess(taskId);
      } else {
        this.handleDispatchFailure(null);
      }

    } catch (error) {
      totalProfiler.end();
      this.handleDispatchFailure(error as Error);
    }
  }

  private startTotalDispatchProfiler(): Profiler {
    console.log('syncSuccess');
    return new Profiler('Total dispatch process');
  }

  private async handleDispatchSuccess(taskId: string): Promise<void> {
    console.log('Dispatch succeeded.');
    await this.taskDispatcher.pollTaskStatusUntilSuccess(taskId, true);
    const [downloadBuffer] = await this.taskDispatcher.downloadTaskResults(taskId);
    
    const outputPath = join(process.cwd(), `task-${taskId}.mp4`);
    writeFileSync(outputPath, downloadBuffer);
    console.log(`Downloaded buffer saved to ${outputPath}`);

    this.shutdownScheduler(0);
  }

  private handleDispatchFailure(error: Error | null): void {
    if (error) {
      console.error('Unexpected error occurred:', error.message);
    } else {
      console.error('Dispatch failed after retries. Stopping scheduler.');
    }
    this.shutdownScheduler(1);
  }

  private handleShutdownSignal(): void {
    console.log('Gracefully shutting down scheduler...');
    this.shutdownScheduler(0);
  }

  private shutdownScheduler(exitCode: number = 0): void {
    console.log('Stopping scheduler...');
    this.analyticsSyncScheduler.stop();
    process.exit(exitCode);
  }
}
