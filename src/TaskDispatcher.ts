import axios, { AxiosResponse } from 'axios';
import { Profiler } from './Profiler.js';
import { Utility } from './Utility.js';
import dotenv from 'dotenv'

dotenv.config()

class Config {
  static readonly MAX_RETRIES = 300;
  static readonly RETRY_DELAY_MS = 2_000; // 2 seconds delay between retries
}

// === Task Dispatching Logic ===

export class TaskDispatcher {
    async dispatchTaskWithRetry(): Promise<boolean> {
      for (let attempt = 1; attempt <= Config.MAX_RETRIES; attempt++) {
        const attemptProfiler = new Profiler(`Attempt ${attempt}`);
        const result = await this.dispatchTask();
        attemptProfiler.end();

        if (result === 'success') {
          return true;
        }

        if (attempt < Config.MAX_RETRIES) {
          console.log(`Retrying (${attempt}/${Config.MAX_RETRIES}) in ${Config.RETRY_DELAY_MS / 1000} seconds...`);
          await Utility.delay(Config.RETRY_DELAY_MS);
        }
      }

      console.error('Max retries reached.');
      return false;
    }

    private async dispatchTask(): Promise<'success' | 'retry'> {
      const dispatchProfiler = new Profiler('Dispatch request');
      const response: AxiosResponse = await axios.post(
        `https://http-harbor-eidos-production-80.schnworks.com/task/dispatch?accountId=${process.env.ACCOUNT_ID}`, {},
        {
          validateStatus: function (status) {
            return status === 200 || status === 404;
          }
        }
      );
      dispatchProfiler.end();

      console.log({ ...response.data });
      const errorField = response.data?.error;

      console.log('Received response:', errorField);

      if (typeof errorField !== 'string') {
        console.log('Error field is not a string. Considering it a success.');
        return 'success';
      }

      if (errorField === '') {
        console.log('Task dispatched successfully (empty error string).');
        return 'success';
      }

      console.warn('Task dispatch returned an error string:', errorField);
      return 'retry';
    }
}
