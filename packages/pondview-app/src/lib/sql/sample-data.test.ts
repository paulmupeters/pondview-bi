import { describe, expect, test } from "bun:test";
import {
  buildSampleDataSql,
  ENSURE_SAMPLE_DATA_SQL,
  ensureSampleDataForEmptyRuntime,
  ensureSampleDataIsAvailable,
  hasVisibleTablesInRuntime,
  LIST_VISIBLE_TABLES_SQL,
  LOCAL_SAMPLE_DATA_PATH,
  resolveSampleDataRuntime,
  SAMPLE_DATA_SQL,
} from "@/lib/sql/sample-data";

describe("sample data runtime helpers", () => {
  test("uses the bundled CSV for browser-local DuckDB and the hosted CSV for the bridge", () => {
    expect(
      buildSampleDataSql("duckdb-wasm", {
        browserOrigin: "https://app.pondview.com",
      }),
    ).toContain(
      `read_csv_auto('https://app.pondview.com${LOCAL_SAMPLE_DATA_PATH}')`,
    );
    expect(
      buildSampleDataSql("bridge", {
        ifNotExists: true,
        browserOrigin: "https://app.pondview.com",
      }),
    ).toBe(ENSURE_SAMPLE_DATA_SQL);
  });

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

  test("ensures the sample table exists even when other runtime tables may exist", async () => {
    const calls: Array<{
      sql: string;
      backendPreference?: string;
      dbIdentifier?: string;
    }> = [];

    const result = await ensureSampleDataIsAvailable(
      { backendPreference: "duckdb-wasm" },
      {
        runSql: async (options) => {
          calls.push(options);
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
    });
    expect(calls).toEqual([
      {
        sql: ENSURE_SAMPLE_DATA_SQL,
        backendPreference: "duckdb-wasm",
        dbIdentifier: "wasm:local",
      },
    ]);
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
