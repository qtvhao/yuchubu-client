import cron, { ScheduledTask } from 'node-cron';
import { YoutubeStudio } from 'ystudio-analytics-agent/dist/YoutubeStudio.js';
import { PublisherService } from '../utils/PublisherService.js';
import { PuppeteerConnect } from 'puppeteerconnect.ts/dist/PuppeteerConnect.js'
import dotenv from 'dotenv'
import fs from 'fs';
import path from 'path';

dotenv.config()

type EventCallback = (data?: any) => void;

const ACCOUNT_ID = Number(process.env.ACCOUNT_ID);
if (isNaN(ACCOUNT_ID)) {
  throw new Error('ACCOUNT_ID environment variable must be a valid number');
}

export class SyncChannelAnalyticsScheduler {
  private task: ScheduledTask | null = null;
  private studio: YoutubeStudio | null = null;
  private publisher: PublisherService;
  private callbacks: Record<string, EventCallback[]> = {};

  constructor(private scheduleTime: string = '0 2 * * *') {
    // Default schedule: every day at 2 AM
    this.publisher = new PublisherService('sync-channel-analytics');
  }

  /**
   * Register an event callback
   */
  public on(event: 'start' | 'stop' | 'syncStart' | 'syncSuccess' | 'syncFailure', callback: EventCallback): void {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
  }

  /**
   * Emit an event with optional data
   */
  private emit(event: string, data?: any): void {
    const eventCallbacks = this.callbacks[event];
    if (eventCallbacks && eventCallbacks.length > 0) {
      eventCallbacks.forEach(cb => cb(data));
    }
  }

  /**
   * Validate if the studio is initialized
   */
  private validateStudioInitialized(): boolean {
    if (!this.studio) {
      console.error('YoutubeStudio is not initialized.');
      this.emit('syncFailure', { message: 'YoutubeStudio is not initialized.' });
      return false;
    }
    return true;
  }

  /**
   * Fetch analytics data from the studio
   */
  private async fetchAnalyticsData() {
    const watchTime = await this.studio!.fetchAndSaveWatchTimeByContentPage();
    const subscribers = await this.studio!.fetchAndSaveSubscribersByContentPage();
    const impressions = await this.studio!.fetchAndSaveImpressionsByContentPage();

    return {
      watchTime: watchTime.slice(0, 2),
      subscribers: subscribers.slice(0, 2),
      impressions: impressions.slice(0, 2),
    };
  }

  /**
   * Read additional impressions from file
   */
  private readAdditionalImpressions(): any[] {
    const filePath = path.resolve('added-impressions.txt');
    if (!fs.existsSync(filePath)) return [];

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content.split('\n').map(l => l.trim()).filter(Boolean).map(t => {
        return {
          alt: t,
          src: '',
        }
      });
    } catch (err) {
      console.error('Failed to read added-impressions.txt:', (err as Error).message);
      return [];
    }
  }

  /**
   * Publish sync results
   */
  private async publishSyncResult(impressions: any[], status: 'success' | 'failure', error?: string) {
    if (!impressions || impressions.length === 0) {
      throw new Error('Cannot publish sync result: impressions must not be empty.');
    }
    await this.publisher.publish({
      timestamp: new Date().toISOString(),
      status,
      impressions: status === 'success' ? impressions : undefined,
      error,
      accountId: ACCOUNT_ID,
    });
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

    this.emit('stop');
  }

  /**
   * Syncs the channel analytics
   */
  private async syncAnalytics(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Syncing channel analytics...`);
    this.emit('syncStart');

    if (!this.validateStudioInitialized()) return;

    try {
      const { watchTime, subscribers, impressions } = await this.fetchAnalyticsData();
      const added = this.readAdditionalImpressions();

      const allImpressions = [...watchTime, ...subscribers, ...impressions, ...added]
        .sort(() => Math.random() - 0.5);

      await this.publishSyncResult(allImpressions, 'success');

      console.log(`[${new Date().toISOString()}] Sync completed successfully.`);
      this.emit('syncSuccess', { impressions: allImpressions });
      await PuppeteerConnect.killAllChromeProcesses();

    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Sync failed:`, error.message);
      await this.publishSyncResult([], 'failure', error.message);
      this.emit('syncFailure', { message: error.message });
    }
  }
}
