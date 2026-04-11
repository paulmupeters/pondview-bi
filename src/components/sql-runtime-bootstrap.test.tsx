import { describe, expect, test } from "bun:test";
import { startSqlRuntimeBootstrap } from "@/components/sql-runtime-bootstrap";

describe("startSqlRuntimeBootstrap", () => {
  test("skips duckdb-http health checks when duckdb-http is not selected", () => {
    let intervalCallback: (() => void) | undefined;
    const calls = {
      bridge: 0,
      http: 0,
    };

    startSqlRuntimeBootstrap({
      refreshBridgeHealth: async () => {
        calls.bridge += 1;
        return "online";
      },
      refreshDuckDbHttpHealth: async () => {
        calls.http += 1;
        return "online";
      },
      getSelectedSqlBackend: () => "duckdb-wasm",
      setInterval: ((callback: TimerHandler) => {
        intervalCallback = callback as () => void;
        return 42;
      }) as typeof window.setInterval,
      clearInterval: (() => {}) as typeof window.clearInterval,
    });

    expect(calls).toEqual({
      bridge: 1,
      http: 0,
    });

    if (intervalCallback) {
      intervalCallback();
    }

    expect(calls).toEqual({
      bridge: 2,
      http: 0,
    });
  });

  test("refreshes duckdb-http health when duckdb-http is selected", () => {
    let intervalCallback: (() => void) | undefined;
    let clearedIntervalId: number | undefined;
    const calls = {
      bridge: 0,
      http: 0,
    };

    const stop = startSqlRuntimeBootstrap({
      refreshBridgeHealth: async () => {
        calls.bridge += 1;
        return "online";
      },
      refreshDuckDbHttpHealth: async () => {
        calls.http += 1;
        return "online";
      },
      getSelectedSqlBackend: () => "duckdb-http",
      setInterval: ((callback: TimerHandler) => {
        intervalCallback = callback as () => void;
        return 42;
      }) as typeof window.setInterval,
      clearInterval: ((intervalId: number) => {
        clearedIntervalId = intervalId;
      }) as typeof window.clearInterval,
    });

    expect(calls).toEqual({
      bridge: 1,
      http: 1,
    });

    if (intervalCallback) {
      intervalCallback();
    }

    expect(calls).toEqual({
      bridge: 2,
      http: 2,
    });

    stop();

    expect(clearedIntervalId).toBe(42);
  });
});
