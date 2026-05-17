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
      }),
    ).toBe("Bridge (unavailable, using DuckDB WASM)");

    expect(
      getActiveRuntimeLabel({
        selectedSqlBackend: "bridge",
        effectiveSqlBackend: "duckdb-wasm",
        isBridgeDiscoverable: true,
        isBridgeQueryReady: false,
      }),
    ).toBe("Bridge (waiting for auth, using DuckDB WASM)");
  });
});
