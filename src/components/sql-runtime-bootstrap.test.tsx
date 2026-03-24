import { describe, expect, test } from "bun:test";
import { startSqlRuntimeBootstrap } from "@/components/sql-runtime-bootstrap";

describe("startSqlRuntimeBootstrap", () => {
  test("refreshes bridge and duckdb-http health immediately and on interval", () => {
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
