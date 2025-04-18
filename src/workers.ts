import GlobalQueueManager from "./GlobalQueueManager.js";
import { DispatchVideoTaskScheduler } from "./schedulers/DispatchVideoTaskScheduler.js";
import { TaskResultHandler } from "./handlers/TaskResultHandler.js";
import { YouTubeVideoManager } from "contentdroplet/dist/YouTubeVideoManager.js";
import { TaskDispatcher } from "./TaskDispatcher.js";

function enqueueCompletedTask(id: string, outputPath: string, title: string) {
    const globalQueueManager = GlobalQueueManager.getInstance();
    globalQueueManager.addToQueue(DispatchVideoTaskScheduler.COMPLETED_TASKS_QUEUE, {
        id,
        payload: {
            outputPath,
            title,
        }
    });
}

export const workersManager = {
    async start() {
        const handler = new TaskResultHandler();
        const completedTasks = await TaskDispatcher.getInstance().getCompletedTasksForAccount()
        console.log(completedTasks)
        const globalQueueManager = GlobalQueueManager.getInstance();
        for (let i = 0; i < completedTasks.length; i++) {
            const completedTask = completedTasks[i];
            const [outputPath, title] = await handler.handleDownloadAndSave(completedTask.id);
            enqueueCompletedTask(completedTask.id, outputPath, title);
        }

        globalQueueManager.process(DispatchVideoTaskScheduler.DISPATCHED_TASKS_QUEUE, async (dequeued) => {
            const taskId = dequeued.payload.taskId;
            console.log({taskId})
            const handler = new TaskResultHandler();
            const [outputPath, title] = await handler.pollAndDownloadResults(taskId);
            enqueueCompletedTask(taskId, outputPath, title);
        });
        globalQueueManager.process(DispatchVideoTaskScheduler.COMPLETED_TASKS_QUEUE, async (dequeued) => {
            console.log(dequeued)
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
