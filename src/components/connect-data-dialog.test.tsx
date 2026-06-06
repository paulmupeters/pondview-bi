import { describe, expect, test } from "bun:test";
import {
  buildRemoteDuckdbSecretStatement,
  buildSchemaIntrospectionSql,
  buildTablePreviewSql,
  isRemoteDuckdbUrl,
  isWasmCompatibleDatabase,
  normalizeQuackUriInput,
  resolveQuackDisableSsl,
  shouldSelectWorksheetBeforeImport,
  shouldSkipExtensionLoadForWasm,
} from "@/components/connect-data-dialog";

describe("ConnectDataDialog runtime source support", () => {
  test("allows HTTPFS in the WASM picker", () => {
    expect(isWasmCompatibleDatabase("local-file")).toBe(true);
    expect(isWasmCompatibleDatabase("httpfs")).toBe(true);
    expect(isWasmCompatibleDatabase("quack")).toBe(false);
  });

  test("requires worksheet selection only for Bridge XLSX imports", () => {
    expect(shouldSelectWorksheetBeforeImport("workbook.xlsx", "bridge")).toBe(
      true,
    );
    expect(
      shouldSelectWorksheetBeforeImport("workbook.xlsx", "duckdb-wasm"),
    ).toBe(false);
    expect(shouldSelectWorksheetBeforeImport("data.csv", "bridge")).toBe(false);
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
    expect(shouldSkipExtensionLoadForWasm("httpfs")).toBe(true);
    expect(shouldSkipExtensionLoadForWasm("quack")).toBe(false);
  });

  test("accepts HTTPS URLs for HTTPFS connections", () => {
    expect(isRemoteDuckdbUrl("https://data.example.com/private.duckdb")).toBe(
      true,
    );
    expect(isRemoteDuckdbUrl("http://localhost:8000/private.duckdb")).toBe(
      true,
    );
    expect(isRemoteDuckdbUrl("ftp://data.example.com/private.duckdb")).toBe(
      false,
    );
  });

  test("builds HTTP bearer secrets for HTTPS URLs", () => {
    expect(
      buildRemoteDuckdbSecretStatement({
        url: "https://data.example.com/private.duckdb",
        httpAuthMode: "bearer",
        httpBearerToken: "token-123",
      }),
    ).toBe(
      `CREATE OR REPLACE SECRET (TYPE http, SCOPE 'https://data.example.com/private.duckdb', BEARER_TOKEN 'token-123');`,
    );
  });

  test("builds custom HTTP header secrets for HTTPS URLs", () => {
    expect(
      buildRemoteDuckdbSecretStatement({
        url: "https://data.example.com/private.duckdb",
        httpAuthMode: "header",
        httpHeaderName: "X-API-Key",
        httpHeaderValue: "secret-key",
      }),
    ).toBe(
      `CREATE OR REPLACE SECRET (TYPE http, SCOPE 'https://data.example.com/private.duckdb', EXTRA_HTTP_HEADERS MAP {'X-API-Key': 'secret-key'});`,
    );
  });

  test("builds S3-compatible secrets for object-store URLs", () => {
    expect(
      buildRemoteDuckdbSecretStatement({
        url: "r2://bucket/private.duckdb",
        s3KeyId: "key-id",
        s3Secret: "secret",
        s3Region: "auto",
        s3Endpoint: "account.r2.cloudflarestorage.com",
      }),
    ).toBe(
      `CREATE OR REPLACE SECRET (TYPE r2, KEY_ID 'key-id', SECRET 'secret', REGION 'auto', ENDPOINT 'account.r2.cloudflarestorage.com');`,
    );
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
        limit: 20,
      }),
    ).toBe(
      `SELECT table_name FROM "station".query('SELECT table_name FROM information_schema.tables WHERE table_schema = ''main'' AND table_type = ''BASE TABLE'' ORDER BY table_name LIMIT 20')`,
    );
  });
});
