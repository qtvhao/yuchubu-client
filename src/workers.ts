import GlobalQueueManager from "./GlobalQueueManager.js";
import { DispatchVideoTaskScheduler } from "./schedulers/DispatchVideoTaskScheduler.js";
import { TaskResultHandler } from "./handlers/TaskResultHandler.js";
import { YouTubeVideoManager } from "contentdroplet/dist/YouTubeVideoManager.js";
import { TaskDispatcher } from "./TaskDispatcher.js";
import { GlobalLock } from "./GlobalLock.js";

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
        await this.processPreviouslyCompletedTasks();
        this.startDispatchedTasksProcessor();
        this.startCompletedTasksProcessor();
    },

    async processPreviouslyCompletedTasks() {
        const handler = new TaskResultHandler();
        const completedTasks = await TaskDispatcher.getInstance().getCompletedTasksForAccount();

        for (const completedTask of completedTasks) {
            const [outputPath, title] = await handler.handleDownloadAndSave(completedTask.id);
            enqueueCompletedTask(completedTask.id, outputPath, title);
            await TaskDispatcher.getInstance().archiveCompletedTask(completedTask.id)
        }
    },

    startDispatchedTasksProcessor() {
        const globalQueueManager = GlobalQueueManager.getInstance();

        globalQueueManager.process(
            DispatchVideoTaskScheduler.DISPATCHED_TASKS_QUEUE,
            async (dequeued) => {
                const taskId = dequeued.payload.taskId;
                const handler = new TaskResultHandler();
                const [outputPath, title] = await handler.pollAndDownloadResults(taskId);
                enqueueCompletedTask(taskId, outputPath, title);
            }
        );
    },

    startCompletedTasksProcessor() {
        const globalQueueManager = GlobalQueueManager.getInstance();

        globalQueueManager.process(
            DispatchVideoTaskScheduler.COMPLETED_TASKS_QUEUE,
            async (dequeued) => {
                await GlobalLock.getInstance().tryWithLock('browser_connect', async () => {
                    const { outputPath, title } = dequeued.payload;
                    const manager = new YouTubeVideoManager(
                        outputPath,
                        title.charAt(0).toUpperCase() + title.slice(1)
                    );
                    await manager.run();
                }, 10 * 60, 1_000)
            }
        );
    }
};
