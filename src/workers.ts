import GlobalQueueManager from "./GlobalQueueManager.js";
import { DispatchVideoTaskScheduler } from "./schedulers/DispatchVideoTaskScheduler.js";
import { TaskResultHandler } from "./handlers/TaskResultHandler.js";
import { YouTubeVideoManager } from "contentdroplet/dist/YouTubeVideoManager.js";

export const workersManager = {
    start() {
        const globalQueueManager = GlobalQueueManager.getInstance();
        globalQueueManager.process(DispatchVideoTaskScheduler.DISPATCHED_TASKS_QUEUE, async (dequeued) => {
            const taskId = dequeued.payload.taskId;
            console.log({taskId})
            const handler = new TaskResultHandler();
            const [outputPath, title] = await handler.pollAndDownloadResults(taskId);
            globalQueueManager.addToQueue(DispatchVideoTaskScheduler.COMPLETED_TASKS_QUEUE, {
                id: '',
                payload: {
                    outputPath,
                    title,
                }
            })
            
        });
        globalQueueManager.process(DispatchVideoTaskScheduler.COMPLETED_TASKS_QUEUE, async (dequeued) => {
            const {
                payload: {
                    outputPath,
                    title,
                }
            } = dequeued
            const manager = new YouTubeVideoManager(outputPath, title.charAt(0).toUpperCase() + title.slice(1));
            await manager.run();
        })
    }
};
