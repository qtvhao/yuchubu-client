export class GlobalLock {
  private static locks: Map<string, boolean> = new Map();
  private static instance: GlobalLock;

  private constructor() {}

  public static getInstance(): GlobalLock {
    if (!GlobalLock.instance) {
      GlobalLock.instance = new GlobalLock();
    }
    return GlobalLock.instance;
  }

  public acquireLock(key: string): boolean {
    if (GlobalLock.locks.get(key)) {
      // Lock already acquired
      return false;
    }
    GlobalLock.locks.set(key, true);
    return true;
  }

  public releaseLock(key: string): void {
    GlobalLock.locks.delete(key);
  }

  public isLocked(key: string): boolean {
    return GlobalLock.locks.get(key) === true;
  }

  public async tryWithLock<T>(
    key: string,
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 100
  ): Promise<T | null> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (this.acquireLock(key)) {
        try {
          return await fn();
        } finally {
          this.releaseLock(key);
        }
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return null; // failed to acquire lock after retries
  }
}