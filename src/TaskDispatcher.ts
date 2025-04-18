import axios, { AxiosResponse } from 'axios';
import { Profiler } from './Profiler.js';
import { Utility } from './Utility.js';
import dotenv from 'dotenv'
import { TokensList } from 'marked';
import { TokenUtils } from './TokenUtils.js';
import { createLogger, transports, format } from 'winston';

dotenv.config()
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.label({ label: '[TaskDispatcher]' }),
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console(),
  ],
});
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
interface CompletedTask {
  id: string;
  payload: any;
  content: string;
  translated: boolean;
  tokens: TokensList;
  downloads: any[];
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
  private static instance: TaskDispatcher;

  static getInstance(): TaskDispatcher {
    if (!TaskDispatcher.instance) {
      TaskDispatcher.instance = new TaskDispatcher();
    }
    return TaskDispatcher.instance;
  }

  private async logTaskProgress(taskId: string, attempts = 5): Promise<void> {
    const RETRY_DELAY_MS = 30_000;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const progressResponse: AxiosResponse = await axios.get(
          `${Config.BASE_URL}/tasks/progress/${taskId}`,
          {
            validateStatus: function (status) {
              return status === 200 || status === 404 || (status >= 500 && status < 600);
            }
          }
        );

        if (progressResponse.status >= 500 && progressResponse.status < 600) {
          logger.warn(`Attempt ${attempt}/${attempts} - Server error (${progressResponse.status}). Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
          if (attempt < attempts) {
            await Utility.delay(RETRY_DELAY_MS);
            continue;
          }
        } else if (progressResponse.status !== 200 && progressResponse.status !== 404) {
          throw new Error(`Unexpected response status: ${progressResponse.status}`);
        }

        const currentStep = progressResponse.data?.currentStep;
        const progressBar = progressResponse.data?.progressBar;
        const percent = progressResponse.data?.progress;

        if (currentStep) {
          logger.info("" + currentStep);
          if (currentStep.includes("❌")) {
            throw new Error(`Aborting due to failure state in task: ${currentStep}`);
          }
        }
        if (percent && percent > 0) {
          const progressWithPercent = `${progressBar} ${percent}%`;
          logger.info(progressWithPercent);
        }

        return;
      } catch (error) {
        logger.error(`Attempt ${attempt}/${attempts} - Error logging task progress: ${error}`);
        if (attempt < attempts) {
          await Utility.delay(RETRY_DELAY_MS);
        } else {
          throw error;
        }
      }
    }

    throw new Error(`Failed to log task progress after ${attempts} attempts.`);
  }

  private async getTaskCompletionStatus(taskId: string): Promise<AxiosResponse> {
    const MAX_ATTEMPTS = 5;
    const RETRY_DELAY_MS = 30_000; // 30 seconds

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await axios.get(
          `${Config.BASE_URL}/tasks/completed/${taskId}`,
          {
            validateStatus: function (status) {
              return status === 200 || status === 404 || (status >= 500 && status < 600);
            }
          }
        );

        if (response.status >= 500 && response.status < 600) {
          logger.warn(`Attempt ${attempt}/${MAX_ATTEMPTS} - Server error (${response.status}). Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
          if (attempt < MAX_ATTEMPTS) {
            await Utility.delay(RETRY_DELAY_MS);
            continue;
          }
        }

        return response;
      } catch (error) {
        logger.error(`Attempt ${attempt}/${MAX_ATTEMPTS} - Error fetching task completion status: ${error}`);
        if (attempt < MAX_ATTEMPTS) {
          await Utility.delay(RETRY_DELAY_MS);
        } else {
          throw error;
        }
      }
    }

    throw new Error(`Failed to get task completion status after ${MAX_ATTEMPTS} attempts.`);
  }

  async checkTaskStatus(taskId: string): Promise<'success' | 'retry'> {
    await this.logTaskProgress(taskId);
    const response = await this.getTaskCompletionStatus(taskId);

    if (response.status === 404) {
      logger.warn(`Task ${taskId} not found (404). Retrying...`);
      return 'retry';
    }

    const downloads = response.data?.downloads;
    if (Array.isArray(downloads) && downloads.length > 0) {
      logger.info(`Task ${taskId} completed successfully.`, { downloads });
      return 'success';
    }

    logger.warn(`Task ${taskId} status indicates retry needed.`);
    return 'retry';
  }

  async dispatchTaskWithRetry(): Promise<string | null> {
    for (let attempt = 1; attempt <= Config.MAX_RETRIES; attempt++) {
      const result = await this.dispatchTask();

      if (!isDispatchErrorResponse(result)) {
        return result.taskId;
      }

      if (attempt < Config.MAX_RETRIES) {
        logger.info(`${DEFAULT_CURRENT_STEP}. Retrying (${attempt}/${Config.MAX_RETRIES}) in ${Config.RETRY_DELAY_MS / 1000} seconds...`);
        await Utility.delay(Config.RETRY_DELAY_MS);
      }
    }

    logger.error('Max retries reached.');
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

  async pollTaskStatusUntilSuccess(taskId: string, debug: boolean = false): Promise<'success' | 'timeout'> {
    const MAX_POLLING_DURATION_MS = 60 * 60 * 1000;
    const POLL_INTERVAL_MS = 20_000;
    const startTime = Date.now();

    if (debug) {
      logger.debug(`Starting polling for task ${taskId}`);
    }

    while (Date.now() - startTime < MAX_POLLING_DURATION_MS) {
      const status = await this.checkTaskStatus(taskId);
      if (debug) {
        // logger.debug(`Polled status: ${status} at ${new Date().toISOString()}`);
      }

      if (status === 'success') {
        if (debug) {
          logger.debug(`Polling ended with success for task ${taskId}`);
        }
        return 'success';
      }

      await Utility.delay(POLL_INTERVAL_MS);
    }

    logger.warn(`Polling timed out after ${MAX_POLLING_DURATION_MS / 1000} seconds.`);
    if (debug) {
      logger.debug(`Polling ended with timeout for task ${taskId}`);
    }
    return 'timeout';
  }

  private findLongestStrongTokenText(tokens: TokensList, whichLessThan: number = 100): string {
    const strongTokens = TokenUtils.findTokensOfType(tokens, 'strong');
    
    if (!strongTokens || strongTokens.length === 0) {
      return '';
    }
    
    const filteredTokens = strongTokens.filter(token => typeof token.text === 'string' && token.text.length < whichLessThan && !token.text.includes(','));
    
    if (filteredTokens.length === 0) {
      return '';
    }
    
    return filteredTokens.reduce((longest, token) => {
      return token.text.length > longest.length ? token.text : longest;
    }, '');
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
    let longestTitle = this.findLongestStrongTokenText(tokens, 100);
    
    if (!longestTitle) {
      throw new Error(`No valid title found in strong tokens for task ${taskId}`);
    }

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

  async getCompletedTasksForAccount(): Promise<CompletedTask[]> {
    const accountId = ACCOUNT_ID;
    const response = await axios.get(`${Config.BASE_URL}/tasks/completed/account/${accountId}`)
    const {
      completedTasks,
    } = response.data;

    return completedTasks;
  }
}
