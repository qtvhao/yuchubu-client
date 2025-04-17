
import { writeFileSync } from 'fs';
import { join } from 'path';
import { YouTubeVideoManager } from 'contentdroplet/dist/YouTubeVideoManager.js';
import { TaskDispatcher } from '../TaskDispatcher.js';

export class TaskResultHandler {
    private taskDispatcher: TaskDispatcher;

    constructor() {
        this.taskDispatcher = new TaskDispatcher();
    }

    public async pollAndDownloadResults(taskId: string): Promise<void> {
        await this.taskDispatcher.pollTaskStatusUntilSuccess(taskId, true);
        const [[downloadBuffer], content, title] = await this.taskDispatcher.downloadTaskResults(taskId);

        const outputPath = join(process.cwd(), `task-${taskId}.mp4`);
        writeFileSync(outputPath, downloadBuffer);
        console.log(`💾 Downloaded buffer saved to ${outputPath}`);
        console.log(`Content: ${content}`);
        await new Promise(r => setTimeout(r, 2e3));
        const manager = new YouTubeVideoManager(outputPath, title.charAt(0).toUpperCase() + title.slice(1));
        await manager.run();
    }
}
