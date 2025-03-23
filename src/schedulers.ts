import axios, { AxiosResponse } from 'axios';
import { SyncChannelAnalyticsScheduler } from './schedulers/SyncChannelAnalyticsScheduler.js';

const MAX_RETRIES = 300;
const RETRY_DELAY_MS = 2_000; // 2 seconds delay between retries

// Instantiate and start the scheduler
const analyticsScheduler = new SyncChannelAnalyticsScheduler();

analyticsScheduler.on('syncSuccess', async (): Promise<void> => {
  console.log('syncSuccess');

  try {
    const success = await dispatchTaskWithRetry();

    if (success) {
      console.log('Dispatch succeeded. Stopping scheduler.');
      stopScheduler(0); // Clean exit
    } else {
      console.error('Dispatch failed after retries. Stopping scheduler.');
      stopScheduler(1); // Error exit
    }

  } catch (error) {
    console.error('Unexpected error occurred:', (error as Error).message);
    stopScheduler(1);
  }
});

analyticsScheduler.start();

// Graceful shutdown on CTRL+C
process.on('SIGINT', () => {
  console.log('Gracefully shutting down scheduler...');
  stopScheduler(0);
});

/**
 * Dispatch task with retry logic.
 * @returns Promise<boolean> true if successful, false otherwise.
 */
async function dispatchTaskWithRetry(): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await dispatchTask();

    if (result === 'success') {
      return true; // Success, no further retries
    }

    if (attempt < MAX_RETRIES) {
      console.log(`Retrying (${attempt}/${MAX_RETRIES}) in ${RETRY_DELAY_MS / 1000} seconds...`);
      await delay(RETRY_DELAY_MS);
    }
  }

  console.error('Max retries reached.');
  return false;
}

/**
 * Send the POST request and evaluate the response.
 * @returns Promise<'success' | 'retry'>
 */
async function dispatchTask(): Promise<'success' | 'retry'> {
  const response: AxiosResponse = await axios.post(
    'https://http-harbor-eidos-production-80.schnworks.com/task/dispatch?accountId=1', {},
    {
      validateStatus: function (status) {
        return status === 200 || status === 404; // Accept only 200 and 404
      }
    }
  );

  const errorField = response.data?.error;

  console.log('Received response:', errorField);

  // ✅ SUCCESS CASES:
  // - errorField is NOT a string (treat as success)
  // - errorField is an empty string (treat as success)
  if (typeof errorField !== 'string') {
    console.log('Error field is not a string. Considering it a success.');
    return 'success';
  }

  if (errorField === '') {
    console.log('Task dispatched successfully (empty error string).');
    return 'success';
  }

  // 🔁 RETRY CASE:
  console.warn('Task dispatch returned an error string:', errorField);
  return 'retry';
}

/**
 * Stop the scheduler and exit the process.
 * @param exitCode number - 0 for success, 1 for error
 */
function stopScheduler(exitCode: number = 0): void {
  console.log('Stopping scheduler...');
  analyticsScheduler.stop();
  process.exit(exitCode);
}

/**
 * Helper to pause execution.
 * @param ms number
 * @returns Promise<void>
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
