import { writeFileSync } from 'fs';
import { join } from 'path';
import { YouTubeVideoManager } from 'contentdroplet/dist/YouTubeVideoManager.js';
import { TaskDispatcher } from '../TaskDispatcher.js';

export class TaskResultHandler {
    private taskDispatcher: TaskDispatcher;

    constructor() {
        this.taskDispatcher = new TaskDispatcher();
    }

    private async waitForTaskCompletion(taskId: string): Promise<void> {
        await this.taskDispatcher.pollTaskStatusUntilSuccess(taskId, true);
    }

    private async downloadTaskOutput(taskId: string): Promise<[Buffer, string, string]> {
        const [[downloadBuffer], content, title] = await this.taskDispatcher.downloadTaskResults(taskId);
        return [downloadBuffer, content, title];
    }

    private saveToFile(downloadBuffer: Buffer, taskId: string): string {
        const outputPath = join(process.cwd(), `task-${taskId}.mp4`);
        writeFileSync(outputPath, downloadBuffer);
        console.log(`💾 Downloaded buffer saved to ${outputPath}`);
        return outputPath;
    }

    public async pollAndDownloadResults(taskId: string): Promise<any> {
        await this.waitForTaskCompletion(taskId);
        const [downloadBuffer, content, title] = await this.downloadTaskOutput(taskId);
        console.log(`Content: ${content}`);
        const outputPath = this.saveToFile(downloadBuffer, taskId);

        return [outputPath, title]
    }
}
