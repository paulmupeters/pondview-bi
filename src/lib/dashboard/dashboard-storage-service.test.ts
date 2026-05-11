import { describe, expect, test } from "bun:test";
import {
  decodeAttachedDashboardId,
  encodeAttachedDashboardId,
  resolveDashboardExternalConnection,
  resolveDashboardSourceMode,
  resolveJoinDefsForNewDashboard,
  resolveTargetForSource,
} from "@/lib/dashboard/dashboard-storage-service";
import { DEFAULT_WASM_DB_IDENTIFIER } from "@/lib/sql/sql-runtime";

describe("attached dashboard ids", () => {
  test("round-trips catalog-qualified dashboard ids", () => {
    const encoded = encodeAttachedDashboardId({
      backend: "duckdb-http",
      dbIdentifier: null,
      catalog: "sample-data",
      dashboardId: "executive-overview",
    });

    expect(decodeAttachedDashboardId(encoded)).toEqual({
      backend: "duckdb-http",
      dbIdentifier: null,
      catalog: "sample-data",
      dashboardId: "executive-overview",
    });
  });

  test("rejects non-attached dashboard ids", () => {
    expect(decodeAttachedDashboardId("dashboard_123")).toBeNull();
  });
});

describe("resolveTargetForSource", () => {
  test("keeps remote runtime-default dashboards on the selected remote backend", () => {
    const target = resolveTargetForSource({
      dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
      sqlBackend: "duckdb-http",
    });

    expect(target.kind).toBe("runtime-default");
    expect(target.dbIdentifier).toBeNull();
    expect(target.sqlBackend).toBe("duckdb-http");
    expect(target.storageStatus).toBe("shared");
  });

  test("keeps bridge runtime-default dashboards shared", () => {
    const target = resolveTargetForSource({
      dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
      sqlBackend: "bridge",
    });

    expect(target.kind).toBe("runtime-default");
    expect(target.storageStatus).toBe("shared");
  });

  test("keeps wasm dashboards best-effort", () => {
    const target = resolveTargetForSource({
      dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
      sqlBackend: "duckdb-wasm",
    });

    expect(target.kind).toBe("wasm-local");
    expect(target.dbIdentifier).toBe(DEFAULT_WASM_DB_IDENTIFIER);
    expect(target.sqlBackend).toBe("duckdb-wasm");
    expect(target.storageStatus).toBe("best-effort");
  });
});

describe("resolveJoinDefsForNewDashboard", () => {
  test("uses global defaults only when join defs are omitted", () => {
    expect(resolveJoinDefsForNewDashboard([])).toEqual([]);
  });

  test("deduplicates explicitly provided join defs", () => {
    expect(
      resolveJoinDefsForNewDashboard([
        {
          leftTable: "orders",
          leftColumn: "customer_id",
          rightTable: "customers",
          rightColumn: "id",
          type: "left",
        },
        {
          leftTable: "orders",
          leftColumn: "customer_id",
          rightTable: "customers",
          rightColumn: "id",
          type: "left",
        },
      ]),
    ).toEqual([
      {
        leftTable: "orders",
        leftColumn: "customer_id",
        rightTable: "customers",
        rightColumn: "id",
        type: "left",
      },
    ]);
  });
});

describe("resolveDashboardExternalConnection", () => {
  test("does not classify runtime-default remote dashboards as external sources", () => {
    expect(
      resolveDashboardExternalConnection({
        sourceDbIdentifier: null,
        targetSqlBackend: "duckdb-http",
      }),
    ).toBeNull();
  });

  test("keeps true external attachments on the materialization path", () => {
    expect(
      resolveDashboardExternalConnection({
        sourceDbIdentifier: "sqlite:/tmp/warehouse.db",
        targetSqlBackend: "duckdb-http",
      }),
    ).toEqual({
      type: "sqlite",
      identifier: "/tmp/warehouse.db",
      duckdbExtension: "sqlite",
      readOnly: true,
    });
  });
});

describe("resolveDashboardSourceMode", () => {
  test("keeps runtime-native remote queries direct when the runtime probe succeeds", async () => {
    await expect(
      resolveDashboardSourceMode({
        sourceDbIdentifier:
          "host=db.example.test port=5432 user=admin password=secret dbname=main",
        targetSqlBackend: "duckdb-http",
        probeRuntimeExecution: async () => true,
      }),
    ).resolves.toBe("runtime-direct");
  });

  test("falls back to external materialization when the runtime probe fails", async () => {
    await expect(
      resolveDashboardSourceMode({
        sourceDbIdentifier:
          "host=db.example.test port=5432 user=admin password=secret dbname=main",
        targetSqlBackend: "duckdb-http",
        probeRuntimeExecution: async () => false,
      }),
    ).resolves.toBe("external-materialize");
  });
});
