import { describe, expect, test } from "bun:test";
import { startSqlRuntimeBootstrap } from "@/components/sql-runtime-bootstrap";

describe("startSqlRuntimeBootstrap", () => {
  test("refreshes bridge health immediately and on interval", () => {
    let intervalCallback: (() => void) | undefined;
    let clearedIntervalId: number | undefined;
    let bridgeCalls = 0;

    const stop = startSqlRuntimeBootstrap({
      refreshBridgeHealth: async () => {
        bridgeCalls += 1;
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

    expect(bridgeCalls).toBe(1);

    intervalCallback?.();
    expect(bridgeCalls).toBe(2);

    stop();
    expect(clearedIntervalId).toBe(42);
  });
});
