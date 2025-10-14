import { runSqlAndGetRowObjectsJson } from "./duckdb-node";

// Simple in-process mutex to serialize duckdb CLI access per database file to reduce lock conflicts
class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  private release() {
    const next = this.queue.shift();
    if (next) next();
    else this.locked = false;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __duckdbMutexes: Map<string, AsyncMutex> | undefined;
}

const mutexes: Map<string, AsyncMutex> =
  globalThis.__duckdbMutexes ?? new Map<string, AsyncMutex>();
if (!globalThis.__duckdbMutexes) {
  globalThis.__duckdbMutexes = mutexes;
}

function getMutexFor(dbPath: string): AsyncMutex {
  const key = dbPath || ":memory:";
  let m = mutexes.get(key);
  if (!m) {
    m = new AsyncMutex();
    mutexes.set(key, m);
  }
  return m;
}

export async function runDuckDbCli(options: {
  dbPath: string;
  args: string[];
  cwd?: string; // ignored in Node API mode, kept for API compatibility
  json?: boolean; // always JSON in Node API mode
  retries?: number; // simple retry on transient errors
  retryDelayMs?: number;
}): Promise<{ code: number; stdout: string; stderr: string }> {
  const {
    dbPath,
    args,
    json = false,
    retries = 1,
    retryDelayMs = 150,
  } = options;
  const mutex = getMutexFor(dbPath);

  function extractSql(cliArgs: string[]): string | undefined {
    // Support both ["-c", sql] and [sql] forms; ignore -json/--json
    const cIdx = cliArgs.findIndex((a) => a === "-c" || a === "--command");
    if (cIdx >= 0 && cIdx + 1 < cliArgs.length) return cliArgs[cIdx + 1];
    const filtered = cliArgs.filter(
      (a) => a !== "-json" && a !== "--json" && a !== "-c" && a !== "--command"
    );
    if (filtered.length === 1) return filtered[0];
    if (filtered.length > 1) return filtered.join("\n");
    return undefined;
  }

  return mutex.runExclusive(async () => {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const sql = extractSql(args);
        if (!sql || sql.trim().length === 0) {
          return { code: 1, stdout: "", stderr: "No SQL provided" };
        }

        const rows = await runSqlAndGetRowObjectsJson(
          dbPath || ":memory:",
          sql
        );
        const stdout = JSON.stringify(rows);
        return { code: 0, stdout, stderr: "" };
      } catch (e) {
        attempt += 1;
        if (attempt > (retries < 1 ? 1 : retries)) {
          return { code: 1, stdout: "", stderr: String(e) };
        }
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
      }
    }
  });
}
