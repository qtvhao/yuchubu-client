import axios, { AxiosResponse } from 'axios';
import { Profiler } from './Profiler.js';
import { Utility } from './Utility.js';
import dotenv from 'dotenv'
import { TokensList } from 'marked';
import { TokenUtils } from './TokenUtils.js';

dotenv.config()
const DEFAULT_CURRENT_STEP = "📊 Đang phân tích Channel Analytics"
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
      const result = await this.dispatchTask();

      if (!isDispatchErrorResponse(result)) {
        return result.taskId;
      }

      if (attempt < Config.MAX_RETRIES) {
        console.log(`${DEFAULT_CURRENT_STEP}. Retrying (${attempt}/${Config.MAX_RETRIES}) in ${Config.RETRY_DELAY_MS / 1000} seconds...`);
        await Utility.delay(Config.RETRY_DELAY_MS);
      }
    }

    console.error('Max retries reached.');
    return null;
  }

  private async dispatchTask(): Promise<DispatchSuccessResponse | DispatchErrorResponse> {
    const accountId = ACCOUNT_ID;

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

    return response.data;
  }

  async checkTaskStatus(taskId: string): Promise<'success' | 'retry'> {
    const response: AxiosResponse = await axios.get(
      `${Config.BASE_URL}/tasks/completed/${taskId}`,
      {
        validateStatus: function (status) {
          return status === 200 || status === 404;
        }
      }
    );

    const progressResponse: AxiosResponse = await axios.get(
      `${Config.BASE_URL}/tasks/progress/${taskId}`,
      {
        validateStatus: function (status) {
          return status === 200 || status === 404;
        }
      }
    );
    const currentStep = progressResponse.data?.currentStep
    const progressBar = progressResponse.data?.progressBar
    const percent = progressResponse.data?.progress;
    if (currentStep) {
      console.log("" + currentStep)
    }
    if (progressBar != null) {
      const progressWithPercent = `${progressBar} ${percent}%`;
      // process.stdout.write('\x1b[2K\r'); // Clear the line
      process.stdout.write(progressWithPercent + '\r');
    }

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
    const MAX_POLLING_DURATION_MS = 30 * 60 * 1000;
    const POLL_INTERVAL_MS = 20_000;
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

  async downloadTaskResults(taskId: string): Promise<[Buffer[], string, string]> {
    const response = await axios.get(`${Config.BASE_URL}/tasks/completed/${taskId}`, {
      validateStatus: function (status) {
        return status === 200;
      }
    });

    const tokens: TokensList = response.data?.tokens
    const strongTokens = TokenUtils.findTokensOfType(tokens, 'strong')
      .sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0));
    const longestTitle = (strongTokens[0].text);
    const content = response.data?.content;
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

    return [buffers, content, longestTitle];
  }
}
