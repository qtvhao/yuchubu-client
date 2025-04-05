import axios, { AxiosResponse } from 'axios';
import { Profiler } from './Profiler.js';
import { Utility } from './Utility.js';
import dotenv from 'dotenv'

dotenv.config()
const ACCOUNT_ID = Number(process.env.ACCOUNT_ID);
if (isNaN(ACCOUNT_ID)) {
  throw new Error(`Invalid ACCOUNT_ID environment variable: ${process.env.ACCOUNT_ID}`);
}

interface DispatchSuccessResponse {
  message: string;
  taskId: string;
}

interface DispatchErrorResponse {
  message: string;
  error: string;
  taskId: string;
}

function isDispatchErrorResponse(
  res: DispatchSuccessResponse | DispatchErrorResponse
): res is DispatchErrorResponse {
  return 'error' in res;
}

class Config {
  static readonly MAX_RETRIES = 300;
  static readonly RETRY_DELAY_MS = 2_000; // 2 seconds delay between retries
  static readonly BASE_URL = 'https://http-harbor-eidos-production-80.schnworks.com';
}

// === Task Dispatching Logic ===

export class TaskDispatcher {
  async dispatchTaskWithRetry(): Promise<string | null> {
    for (let attempt = 1; attempt <= Config.MAX_RETRIES; attempt++) {
      const attemptProfiler = new Profiler(`Attempt ${attempt}`);
      const result = await this.dispatchTask();
      attemptProfiler.end();

      if (!isDispatchErrorResponse(result)) {
        return result.taskId;
      }

      if (attempt < Config.MAX_RETRIES) {
        console.log(`Retrying (${attempt}/${Config.MAX_RETRIES}) in ${Config.RETRY_DELAY_MS / 1000} seconds...`);
        await Utility.delay(Config.RETRY_DELAY_MS);
      }
    }

    console.error('Max retries reached.');
    return null;
  }

  private async dispatchTask(): Promise<DispatchSuccessResponse | DispatchErrorResponse> {
    const accountId = ACCOUNT_ID;

    const dispatchProfiler = new Profiler('Dispatch request');
    const response: AxiosResponse<DispatchSuccessResponse | DispatchErrorResponse> = await axios.post(
      `${Config.BASE_URL}/task/dispatch`, {
      accountId
    },
      {
        validateStatus: function (status) {
          return status === 200 || status === 404;
        }
      }
    );
    dispatchProfiler.end();

    return response.data;
  }

  async checkTaskStatus(taskId: string): Promise<'success' | 'retry'> {
    const statusProfiler = new Profiler(`Check status for task ${taskId}`);
    const response: AxiosResponse = await axios.get(
      `${Config.BASE_URL}/tasks/completed/${taskId}`,
      {
        validateStatus: function (status) {
          return status === 200 || status === 404;
        }
      }
    );
    statusProfiler.end();

    const progressResponse: AxiosResponse = await axios.get(
      `${Config.BASE_URL}/tasks/progress/${taskId}`,
      {
        validateStatus: function (status) {
          return status === 200 || status === 404;
        }
      }
    );
    const progressBar = progressResponse.data?.progressBar
    console.log(progressBar)
    console.log('Task status response:', response.data);

    if (response.status === 404) {
      console.warn(`Task ${taskId} not found (404). Retrying...`);
      return 'retry';
    }

    const downloads = response.data?.downloads;
    if (Array.isArray(downloads) && downloads.length > 0) {
      console.log(`Task ${taskId} completed successfully. Downloads:`, downloads);
      return 'success';
    }

    console.warn(`Task ${taskId} status indicates retry needed.`);
    return 'retry';
  }

  async pollTaskStatusUntilSuccess(taskId: string, debug: boolean = false): Promise<'success' | 'timeout'> {
    const MAX_POLLING_DURATION_MS = 15 * 60 * 1000; // 15 minutes
    const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
    const startTime = Date.now();

    if (debug) {
      console.debug(`Starting polling for task ${taskId}`);
    }

    while (Date.now() - startTime < MAX_POLLING_DURATION_MS) {
      const status = await this.checkTaskStatus(taskId);
      if (debug) {
        console.debug(`Polled status: ${status} at ${new Date().toISOString()}`);
      }

      if (status === 'success') {
        if (debug) {
          console.debug(`Polling ended with success for task ${taskId}`);
        }
        return 'success';
      }

      await Utility.delay(POLL_INTERVAL_MS);
    }

    console.warn(`Polling timed out after ${MAX_POLLING_DURATION_MS / 1000} seconds.`);
    if (debug) {
      console.debug(`Polling ended with timeout for task ${taskId}`);
    }
    return 'timeout';
  }

  async downloadTaskResult(taskId: string, downloadIndex: number = 0): Promise<Buffer> {
    const downloadUrl = `${Config.BASE_URL}/tasks/completed/${taskId}/downloads/${downloadIndex}`;
    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      validateStatus: function (status) {
        return status === 200;
      }
    });

    return Buffer.from(response.data);
  }

  async downloadTaskResults(taskId: string): Promise<Buffer[]> {
    const response = await axios.get(`${Config.BASE_URL}/tasks/completed/${taskId}`, {
      validateStatus: function (status) {
        return status === 200;
      }
    });

    const downloads = response.data?.downloads;
    if (!Array.isArray(downloads) || downloads.length === 0) {
      throw new Error(`No downloads found for task ${taskId}`);
    }

    const buffers: Buffer[] = [];

    for (let i = 0; i < downloads.length; i++) {
      const downloadUrl = `${Config.BASE_URL}/tasks/completed/${taskId}/downloads/${i}`;
      const fileResponse = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        validateStatus: function (status) {
          return status === 200;
        }
      });
      buffers.push(Buffer.from(fileResponse.data));
    }

    return buffers;
  }
}
