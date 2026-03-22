import { describe, expect, test } from "bun:test";
import {
  assertWasmCompatibleDbIdentifier,
  classifyDbIdentifier,
  DEFAULT_WASM_DB_IDENTIFIER,
  type RuntimeDeps,
  resolveSelectedSqlBackend,
  resolveSqlBackend,
} from "@/lib/sql/sql-runtime";

const AUTH_REQUIRED_BRIDGE = {
  host: "127.0.0.1",
  port: 4386,
  requiresAuth: true,
} as const;

const OPEN_BRIDGE = {
  host: "127.0.0.1",
  port: 4386,
  requiresAuth: false,
} as const;

function createRuntimeDeps(overrides: Partial<RuntimeDeps> = {}): RuntimeDeps {
  return {
    hasBridgeSecret: () => false,
    getBridgeHealthStatus: () => "offline",
    getBridgeConfig: () => null,
    hasDuckDbHttpConfig: () => false,
    getDuckDbHttpHealthStatus: () => "offline",
    ...overrides,
  };
}

describe("resolveSqlBackend", () => {
  test("uses duckdb-wasm when bridge health is offline", () => {
    const backend = resolveSqlBackend(
      {
        backendPreference: "auto",
      },
      createRuntimeDeps({
        hasBridgeSecret: () => true,
        getBridgeConfig: () => AUTH_REQUIRED_BRIDGE,
      }),
    );

    expect(backend).toBe("duckdb-wasm");
  });

  test("uses bridge only when secret exists and bridge is online", () => {
    const backend = resolveSqlBackend(
      {
        backendPreference: "auto",
      },
      createRuntimeDeps({
        hasBridgeSecret: () => true,
        getBridgeHealthStatus: () => "online",
        getBridgeConfig: () => AUTH_REQUIRED_BRIDGE,
      }),
    );

    expect(backend).toBe("bridge");
  });

  test("keeps wasm active while bridge is discoverable but auth is still required", () => {
    const backend = resolveSqlBackend(
      {
        backendPreference: "auto",
      },
      createRuntimeDeps({
        hasBridgeSecret: () => false,
        getBridgeHealthStatus: () => "online",
        getBridgeConfig: () => AUTH_REQUIRED_BRIDGE,
      }),
    );

    expect(backend).toBe("duckdb-wasm");
  });

  test("uses bridge automatically when auth is not required", () => {
    const backend = resolveSqlBackend(
      {
        backendPreference: "auto",
      },
      createRuntimeDeps({
        getBridgeHealthStatus: () => "online",
        getBridgeConfig: () => OPEN_BRIDGE,
      }),
    );

    expect(backend).toBe("bridge");
  });

  test("respects explicit backend preference with execution guard", () => {
    expect(
      resolveSqlBackend(
        { backendPreference: "duckdb-wasm" },
        createRuntimeDeps({
          hasBridgeSecret: () => true,
          getBridgeHealthStatus: () => "online",
          getBridgeConfig: () => AUTH_REQUIRED_BRIDGE,
          hasDuckDbHttpConfig: () => true,
          getDuckDbHttpHealthStatus: () => "online",
        }),
      ),
    ).toBe("duckdb-wasm");

    expect(
      resolveSqlBackend(
        { backendPreference: "bridge" },
        createRuntimeDeps({
          hasBridgeSecret: () => false,
          getBridgeHealthStatus: () => "online",
          getBridgeConfig: () => AUTH_REQUIRED_BRIDGE,
          hasDuckDbHttpConfig: () => true,
          getDuckDbHttpHealthStatus: () => "online",
        }),
      ),
    ).toBe("duckdb-wasm");

    expect(
      resolveSqlBackend(
        { backendPreference: "duckdb-http" },
        createRuntimeDeps({
          hasDuckDbHttpConfig: () => true,
        }),
      ),
    ).toBe("duckdb-http");

    expect(
      resolveSqlBackend(
        { backendPreference: "duckdb-http" },
        createRuntimeDeps(),
      ),
    ).toBe("duckdb-wasm");
  });

  test("forces duckdb-wasm for local wasm identifiers even when remote is preferred", () => {
    expect(
      resolveSqlBackend(
        {
          backendPreference: "bridge",
          dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
        },
        createRuntimeDeps({
          hasBridgeSecret: () => true,
          getBridgeHealthStatus: () => "online",
          getBridgeConfig: () => AUTH_REQUIRED_BRIDGE,
          hasDuckDbHttpConfig: () => true,
          getDuckDbHttpHealthStatus: () => "online",
        }),
      ),
    ).toBe("duckdb-wasm");
  });
});

describe("resolveSelectedSqlBackend", () => {
  test("defaults selection to bridge when the bridge is discoverable", () => {
    const backend = resolveSelectedSqlBackend(
      {
        backendPreference: "auto",
      },
      createRuntimeDeps({
        getBridgeHealthStatus: () => "online",
        getBridgeConfig: () => AUTH_REQUIRED_BRIDGE,
      }),
    );

    expect(backend).toBe("bridge");
  });

  test("preserves explicit bridge selection when auth is missing", () => {
    const backend = resolveSelectedSqlBackend(
      {
        backendPreference: "bridge",
      },
      createRuntimeDeps({
        getBridgeHealthStatus: () => "online",
        getBridgeConfig: () => AUTH_REQUIRED_BRIDGE,
      }),
    );

    expect(backend).toBe("bridge");
  });
});

describe("identifier classification", () => {
  test("accepts local wasm identifiers including legacy default", () => {
    expect(classifyDbIdentifier()).toBe("local-wasm");
    expect(classifyDbIdentifier(DEFAULT_WASM_DB_IDENTIFIER)).toBe("local-wasm");
    expect(classifyDbIdentifier("md:my_db")).toBe("local-wasm");
  });

  test("classifies bridge-backed and opaque identifiers", () => {
    expect(
      classifyDbIdentifier("postgresql://demo:pw@localhost:5432/demo"),
    ).toBe("bridge-remote");
    expect(classifyDbIdentifier("connection-prod-east-01")).toBe("unknown");
  });
});

describe("assertWasmCompatibleDbIdentifier", () => {
  test("rejects external identifiers", () => {
    expect(() =>
      assertWasmCompatibleDbIdentifier(
        "postgresql://demo:pw@localhost:5432/demo",
      ),
    ).toThrow("Switch runtime to Bridge");
  });

  test("rejects unknown identifiers with actionable message", () => {
    expect(() => assertWasmCompatibleDbIdentifier("prod-analytics")).toThrow(
      "cannot resolve database identifier",
    );
  });
});
