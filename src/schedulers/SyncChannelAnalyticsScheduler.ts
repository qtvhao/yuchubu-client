import cron, { ScheduledTask } from 'node-cron';
import { YoutubeStudio } from 'ystudio-analytics-agent/dist/YoutubeStudio.js';
import { PublisherService } from '../utils/PublisherService.js';
import { PuppeteerConnect } from 'puppeteerconnect.ts/dist/PuppeteerConnect.js'
import dotenv from 'dotenv'
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

dotenv.config()

type SyncSchedulerEvent = 'start' | 'stop' | 'syncStart' | 'syncSuccess' | 'syncFailure';

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
  private eventEmitter: EventEmitter;

  constructor(private scheduleTime: string = '0 2 * * *') {
    // Default schedule: every day at 2 AM
    this.publisher = new PublisherService('sync-channel-analytics');
    this.eventEmitter = new EventEmitter();
  }


  public on(event: SyncSchedulerEvent, callback: EventCallback): void {
    this.eventEmitter.on(event, callback);
  }

  public once(event: SyncSchedulerEvent, callback: EventCallback): void {
    this.eventEmitter.once(event, callback);
  }

  private emit(event: string, data?: any): void {
    this.eventEmitter.emit(event, data);
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

  private async gatherImpressions(): Promise<Map<string, any>> {
    const { watchTime, subscribers, impressions } = await this.fetchAnalyticsData();
    const added = this.readAdditionalImpressions();

    const mergedImpressions = [...watchTime, ...subscribers, ...impressions, ...added];
    const uniqueImpressionsMap = new Map<string, any>();
    for (const item of mergedImpressions) {
      if (item && item.alt) {
        uniqueImpressionsMap.set(item.alt, item);
      }
    }

    return uniqueImpressionsMap;
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
      impressions: status === 'success' ? impressions.slice(0, 1) : undefined,
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
      const uniqueImpressionsMap = await this.gatherImpressions();
      const allImpressions = this.prepareFinalImpressions(uniqueImpressionsMap);

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

  private prepareFinalImpressions(impressionMap: Map<string, any>): any[] {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const formattedYesterday = yesterday.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return Array.from(impressionMap.values())
      .map(item => ({
        ...item,
        alt: typeof item.alt === 'string' ? item.alt.replace(/&lt;yesterday&gt;|<yesterday>/g, formattedYesterday) : item.alt,
      }))
      .sort(() => Math.random() - 0.5);
  }
}
