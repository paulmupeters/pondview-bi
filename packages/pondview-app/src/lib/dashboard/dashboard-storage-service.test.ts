import { describe, expect, test } from "bun:test";
import {
  decodeAttachedDashboardId,
  encodeAttachedDashboardId,
  getInitialChartLayout,
  qualifyMetadataSqlForCatalog,
  resolveDashboardExternalConnection,
  resolveDashboardSourceMode,
  resolveJoinDefsForNewDashboard,
  resolveTargetForSource,
} from "@/lib/dashboard/dashboard-storage-service";
import { DEFAULT_WASM_DB_IDENTIFIER } from "@/lib/sql/sql-runtime";
import type { WorkspaceChart } from "@/lib/workspace/workspace-db";

function chartLayout(
  input: Partial<
    Pick<
      WorkspaceChart,
      "position" | "layoutX" | "layoutY" | "layoutW" | "layoutH"
    >
  >,
): WorkspaceChart {
  return {
    id: `chart_${input.position ?? 0}`,
    dashboardId: "dashboard_1",
    title: null,
    description: null,
    sql: "SELECT 1",
    dbIdentifier: null,
    chartConfigJson: "{}",
    semanticQueryJson: null,
    exploreName: null,
    position: input.position ?? 0,
    layoutX: input.layoutX ?? null,
    layoutY: input.layoutY ?? null,
    layoutW: input.layoutW ?? null,
    layoutH: input.layoutH ?? null,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("attached dashboard ids", () => {
  test("round-trips catalog-qualified dashboard ids", () => {
    const encoded = encodeAttachedDashboardId({
      backend: "bridge",
      dbIdentifier: null,
      catalog: "sample-data",
      dashboardId: "executive-overview",
    });

    expect(decodeAttachedDashboardId(encoded)).toEqual({
      backend: "bridge",
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
      sqlBackend: "bridge",
    });

    expect(target.kind).toBe("runtime-default");
    expect(target.dbIdentifier).toBeNull();
    expect(target.sqlBackend).toBe("bridge");
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

describe("getInitialChartLayout", () => {
  test("places new charts beside existing charts when the row has room", () => {
    expect(
      getInitialChartLayout(
        [
          chartLayout({
            position: 0,
            layoutX: 0,
            layoutY: 0,
            layoutW: 1,
            layoutH: 3,
          }),
          chartLayout({
            position: 1,
            layoutX: 1,
            layoutY: 0,
            layoutW: 1,
            layoutH: 3,
          }),
        ],
        4,
        "{}",
      ),
    ).toEqual({ layoutX: 2, layoutY: 0, layoutW: 1, layoutH: 3 });
  });

  test("starts a new row when the requested width does not fit", () => {
    expect(
      getInitialChartLayout(
        [
          chartLayout({
            position: 0,
            layoutX: 0,
            layoutY: 0,
            layoutW: 3,
            layoutH: 3,
          }),
          chartLayout({
            position: 1,
            layoutX: 3,
            layoutY: 0,
            layoutW: 1,
            layoutH: 3,
          }),
        ],
        4,
        JSON.stringify({ colSpan: 2 }),
      ),
    ).toEqual({ layoutX: 0, layoutY: 3, layoutW: 2, layoutH: 3 });
  });
});

describe("resolveDashboardExternalConnection", () => {
  test("does not classify runtime-default remote dashboards as external sources", () => {
    expect(
      resolveDashboardExternalConnection({
        sourceDbIdentifier: null,
        targetSqlBackend: "bridge",
      }),
    ).toBeNull();
  });

  test("keeps true external attachments on the materialization path", () => {
    expect(
      resolveDashboardExternalConnection({
        sourceDbIdentifier: "sqlite:/tmp/warehouse.db",
        targetSqlBackend: "bridge",
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
        targetSqlBackend: "bridge",
        probeRuntimeExecution: async () => true,
      }),
    ).resolves.toBe("runtime-direct");
  });

  test("falls back to external materialization when the runtime probe fails", async () => {
    await expect(
      resolveDashboardSourceMode({
        sourceDbIdentifier:
          "host=db.example.test port=5432 user=admin password=secret dbname=main",
        targetSqlBackend: "bridge",
        probeRuntimeExecution: async () => false,
      }),
    ).resolves.toBe("external-materialize");
  });
});

describe("qualifyMetadataSqlForCatalog", () => {
  test("qualifies Pondview metadata schema refs when the catalog is also pondview", () => {
    expect(
      qualifyMetadataSqlForCatalog(
        `CREATE SCHEMA IF NOT EXISTS "pondview";
         INSERT OR REPLACE INTO "pondview".dashboards (id) VALUES ('dash_1');
         SELECT * FROM "pondview"."dashboards";
         DELETE FROM "pondview".dashboard_charts WHERE dashboard_id = 'dash_1';`,
        "pondview",
      ),
    ).toBe(
      `CREATE SCHEMA IF NOT EXISTS "pondview"."pondview";
         INSERT OR REPLACE INTO "pondview"."pondview".dashboards (id) VALUES ('dash_1');
         SELECT * FROM "pondview"."pondview"."dashboards";
         DELETE FROM "pondview"."pondview".dashboard_charts WHERE dashboard_id = 'dash_1';`,
    );
  });

  test("does not qualify catalog references inside stored SQL string literals", () => {
    expect(
      qualifyMetadataSqlForCatalog(
        `INSERT OR REPLACE INTO "pondview".dashboard_charts (id, sql)
         VALUES ('chart_1', 'SELECT * FROM "pondview"."main"."orders" WHERE note = ''"pondview".dashboard_charts'';');`,
        "pondview",
      ),
    ).toBe(
      `INSERT OR REPLACE INTO "pondview"."pondview".dashboard_charts (id, sql)
         VALUES ('chart_1', 'SELECT * FROM "pondview"."main"."orders" WHERE note = ''"pondview".dashboard_charts'';');`,
    );
  });

  test("leaves metadata refs unchanged when no catalog qualification is needed", () => {
    expect(
      qualifyMetadataSqlForCatalog(
        `INSERT OR REPLACE INTO "pondview".dashboards (id) VALUES ('dash_1');`,
        null,
      ),
    ).toBe(
      `INSERT OR REPLACE INTO "pondview".dashboards (id) VALUES ('dash_1');`,
    );
  });
});
