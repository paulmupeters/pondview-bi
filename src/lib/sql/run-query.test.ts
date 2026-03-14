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

  test("routes to duckdb-http and returns backend metadata", async () => {
    let receivedSignal: AbortSignal | undefined;

    const runQuery = createRunQuery({
      resolveBackend: () => "duckdb-http",
      runDuckDbHttp: async (_sql, signal) => {
        receivedSignal = signal;
        return {
          rows: [{ ok: true }],
          columns: [{ name: "ok", type: "BOOLEAN" }],
          durationMs: 8,
        };
      },
      runBridge: async () => {
        throw new Error("should not reach bridge");
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
      backendPreference: "duckdb-http",
    });

    expect(receivedSignal).toBe(controller.signal);
    expect(result.backend).toBe("duckdb-http");
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

  test("routes MotherDuck identifiers through the server query endpoint", async () => {
    let receivedSql: string | undefined;
    let receivedIdentifier: string | undefined;
    let receivedSignal: AbortSignal | undefined;

    const runQuery = createRunQuery({
      resolveBackend: () => "duckdb-http",
      runServerDuckDbQuery: async (sql, dbIdentifier, signal) => {
        receivedSql = sql;
        receivedIdentifier = dbIdentifier;
        receivedSignal = signal;
        return {
          rows: [{ company: "Stripe", valuation: "$95B" }],
        };
      },
      runDuckDbHttp: async () => {
        throw new Error("should not reach duckdb-http");
      },
      runBridge: async () => {
        throw new Error("should not reach bridge");
      },
      runWasm: async () => {
        throw new Error("should not reach wasm");
      },
      assertWasmCompatibleIdentifier: () => {},
    });

    const controller = new AbortController();
    const result = await runQuery({
      sql: "SELECT * FROM unicorns",
      dbIdentifier: "md:my_db?motherduck_token=abc123",
      signal: controller.signal,
      backendPreference: "duckdb-http",
    });

    expect(receivedSql).toBe("SELECT * FROM unicorns");
    expect(receivedIdentifier).toBe("md:my_db?motherduck_token=abc123");
    expect(receivedSignal).toBe(controller.signal);
    expect(result.backend).toBe("bridge");
    expect(result.columns).toEqual([
      { name: "company" },
      { name: "valuation" },
    ]);
    expect(result.rows).toEqual([{ company: "Stripe", valuation: "$95B" }]);
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

  test("does not fallback when duckdb-http execution fails", async () => {
    let wasmCalled = false;

    const runQuery = createRunQuery({
      resolveBackend: () => "duckdb-http",
      runDuckDbHttp: async () => {
        throw new Error("DuckDB HTTP authentication failed");
      },
      runBridge: async () => {
        throw new Error("should not reach bridge");
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
      "DuckDB HTTP authentication failed",
    );
    expect(wasmCalled).toBe(false);
  });
});
