import { SyncChannelAnalyticsScheduler } from "./schedulers/SyncChannelAnalyticsScheduler.js";

// Instantiate and start the scheduler
const analyticsScheduler = new SyncChannelAnalyticsScheduler();
analyticsScheduler.on('syncSuccess', async () => {
  console.log('syncSuccess')
})
analyticsScheduler.start();

// Optional: handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Gracefully shutting down scheduler...');
  analyticsScheduler.stop();
  process.exit();
});
