import { describe, expect, test } from "bun:test";
import {
  assertWasmCompatibleDbIdentifier,
  classifyDbIdentifier,
  DEFAULT_WASM_DB_IDENTIFIER,
  type RuntimeDeps,
  resolveDbIdentifierForSqlBackend,
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

  test("uses duckdb-wasm when bridge is unavailable", () => {
    const backend = resolveSqlBackend(
      {
        backendPreference: "auto",
      },
      createRuntimeDeps({}),
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
        }),
      ),
    ).toBe("duckdb-wasm");

    expect(
      resolveSqlBackend({ backendPreference: "bridge" }, createRuntimeDeps()),
    ).toBe("duckdb-wasm");

    expect(
      resolveSqlBackend(
        { backendPreference: "bridge" },
        createRuntimeDeps({
          hasBridgeSecret: () => true,
          getBridgeHealthStatus: () => "online",
          getBridgeConfig: () => AUTH_REQUIRED_BRIDGE,
        }),
      ),
    ).toBe("bridge");
  });

  test("treats wasm local identifiers as placeholders when a remote backend is available", () => {
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
        }),
      ),
    ).toBe("bridge");

    expect(
      resolveSqlBackend(
        {
          backendPreference: "bridge",
          dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
        },
        createRuntimeDeps({}),
      ),
    ).toBe("duckdb-wasm");
  });
});

describe("resolveSelectedSqlBackend", () => {
  test("defaults selection to bridge when the bridge is query-ready", () => {
    const backend = resolveSelectedSqlBackend(
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

  test("defaults selection to duckdb-wasm when bridge is not query-ready", () => {
    const backend = resolveSelectedSqlBackend(
      {
        backendPreference: "auto",
      },
      createRuntimeDeps({
        getBridgeHealthStatus: () => "online",
        getBridgeConfig: () => AUTH_REQUIRED_BRIDGE,
      }),
    );

    expect(backend).toBe("duckdb-wasm");
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
    ).toThrow("Switch runtime to CLI");
  });

  test("rejects unknown identifiers with actionable message", () => {
    expect(() => assertWasmCompatibleDbIdentifier("prod-analytics")).toThrow(
      "cannot resolve this database identifier",
    );
  });

  test("does not echo raw connection strings in wasm compatibility errors", () => {
    const identifier =
      "host=db.example.test port=5432 user=admin password=secret dbname=analytics";

    let message = "";
    try {
      assertWasmCompatibleDbIdentifier(identifier);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("DuckDB WASM");
    expect(message).not.toContain(identifier);
    expect(message).not.toContain("password=secret");
  });
});

describe("resolveDbIdentifierForSqlBackend", () => {
  test("uses runtime defaults for placeholder identifiers", () => {
    expect(resolveDbIdentifierForSqlBackend(undefined, "duckdb-wasm")).toBe(
      DEFAULT_WASM_DB_IDENTIFIER,
    );
    expect(
      resolveDbIdentifierForSqlBackend(DEFAULT_WASM_DB_IDENTIFIER, "bridge"),
    ).toBeUndefined();
  });

  test("preserves explicit non-placeholder identifiers", () => {
    expect(resolveDbIdentifierForSqlBackend("md:analytics", "bridge")).toBe(
      "md:analytics",
    );
  });
});
