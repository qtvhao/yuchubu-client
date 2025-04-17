import { Profiler } from '../Profiler.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { YouTubeVideoManager } from 'contentdroplet/dist/YouTubeVideoManager.js'
import EventEmitter from "events";
import { TaskDispatcher } from '../TaskDispatcher.js';
import GlobalQueueManager from '../GlobalQueueManager.js';

export class DispatchVideoTaskScheduler {
    static COMPLETED_TASKS_QUEUE = 'completed-video-tasks';
    static DISPATCHED_TASKS_QUEUE = 'dispatched-video-tasks';
    private taskDispatcher: TaskDispatcher;
    constructor(private emitter = new EventEmitter) {
        this.taskDispatcher = new TaskDispatcher();
    }

    on(event: string, callback: (...args: any[]) => void): void {
        this.emitter.on(event, callback);
    }

    async start() {
        while (true) {
            await this.dispatch()
            await new Promise(r => setTimeout(r, 60e3 * 15)) // 15 minutes
        }
    }
    // 

    private async dispatch(): Promise<void> {
        console.log('[SchedulerManager] handleSyncSuccess triggered');
        const totalProfiler = this.startTotalDispatchProfiler();

        try {
            console.log('[SchedulerManager] Starting task dispatch...');
            const taskId = await this.taskDispatcher.dispatchTaskWithRetry();
            totalProfiler.end();

            if (taskId) {
                console.log('[SchedulerManager] Task dispatch returned taskId:', taskId);
                await this.handleDispatchSuccess(taskId);
            } else {
                console.log('[SchedulerManager] No taskId returned, dispatch considered failed.');
                this.handleDispatchFailure(null);
            }

        } catch (error) {
            totalProfiler.end();
            console.error('[SchedulerManager] Error during task dispatch:', error);
            this.handleDispatchFailure(error as Error);
        }
    }

    private startTotalDispatchProfiler(): Profiler {
        console.log('syncSuccess');
        return new Profiler('Total Dispatch Process');
    }

    private async handleDispatchSuccess(taskId: string): Promise<void> {
        console.log('✅ Đã phân tích thành công. Generating prompt-to-video cho video mới.');
        console.log('🚀 Dispatch succeeded.');
        GlobalQueueManager
            .getInstance()
            .addToQueue(DispatchVideoTaskScheduler.DISPATCHED_TASKS_QUEUE, {
                id: taskId,
                payload: {
                    taskId,
                }
            })
    }

    private handleDispatchFailure(error: Error | null): void {
        if (!error) {
            console.error('Dispatch failed after retries. Stopping scheduler.');
            return;
        }

        console.error('Unexpected error occurred:', error.message);

        const responseBody = (error as any)?.response?.data;
        if (responseBody) {
            console.error('HTTP response body:', responseBody);
        }
    }
}
