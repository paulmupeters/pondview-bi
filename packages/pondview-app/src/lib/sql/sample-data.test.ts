import { describe, expect, test } from "bun:test";
import {
  ensureSampleDataForEmptyRuntime,
  hasVisibleTablesInRuntime,
  LIST_VISIBLE_TABLES_SQL,
  resolveSampleDataRuntime,
  SAMPLE_DATA_SQL,
} from "@/lib/sql/sample-data";

describe("sample data runtime helpers", () => {
  test("detects visible tables and skips sample creation", async () => {
    const executedSql: string[] = [];

    const result = await ensureSampleDataForEmptyRuntime(
      { backendPreference: "duckdb-wasm" },
      {
        runSql: async ({ sql }) => {
          executedSql.push(sql);
          return {
            rows:
              sql === LIST_VISIBLE_TABLES_SQL ? [{ table_name: "orders" }] : [],
            columns: [],
            durationMs: 1,
            backend: "duckdb-wasm",
          };
        },
      },
    );

    expect(result).toEqual({
      backend: "duckdb-wasm",
      dbIdentifier: "wasm:local",
      created: false,
      skipped: true,
    });
    expect(executedSql).toEqual([LIST_VISIBLE_TABLES_SQL]);
  });

  test("creates sample data when the runtime is empty", async () => {
    const executedSql: string[] = [];

    const result = await ensureSampleDataForEmptyRuntime(
      { backendPreference: "duckdb-wasm" },
      {
        runSql: async ({ sql }) => {
          executedSql.push(sql);
          return {
            rows: [],
            columns: [],
            durationMs: 1,
            backend: "duckdb-wasm",
          };
        },
      },
    );

    expect(result).toEqual({
      backend: "duckdb-wasm",
      dbIdentifier: "wasm:local",
      created: true,
      skipped: false,
    });
    expect(executedSql).toEqual([LIST_VISIBLE_TABLES_SQL, SAMPLE_DATA_SQL]);
  });

  test("reports whether the active runtime has visible tables", async () => {
    const result = await hasVisibleTablesInRuntime(
      { backendPreference: "bridge" },
      {
        resolveBackend: () => "bridge",
        runSql: async () => ({
          rows: [{ table_name: "unicorns" }, { table_name: "investors" }],
          columns: [],
          durationMs: 1,
          backend: "bridge",
        }),
      },
    );

    expect(result).toEqual({
      backend: "bridge",
      dbIdentifier: undefined,
      hasVisibleTables: true,
      tableCount: 2,
    });
  });

  test("resolves backend and db identifier for the active runtime", () => {
    expect(
      resolveSampleDataRuntime({ backendPreference: "duckdb-wasm" }),
    ).toEqual({
      backend: "duckdb-wasm",
      dbIdentifier: "wasm:local",
    });

    expect(
      resolveSampleDataRuntime(
        { backendPreference: "bridge" },
        {
          resolveBackend: () => "bridge",
          resolveDbIdentifier: (_dbIdentifier, _backend) => undefined,
        },
      ),
    ).toEqual({
      backend: "bridge",
      dbIdentifier: undefined,
    });
  });
});
