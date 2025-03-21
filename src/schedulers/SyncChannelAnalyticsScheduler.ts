import cron, { ScheduledTask } from 'node-cron';
import { YoutubeStudio } from 'ystudio-analytics-agent/dist/YoutubeStudio.js';
import { PublisherService } from '../utils/PublisherService.js';

export class SyncChannelAnalyticsScheduler {
  private task: ScheduledTask | null = null;
  private studio: YoutubeStudio | null = null;
  private publisher: PublisherService;

  constructor(private scheduleTime: string = '0 2 * * *') {
    // Default schedule: every day at 2 AM
    this.publisher = new PublisherService('sync-channel-analytics');
  }

  /**
   * Starts the scheduled task and initializes YoutubeStudio
   */
  public async start(): Promise<void> {
    if (this.task) {
      console.log('Scheduler already running.');
      return;
    }

    // Initialize YoutubeStudio and start it
    this.studio = new YoutubeStudio(true);
    await this.studio.start();
    console.log('YoutubeStudio instance started.');

    // Immediately run the first sync
    console.log('Running initial sync immediately.');
    await this.syncAnalytics();

    // Schedule future syncs
    this.task = cron.schedule(this.scheduleTime, async () => {
      console.log(`[${new Date().toISOString()}] Scheduled sync triggered.`);
      await this.syncAnalytics();
    });

    console.log(`Sync Channel Analytics Scheduler started. Next scheduled run at ${this.scheduleTime}.`);
  }

  /**
   * Stops the scheduled task and closes YoutubeStudio
   */
  public async stop(): Promise<void> {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('Sync Channel Analytics Scheduler stopped.');
    }

    if (this.studio) {
      await this.studio.close();
      this.studio = null;
      console.log('YoutubeStudio instance closed.');
    }
  }

  /**
   * Syncs the channel analytics
   */
  private async syncAnalytics(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Syncing channel analytics...`);

    if (!this.studio) {
      console.error('YoutubeStudio is not initialized.');
      return;
    }

    try {
      const impressions = await this.studio.fetchAndSaveImpressionsByContentPage();
      console.log(`[${new Date().toISOString()}] Fetched ${impressions.length} impressions.`);

      await this.publisher.publish({
        timestamp: new Date().toISOString(),
        status: 'success',
        impressions: impressions.slice(0, 1),
        accountId: 1,
      });

      console.log(`[${new Date().toISOString()}] Sync completed successfully.`);
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Sync failed:`, error.message);

      await this.publisher.publish({
        timestamp: new Date().toISOString(),
        status: 'failure',
        error: error.message
      });
    }
  }
}
