import { describe, expect, test } from "bun:test";
import {
  assertWasmCompatibleDbIdentifier,
  classifyDbIdentifier,
  DEFAULT_WASM_DB_IDENTIFIER,
  resolveSqlBackend,
} from "@/lib/sql/sql-runtime";

describe("resolveSqlBackend", () => {
  test("uses duckdb-wasm when bridge health is offline", () => {
    const backend = resolveSqlBackend(
      { backendPreference: "auto" },
      { hasBridgeSecret: () => true, getBridgeHealthStatus: () => "offline" },
    );

    expect(backend).toBe("duckdb-wasm");
  });

  test("uses bridge only when secret exists and bridge is online", () => {
    const backend = resolveSqlBackend(
      { backendPreference: "auto" },
      { hasBridgeSecret: () => true, getBridgeHealthStatus: () => "online" },
    );

    expect(backend).toBe("bridge");
  });

  test("respects explicit backend preference with availability guard", () => {
    expect(
      resolveSqlBackend(
        { backendPreference: "duckdb-wasm" },
        { hasBridgeSecret: () => true, getBridgeHealthStatus: () => "online" },
      ),
    ).toBe("duckdb-wasm");

    expect(
      resolveSqlBackend(
        { backendPreference: "bridge" },
        { hasBridgeSecret: () => true, getBridgeHealthStatus: () => "offline" },
      ),
    ).toBe("duckdb-wasm");
  });
});

describe("identifier classification", () => {
  test("accepts local wasm identifiers including legacy default", () => {
    expect(classifyDbIdentifier()).toBe("local-wasm");
    expect(classifyDbIdentifier(DEFAULT_WASM_DB_IDENTIFIER)).toBe("local-wasm");
    expect(classifyDbIdentifier("md:my_db")).toBe("local-wasm");
  });

  test("classifies bridge-backed and opaque identifiers", () => {
    expect(classifyDbIdentifier("postgresql://demo:pw@localhost:5432/demo")).toBe(
      "bridge-remote",
    );
    expect(classifyDbIdentifier("connection-prod-east-01")).toBe("unknown");
  });
});

describe("assertWasmCompatibleDbIdentifier", () => {
  test("rejects external identifiers", () => {
    expect(() =>
      assertWasmCompatibleDbIdentifier("postgresql://demo:pw@localhost:5432/demo"),
    ).toThrow("Switch runtime to Bridge");
  });

  test("rejects unknown identifiers with actionable message", () => {
    expect(() => assertWasmCompatibleDbIdentifier("prod-analytics")).toThrow(
      "cannot resolve database identifier",
    );
  });
});
