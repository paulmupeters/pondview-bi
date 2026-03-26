import { describe, expect, test } from "bun:test";
import { getActiveRuntimeLabel } from "@/app/settings/runtime-label";

describe("getActiveRuntimeLabel", () => {
  test("shows DuckDB WASM when it is the selected runtime", () => {
    expect(
      getActiveRuntimeLabel({
        selectedSqlBackend: "duckdb-wasm",
        effectiveSqlBackend: "duckdb-wasm",
        isBridgeDiscoverable: false,
        isBridgeQueryReady: false,
        isDuckDbHttpConfigured: false,
        duckDbHttpHealthStatus: "unknown",
      }),
    ).toBe("DuckDB WASM");
  });

  test("shows Bridge when bridge is selected and active", () => {
    expect(
      getActiveRuntimeLabel({
        selectedSqlBackend: "bridge",
        effectiveSqlBackend: "bridge",
        isBridgeDiscoverable: true,
        isBridgeQueryReady: true,
        isDuckDbHttpConfigured: false,
        duckDbHttpHealthStatus: "unknown",
      }),
    ).toBe("Bridge");
  });

  test("shows Bridge fallback reasons when WASM is active", () => {
    expect(
      getActiveRuntimeLabel({
        selectedSqlBackend: "bridge",
        effectiveSqlBackend: "duckdb-wasm",
        isBridgeDiscoverable: false,
        isBridgeQueryReady: false,
        isDuckDbHttpConfigured: false,
        duckDbHttpHealthStatus: "unknown",
      }),
    ).toBe("Bridge (unavailable, using DuckDB WASM)");

    expect(
      getActiveRuntimeLabel({
        selectedSqlBackend: "bridge",
        effectiveSqlBackend: "duckdb-wasm",
        isBridgeDiscoverable: true,
        isBridgeQueryReady: false,
        isDuckDbHttpConfigured: false,
        duckDbHttpHealthStatus: "unknown",
      }),
    ).toBe("Bridge (waiting for auth, using DuckDB WASM)");
  });

  test("shows DuckDB over HTTP when it is selected and active", () => {
    expect(
      getActiveRuntimeLabel({
        selectedSqlBackend: "duckdb-http",
        effectiveSqlBackend: "duckdb-http",
        isBridgeDiscoverable: false,
        isBridgeQueryReady: false,
        isDuckDbHttpConfigured: true,
        duckDbHttpHealthStatus: "online",
      }),
    ).toBe("DuckDB over HTTP");
  });

  test("shows DuckDB over HTTP fallback reasons when WASM is active", () => {
    expect(
      getActiveRuntimeLabel({
        selectedSqlBackend: "duckdb-http",
        effectiveSqlBackend: "duckdb-wasm",
        isBridgeDiscoverable: false,
        isBridgeQueryReady: false,
        isDuckDbHttpConfigured: false,
        duckDbHttpHealthStatus: "unknown",
      }),
    ).toBe("DuckDB over HTTP (not configured, using DuckDB WASM)");

    expect(
      getActiveRuntimeLabel({
        selectedSqlBackend: "duckdb-http",
        effectiveSqlBackend: "duckdb-wasm",
        isBridgeDiscoverable: false,
        isBridgeQueryReady: false,
        isDuckDbHttpConfigured: true,
        duckDbHttpHealthStatus: "offline",
      }),
    ).toBe("DuckDB over HTTP (unavailable, using DuckDB WASM)");

    expect(
      getActiveRuntimeLabel({
        selectedSqlBackend: "duckdb-http",
        effectiveSqlBackend: "duckdb-wasm",
        isBridgeDiscoverable: false,
        isBridgeQueryReady: false,
        isDuckDbHttpConfigured: true,
        duckDbHttpHealthStatus: "unknown",
      }),
    ).toBe("DuckDB over HTTP (pending, using DuckDB WASM)");
  });
});
