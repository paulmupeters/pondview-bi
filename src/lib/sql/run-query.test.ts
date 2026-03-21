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

  test("runs MotherDuck queries through duckdb-http attach lifecycle", async () => {
    const receivedSql: string[] = [];
    let receivedSignal: AbortSignal | undefined;
    const runQuery = createRunQuery({
      resolveBackend: () => "duckdb-http",
      runDuckDbHttp: async (sql, signal) => {
        receivedSql.push(sql);
        receivedSignal = signal;
        if (sql.includes("current_catalog()")) {
          return {
            rows: [{ current_catalog: "duckdb" }],
            columns: [{ name: "current_catalog", type: "VARCHAR" }],
            durationMs: 0,
          };
        }
        if (sql.startsWith("SELECT")) {
          return {
            rows: [{ company: "Stripe", valuation: "$95B" }],
            columns: [
              { name: "company", type: "VARCHAR" },
              { name: "valuation", type: "VARCHAR" },
            ],
            durationMs: 7,
          };
        }
        return {
          rows: [],
          columns: [],
          durationMs: 0,
        };
      },
      runWasm: async () => {
        throw new Error("should not reach wasm");
      },
      assertWasmCompatibleIdentifier: () => {},
    });

    const controller = new AbortController();
    const result = await runQuery({
      sql: "SELECT * FROM unicorns",
      dbIdentifier: "md:my_db",
      signal: controller.signal,
      backendPreference: "duckdb-http",
    });

    expect(receivedSignal).toBe(controller.signal);
    expect(receivedSql).toEqual([
      "INSTALL motherduck;",
      "LOAD motherduck;",
      `ATTACH 'md:my_db' AS "motherduck";`,
      "SELECT current_catalog() AS current_catalog;",
      'USE "motherduck";',
      "SELECT * FROM unicorns",
      'USE "duckdb";',
      'DETACH DATABASE IF EXISTS "motherduck";',
    ]);
    expect(result.backend).toBe("duckdb-http");
    expect(result.columns).toEqual([
      { name: "company", type: "VARCHAR" },
      { name: "valuation", type: "VARCHAR" },
    ]);
    expect(result.rows).toEqual([{ company: "Stripe", valuation: "$95B" }]);
  });

  test("preserves explicit catalog-qualified MotherDuck queries", async () => {
    const receivedSql: string[] = [];
    const runQuery = createRunQuery({
      resolveBackend: () => "duckdb-http",
      runDuckDbHttp: async (sql) => {
        receivedSql.push(sql);
        if (sql.includes("current_catalog()")) {
          return {
            rows: [{ current_catalog: "duckdb" }],
            columns: [{ name: "current_catalog", type: "VARCHAR" }],
            durationMs: 0,
          };
        }
        if (sql.startsWith("SELECT")) {
          return {
            rows: [{ company: "Stripe" }],
            columns: [{ name: "company", type: "VARCHAR" }],
            durationMs: 3,
          };
        }
        return {
          rows: [],
          columns: [],
          durationMs: 0,
        };
      },
      runWasm: async () => {
        throw new Error("should not reach wasm");
      },
      assertWasmCompatibleIdentifier: () => {},
    });

    const result = await runQuery({
      sql: "SELECT * FROM motherduck.unicorns",
      dbIdentifier: "md:my_db",
      backendPreference: "duckdb-http",
    });

    expect(receivedSql).toEqual([
      "INSTALL motherduck;",
      "LOAD motherduck;",
      `ATTACH 'md:my_db' AS "motherduck";`,
      "SELECT current_catalog() AS current_catalog;",
      'USE "motherduck";',
      "SELECT * FROM motherduck.unicorns",
      'USE "duckdb";',
      'DETACH DATABASE IF EXISTS "motherduck";',
    ]);
    expect(result.rows).toEqual([{ company: "Stripe" }]);
  });

  test("wraps bridge queries with a selected catalog context", async () => {
    const receivedSql: string[] = [];
    const runQuery = createRunQuery({
      resolveBackend: () => "bridge",
      runBridge: async (sql) => {
        receivedSql.push(sql);
        if (sql.includes("current_catalog()")) {
          return {
            rows: [{ current_catalog: "duck" }],
            columns: [{ name: "current_catalog", type: "VARCHAR" }],
            durationMs: 0,
          };
        }
        return {
          rows: [],
          columns: [],
          durationMs: 0,
        };
      },
      runWasm: async () => {
        throw new Error("should not reach wasm");
      },
      assertWasmCompatibleIdentifier: () => {},
    });

    await runQuery({
      sql: "SELECT * FROM main.unicorns",
      catalogContext: "motherduck",
    });

    expect(receivedSql).toEqual([
      "SELECT current_catalog() AS current_catalog;",
      'USE "motherduck";',
      "SELECT * FROM main.unicorns",
      'USE "duck";',
    ]);
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
