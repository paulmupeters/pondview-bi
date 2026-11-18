import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BridgeQueryResponse } from "@pondview/bridge-protocol";
import { DuckDbRuntime } from "./duckdb-runtime";
import {
  IdleReleaseRuntime,
  isDuckDbFileLockError,
  type ReleasableQueryRuntime,
} from "./idle-release-runtime";

const lockError = new Error(
  'IO Error: Could not set lock on file "/tmp/x.duckdb": Conflicting lock is held in bun (PID 1)',
);

function emptyResult(): BridgeQueryResponse {
  return { columns: [], rows: [], rowCount: 0, rowsChanged: 0 };
}

class FakeRuntime implements ReleasableQueryRuntime {
  failuresBeforeSuccess = 0;
  queryCount = 0;
  closeCount = 0;
  events: string[] = [];

  async query(sql: string): Promise<BridgeQueryResponse> {
    this.queryCount += 1;
    this.events.push(`query:${sql}`);
    if (this.failuresBeforeSuccess > 0) {
      this.failuresBeforeSuccess -= 1;
      throw lockError;
    }
    return emptyResult();
  }

  async close(): Promise<void> {
    this.closeCount += 1;
    this.events.push("close");
  }
}

const noSleep = async () => {};
const waitFor = (milliseconds: number) =>
  new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

describe("isDuckDbFileLockError", () => {
  test("recognises DuckDB's conflicting lock error only", () => {
    expect(isDuckDbFileLockError(lockError)).toBe(true);
    expect(isDuckDbFileLockError(new Error("Catalog Error: no table"))).toBe(
      false,
    );
  });
});

describe("IdleReleaseRuntime", () => {
  test("retries a query that hits another process's lock", async () => {
    const fakeRuntime = new FakeRuntime();
    fakeRuntime.failuresBeforeSuccess = 2;
    const runtime = new IdleReleaseRuntime(fakeRuntime, {
      idleReleaseMs: 60_000,
      sleep: noSleep,
    });

    await runtime.query("SELECT 1");

    expect(fakeRuntime.queryCount).toBe(3);
    // Each failed open is dropped before trying again.
    expect(fakeRuntime.closeCount).toBe(2);
    await runtime.close();
  });

  test("gives up on the lock after the retry timeout", async () => {
    const fakeRuntime = new FakeRuntime();
    fakeRuntime.failuresBeforeSuccess = Number.POSITIVE_INFINITY;
    let currentTime = 0;
    const runtime = new IdleReleaseRuntime(fakeRuntime, {
      lockRetryTimeoutMs: 1_000,
      lockRetryIntervalMs: 250,
      now: () => currentTime,
      sleep: async (milliseconds) => {
        currentTime += milliseconds;
      },
    });

    await expect(runtime.query("SELECT 1")).rejects.toThrow("Conflicting lock");
    expect(fakeRuntime.queryCount).toBe(5);
    await runtime.close();
  });

  test("does not retry other errors", async () => {
    const fakeRuntime = new FakeRuntime();
    fakeRuntime.query = async () => {
      fakeRuntime.queryCount += 1;
      throw new Error("Parser Error");
    };
    const runtime = new IdleReleaseRuntime(fakeRuntime, { sleep: noSleep });

    await expect(runtime.query("SELEC")).rejects.toThrow("Parser Error");
    expect(fakeRuntime.queryCount).toBe(1);
    // A failed query doesn't block the ones after it.
    fakeRuntime.query = async () => emptyResult();
    await expect(runtime.query("SELECT 1")).resolves.toEqual(emptyResult());
    await runtime.close();
  });

  test("releases the database once idle, not between back-to-back queries", async () => {
    const fakeRuntime = new FakeRuntime();
    const runtime = new IdleReleaseRuntime(fakeRuntime, { idleReleaseMs: 20 });

    await Promise.all([runtime.query("a"), runtime.query("b")]);
    expect(fakeRuntime.events).toEqual(["query:a", "query:b"]);

    await waitFor(60);
    expect(fakeRuntime.events).toEqual(["query:a", "query:b", "close"]);
    await runtime.close();
  });

  test("lets another process use the file between queries", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pondview-idle-release-"));
    const databasePath = join(tempDir, "shared.duckdb");
    const runtime = new IdleReleaseRuntime(
      new DuckDbRuntime({ databasePath }),
      { idleReleaseMs: 20, lockRetryIntervalMs: 50 },
    );
    try {
      await runtime.query("CREATE TABLE numbers AS SELECT 1 AS value");
      await waitFor(80);

      // Another process opens the file, writes and holds the lock briefly.
      const otherProcess = Bun.spawn(
        [
          process.execPath,
          "-e",
          `const { DuckDBInstance } = await import("@duckdb/node-api");
           const instance = await DuckDBInstance.create(${JSON.stringify(databasePath)});
           const connection = await instance.connect();
           await connection.run("INSERT INTO numbers VALUES (2)");
           console.log("locked");
           await new Promise((resolveWait) => setTimeout(resolveWait, 400));
           connection.closeSync();
           instance.closeSync();`,
        ],
        { cwd: import.meta.dir, stdout: "pipe", stderr: "inherit" },
      );
      const reader = otherProcess.stdout.getReader();
      const firstOutput = new TextDecoder().decode((await reader.read()).value);
      expect(firstOutput).toContain("locked");

      // This waits out the other process's lock instead of failing.
      const result = await runtime.query(
        "SELECT sum(value)::INTEGER AS total FROM numbers",
      );
      expect(result.rows).toEqual([{ total: 3 }]);
      expect(await otherProcess.exited).toBe(0);
    } finally {
      await runtime.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);
});
