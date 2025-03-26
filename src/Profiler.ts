export class Profiler {
  private label: string;
  private start: number;

  constructor(label: string) {
    this.label = label;
    this.start = Date.now();
    console.log(`⏱️ Started: ${this.label}`);
  }

  end(): void {
    const duration = (Date.now() - this.start) / 1000;
    console.log(`✅ Finished: ${this.label} — ${duration.toFixed(2)}s`);
  }
}
