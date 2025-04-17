import { SyncChannelAnalyticsScheduler } from './schedulers/SyncChannelAnalyticsScheduler.js';
import { DispatchVideoTaskScheduler } from './schedulers/DispatchVideoTaskScheduler.js';

export class SchedulerManager {
  private analyticsSyncScheduler: SyncChannelAnalyticsScheduler;
  private dispatchVideoTaskScheduler: DispatchVideoTaskScheduler;

  constructor() {
    this.analyticsSyncScheduler = new SyncChannelAnalyticsScheduler();
    this.dispatchVideoTaskScheduler = new DispatchVideoTaskScheduler();
    process.on('SIGINT', this.handleShutdownSignal.bind(this));
  }

  start(): void {
    this.analyticsSyncScheduler.once('syncSuccess', () => {
      this.dispatchVideoTaskScheduler.start()
    });
    this.analyticsSyncScheduler.start();
  }

  private shutdownScheduler(exitCode: number = 0): void {
    console.log('Stopping scheduler...');
    this.analyticsSyncScheduler.stop();
    process.exit(exitCode);
  }

  private handleShutdownSignal(): void {
    console.log('Gracefully shutting down scheduler...');
    this.shutdownScheduler(0);
  }
}
