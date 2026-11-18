import type { BridgeQueryResponse } from "@pondview/bridge-protocol";

export interface ReleasableQueryRuntime {
  query(sql: string, limit?: number): Promise<BridgeQueryResponse>;
  close(): Promise<void>;
}

export interface IdleReleaseRuntimeOptions {
  /** Close the database this long after the last query finishes. */
  idleReleaseMs?: number;
  /** Keep retrying a query that hits another process's file lock this long. */
  lockRetryTimeoutMs?: number;
  /** Wait between lock retries. */
  lockRetryIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

const DEFAULT_IDLE_RELEASE_MS = 1_000;
const DEFAULT_LOCK_RETRY_TIMEOUT_MS = 15_000;
const DEFAULT_LOCK_RETRY_INTERVAL_MS = 250;

export function isDuckDbFileLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Could not set lock on file|Conflicting lock/i.test(message);
}

/**
 * Shares one DuckDB file between several processes (for example the chat and
 * agent-mode copies of `pondview mcp` that Claude Desktop starts). DuckDB
 * allows only one process to hold a file open for writing, so this opens the
 * file only while queries run, releases it once idle, and waits out another
 * process's lock instead of failing straight away.
 */
export class IdleReleaseRuntime {
  private readonly idleReleaseMs: number;
  private readonly lockRetryTimeoutMs: number;
  private readonly lockRetryIntervalMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private queryQueue: Promise<unknown> = Promise.resolve();
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly runtime: ReleasableQueryRuntime,
    options: IdleReleaseRuntimeOptions = {},
  ) {
    this.idleReleaseMs = options.idleReleaseMs ?? DEFAULT_IDLE_RELEASE_MS;
    this.lockRetryTimeoutMs =
      options.lockRetryTimeoutMs ?? DEFAULT_LOCK_RETRY_TIMEOUT_MS;
    this.lockRetryIntervalMs =
      options.lockRetryIntervalMs ?? DEFAULT_LOCK_RETRY_INTERVAL_MS;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)));
    this.now = options.now ?? Date.now;
  }

  query(sql: string, limit?: number): Promise<BridgeQueryResponse> {
    const queuedQuery = this.queryQueue.then(() =>
      this.runWithLockRetry(sql, limit),
    );
    // Keep the queue alive after a failed query.
    this.queryQueue = queuedQuery.catch(() => undefined);
    return queuedQuery;
  }

  async close(): Promise<void> {
    this.cancelRelease();
    await this.queryQueue;
    await this.runtime.close();
  }

  private async runWithLockRetry(
    sql: string,
    limit?: number,
  ): Promise<BridgeQueryResponse> {
    this.cancelRelease();
    const retryDeadline = this.now() + this.lockRetryTimeoutMs;
    try {
      for (;;) {
        try {
          return await this.runtime.query(sql, limit);
        } catch (error) {
          if (!isDuckDbFileLockError(error) || this.now() >= retryDeadline) {
            throw error;
          }
          // Drop the failed open so the next attempt opens the file again.
          await this.runtime.close();
          await this.sleep(this.lockRetryIntervalMs);
        }
      }
    } finally {
      this.scheduleRelease();
    }
  }

  private scheduleRelease(): void {
    this.cancelRelease();
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      // Run the close in the queue so it never interrupts a query.
      this.queryQueue = this.queryQueue
        .then(() => this.runtime.close())
        .catch(() => undefined);
    }, this.idleReleaseMs);
    this.releaseTimer.unref?.();
  }

  private cancelRelease(): void {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
  }
}
