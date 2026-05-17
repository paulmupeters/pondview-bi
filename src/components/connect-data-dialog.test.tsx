import { describe, expect, test } from "bun:test";
import {
  buildSchemaIntrospectionSql,
  buildTablePreviewSql,
  isWasmCompatibleDatabase,
  normalizeQuackUriInput,
  resolveQuackDisableSsl,
  shouldSkipExtensionLoadForWasm,
} from "@/components/connect-data-dialog";

describe("ConnectDataDialog runtime source support", () => {
  test("allows browser-compatible DuckDB sources in WASM mode", () => {
    expect(isWasmCompatibleDatabase("duckdb_remote")).toBe(true);
    expect(isWasmCompatibleDatabase("quack")).toBe(false);
  });

  test("keeps extension-backed SQL databases off the WASM-only picker", () => {
    expect(isWasmCompatibleDatabase("postgres")).toBe(false);
    expect(isWasmCompatibleDatabase("mysql")).toBe(false);
    expect(isWasmCompatibleDatabase("sqlite")).toBe(false);
    expect(isWasmCompatibleDatabase("motherduck")).toBe(false);
  });

  test("normalizes HTTP endpoints to DuckDB Quack URIs", () => {
    expect(normalizeQuackUriInput("http://localhost:9494")).toBe(
      "quack:localhost:9494",
    );
    expect(normalizeQuackUriInput("https://analytics.example.com")).toBe(
      "quack:analytics.example.com",
    );
    expect(normalizeQuackUriInput("quack:localhost:9494")).toBe(
      "quack:localhost:9494",
    );
  });

  test("infers Quack plain HTTP from URI input without requiring an option", () => {
    expect(resolveQuackDisableSsl("quack:localhost:9494")).toBe(true);
    expect(resolveQuackDisableSsl("http://localhost:9494")).toBe(true);
    expect(resolveQuackDisableSsl("https://analytics.example.com")).toBe(false);
  });

  test("still loads the Quack extension before attaching in WASM", () => {
    expect(shouldSkipExtensionLoadForWasm("duckdb_remote")).toBe(true);
    expect(shouldSkipExtensionLoadForWasm("quack")).toBe(false);
  });

  test("introspects Quack catalogs through the remote query macro", () => {
    expect(
      buildSchemaIntrospectionSql({
        sourceType: "quack",
        alias: "station",
      }),
    ).toBe(
      `SELECT table_schema FROM "station".query('SELECT DISTINCT table_schema FROM information_schema.tables WHERE table_schema NOT IN (''information_schema'', ''pg_catalog'') ORDER BY 1')`,
    );

    expect(
      buildTablePreviewSql({
        sourceType: "quack",
        alias: "station",
        schema: "main",
      }),
    ).toBe(
      `SELECT table_name FROM "station".query('SELECT table_name FROM information_schema.tables WHERE table_schema = ''main'' AND table_type = ''BASE TABLE'' ORDER BY table_name LIMIT 20')`,
    );
  });
});
