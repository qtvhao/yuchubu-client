
// === Utility Functions ===

export class Utility {
    static delay(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }