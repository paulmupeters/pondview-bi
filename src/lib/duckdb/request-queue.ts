/**
 * FIFO task queue with configurable concurrency.
 * Ensures tasks are executed in order with a maximum number of concurrent executions.
 */
export class RequestQueue {
  private readonly concurrency: number;
  private running = 0;
  private queue: Array<{
    task: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];

  constructor(concurrency = 1) {
    if (concurrency < 1) {
      throw new Error('Concurrency must be at least 1');
    }
    this.concurrency = concurrency;
  }

  /**
   * Adds a task to the queue and returns a promise that resolves when the task completes.
   * Tasks are executed in FIFO order with respect to the concurrency limit.
   */
  add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const item = this.queue.shift();
    if (!item) {
      this.running--;
      return;
    }

    try {
      const result = await item.task();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }

  /**
   * Waits for all queued tasks to complete and all running tasks to finish.
   */
  async onIdle(): Promise<void> {
    // If already idle, resolve immediately
    if (this.queue.length === 0 && this.running === 0) {
      return;
    }

    // Otherwise, poll until idle
    return new Promise<void>((resolve) => {
      const checkIdle = () => {
        if (this.queue.length === 0 && this.running === 0) {
          resolve();
        } else {
          setTimeout(checkIdle, 10);
        }
      };
      checkIdle();
    });
  }

  /**
   * Returns the number of tasks currently running.
   */
  getRunningCount(): number {
    return this.running;
  }

  /**
   * Returns the number of tasks waiting in the queue.
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}

