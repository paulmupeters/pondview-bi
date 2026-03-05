import { describe, expect, test } from "bun:test";
import { createRunQuery } from "@/lib/sql/run-query";

describe("runQuery routing", () => {
  test("routes to bridge and returns backend metadata", async () => {
    let receivedSignal: AbortSignal | undefined;

    const runQuery = createRunQuery({
      resolveBackend: () => "bridge",
      runBridge: async (_sql, signal) => {
        receivedSignal = signal;
        return {
          rows: [{ ok: true }],
          columns: [{ name: "ok", type: "BOOLEAN" }],
          durationMs: 12,
        };
      },
      runWasm: async () => {
        throw new Error("should not reach wasm");
      },
      assertWasmCompatibleIdentifier: () => {},
    });

    const controller = new AbortController();
    const result = await runQuery({
      sql: "SELECT 1",
      signal: controller.signal,
      backendPreference: "auto",
    });

    expect(receivedSignal).toBe(controller.signal);
    expect(result.backend).toBe("bridge");
    expect(result.rows).toEqual([{ ok: true }]);
  });

  test("routes to duckdb-wasm and validates identifier compatibility", async () => {
    let validatedIdentifier: string | undefined;

    const runQuery = createRunQuery({
      resolveBackend: () => "duckdb-wasm",
      runBridge: async () => {
        throw new Error("should not reach bridge");
      },
      assertWasmCompatibleIdentifier: (dbIdentifier) => {
        validatedIdentifier = dbIdentifier;
      },
      runWasm: async () => ({
        rows: [{ value: "42" }],
        columns: [{ name: "value" }],
        durationMs: 4,
      }),
    });

    const result = await runQuery({
      sql: "SELECT 42",
      dbIdentifier: "wasm:local",
      backendPreference: "auto",
    });

    expect(validatedIdentifier).toBe("wasm:local");
    expect(result.backend).toBe("duckdb-wasm");
    expect(result.columns).toEqual([{ name: "value" }]);
  });

  test("does not fallback when bridge execution fails", async () => {
    let wasmCalled = false;

    const runQuery = createRunQuery({
      resolveBackend: () => "bridge",
      runBridge: async () => {
        throw new Error("Bridge authentication failed");
      },
      runWasm: async () => {
        wasmCalled = true;
        return {
          rows: [],
          columns: [],
          durationMs: 0,
        };
      },
      assertWasmCompatibleIdentifier: () => {},
    });

    await expect(runQuery({ sql: "SELECT 1" })).rejects.toThrow(
      "Bridge authentication failed",
    );
    expect(wasmCalled).toBe(false);
  });
});
