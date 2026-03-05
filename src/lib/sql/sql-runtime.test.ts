import { describe, expect, test } from "bun:test";
import {
  assertWasmCompatibleDbIdentifier,
  DEFAULT_WASM_DB_IDENTIFIER,
  resolveSqlBackend,
} from "@/lib/sql/sql-runtime";

describe("resolveSqlBackend", () => {
  test("uses duckdb-wasm when bridge secret is missing", () => {
    const backend = resolveSqlBackend(
      { backendPreference: "auto" },
      { hasBridgeSecret: () => false },
    );

    expect(backend).toBe("duckdb-wasm");
  });

  test("uses bridge when bridge secret exists", () => {
    const backend = resolveSqlBackend(
      { backendPreference: "auto" },
      { hasBridgeSecret: () => true },
    );

    expect(backend).toBe("bridge");
  });

  test("respects explicit backend preference", () => {
    expect(
      resolveSqlBackend(
        { backendPreference: "duckdb-wasm" },
        { hasBridgeSecret: () => true },
      ),
    ).toBe("duckdb-wasm");

    expect(
      resolveSqlBackend(
        { backendPreference: "bridge" },
        { hasBridgeSecret: () => false },
      ),
    ).toBe("duckdb-wasm");
  });
});

describe("assertWasmCompatibleDbIdentifier", () => {
  test("accepts local wasm identifiers including legacy default", () => {
    expect(() => assertWasmCompatibleDbIdentifier()).not.toThrow();
    expect(() =>
      assertWasmCompatibleDbIdentifier(DEFAULT_WASM_DB_IDENTIFIER),
    ).not.toThrow();
    expect(() => assertWasmCompatibleDbIdentifier("md:my_db")).not.toThrow();
  });

  test("rejects external identifiers", () => {
    expect(() =>
      assertWasmCompatibleDbIdentifier("postgresql://demo:pw@localhost:5432/demo"),
    ).toThrow();
  });
});
