type QueueItem = {
  id: string;
  payload: any;
};

export default class GlobalQueueManager {
  private static instance: GlobalQueueManager;
  private queues: Map<string, QueueItem[]>;

  private constructor() {
    this.queues = new Map<string, QueueItem[]>();
  }

  public static getInstance(): GlobalQueueManager {
    if (!GlobalQueueManager.instance) {
      GlobalQueueManager.instance = new GlobalQueueManager();
    }
    return GlobalQueueManager.instance;
  }

  public addToQueue(queueName: string, item: QueueItem): void {
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }
    this.queues.get(queueName)!.push(item);
  }

  public getNextItem(queueName: string): QueueItem | undefined {
    const queue = this.queues.get(queueName);
    if (queue && queue.length > 0) {
      return queue.shift();
    }
    return undefined;
  }

  public peekQueue(queueName: string): QueueItem | undefined {
    const queue = this.queues.get(queueName);
    return queue && queue.length > 0 ? queue[0] : undefined;
  }

  public clearQueue(queueName: string): void {
    this.queues.delete(queueName);
  }

  public getQueueLength(queueName: string): number {
    const queue = this.queues.get(queueName);
    return queue ? queue.length : 0;
  }

  public getAllQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }

  public async process(queueName: string, processor: (item: QueueItem) => Promise<void>): Promise<void> {
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }
    const queue = this.queues.get(queueName)!;

    while (true) {
      if (queue.length > 0) {
        const item = queue.shift();
        if (item) {
          await processor(item);
        }
      } else {
        // Wait a short time before checking again
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
}
