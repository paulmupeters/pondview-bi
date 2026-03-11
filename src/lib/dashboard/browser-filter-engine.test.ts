import { describe, expect, test } from "bun:test";
import {
  buildMaterializationTableRefs,
  executeDashboardChartsWithFilters,
  listMaterializedTablesForBackend,
  loadDashboardDimensionValues,
} from "@/lib/dashboard/browser-filter-engine";
import type { Filter } from "@/lib/types/filters";
import type { DbDashboardChart } from "@/lib/workspace/dashboard-repo";

function createChart(input: {
  id: string;
  dashboardId?: string;
  sql: string;
  sqlBackend?: DbDashboardChart["sqlBackend"];
}): DbDashboardChart {
  const now = Date.now();
  return {
    id: input.id,
    dashboardId: input.dashboardId ?? "dashboard-1",
    title: null,
    description: null,
    sql: input.sql,
    dbIdentifier: null,
    sqlBackend: input.sqlBackend ?? null,
    chartConfigJson: "{}",
    semanticQueryJson: null,
    exploreName: null,
    position: 0,
    createdAt: now,
    updatedAt: now,
  };
}

describe("browser-filter-engine", () => {
  test("builds materialization table refs from SQL references and join defs", () => {
    const refs = buildMaterializationTableRefs(
      [
        {
          sql: `SELECT * FROM "main"."orders" o JOIN "analytics"."items" i ON o.id = i.order_id`,
        },
      ],
      [
        {
          leftTable: "orders",
          leftColumn: "customer_id",
          rightTable: "customers",
          rightColumn: "id",
          type: "left",
        },
      ],
    );

    expect(refs).toEqual([
      {
        tableName: "customers",
        sourceReference: '"customers"',
      },
      {
        tableName: "items",
        sourceReference: '"analytics"."items"',
      },
      {
        tableName: "orders",
        sourceReference: '"main"."orders"',
      },
    ]);
  });

  test("falls back to raw chart SQL when filtered execution fails", async () => {
    const runtimeSqlCalls: string[] = [];
    const chart = createChart({
      id: "chart-1",
      sql: "SELECT * FROM orders",
    });

    const filters: Filter[] = [
      {
        field: "orders.region",
        op: "eq",
        values: ["EMEA"],
      },
    ];

    const result = await executeDashboardChartsWithFilters(
      {
        dashboardId: "dashboard-1",
        charts: [chart],
        dashboardFilters: filters,
        chartFiltersById: {},
      },
      {
        resolveBackend: () => "duckdb-wasm",
        resolveRuntimeFingerprint: async () => "duckdb-wasm:local",
        readJoinDefs: () => [],
        listCharts: async () => [chart],
        getMaterializationCache: () => new Map(),
        runRuntimeSql: async (sql: string) => {
          runtimeSqlCalls.push(sql);
          if (sql.includes('WITH "__filtered_base"')) {
            throw new Error("filtered execution failed");
          }
          return [];
        },
        runChartSql: async () => [{ source: "fallback" }],
      },
    );

    expect(runtimeSqlCalls.some((sql) => sql.includes('"mat"."orders"'))).toBe(
      true,
    );
    expect(
      runtimeSqlCalls.some((sql) =>
        sql.includes(
          'CREATE OR REPLACE VIEW "mat"."orders" AS SELECT * FROM orders',
        ),
      ),
    ).toBe(true);
    expect(
      runtimeSqlCalls.some((sql) =>
        sql.includes('CREATE OR REPLACE TABLE "mat"."orders"'),
      ),
    ).toBe(false);
    expect(
      runtimeSqlCalls.some((sql) => sql.includes('WITH "__filtered_base"')),
    ).toBe(true);
    expect(result.rowsByChartId[chart.id]).toEqual([{ source: "fallback" }]);
    expect(result.metadataByChartId[chart.id]).toEqual({
      filtersApplied: false,
      appliedFiltersCount: 0,
      skippedFilters: [],
    });
  });

  test("handles partial materialization failures and still falls back cleanly", async () => {
    const runtimeSqlCalls: string[] = [];
    const chart = createChart({
      id: "chart-1",
      sql: "SELECT customer_id, SUM(amount) FROM orders GROUP BY customer_id",
    });

    const result = await executeDashboardChartsWithFilters(
      {
        dashboardId: "dashboard-1",
        charts: [chart],
        dashboardFilters: [
          {
            field: "customers.segment",
            op: "eq",
            values: ["Enterprise"],
          },
        ],
        chartFiltersById: {},
      },
      {
        resolveBackend: () => "duckdb-wasm",
        resolveRuntimeFingerprint: async () => "duckdb-wasm:local",
        readJoinDefs: () => [
          {
            leftTable: "orders",
            leftColumn: "customer_id",
            rightTable: "customers",
            rightColumn: "id",
            type: "left",
          },
        ],
        listCharts: async () => [chart],
        getMaterializationCache: () => new Map(),
        runRuntimeSql: async (sql: string) => {
          runtimeSqlCalls.push(sql);

          if (sql.includes('CREATE OR REPLACE VIEW "mat"."customers"')) {
            throw new Error("customers materialization failed");
          }

          if (sql.includes('WITH "__filtered_base"')) {
            throw new Error("filtered execution failed");
          }

          return [];
        },
        runChartSql: async () => [{ source: "raw" }],
      },
    );

    expect(
      runtimeSqlCalls.some((sql) =>
        sql.includes('CREATE OR REPLACE VIEW "mat"."customers"'),
      ),
    ).toBe(true);
    expect(result.rowsByChartId[chart.id]).toEqual([{ source: "raw" }]);
    expect(result.metadataByChartId[chart.id].filtersApplied).toBe(false);
  });

  test("dimension values exclude self-filter and include search clause", async () => {
    const runtimeSqlCalls: string[] = [];
    const chart = createChart({
      id: "chart-1",
      sql: "SELECT * FROM orders",
    });

    const values = await loadDashboardDimensionValues(
      {
        dashboardId: "dashboard-1",
        field: "orders.region",
        filters: [
          {
            field: "orders.region",
            op: "eq",
            values: ["EMEA"],
          },
          {
            field: "orders.amount",
            op: "gt",
            values: [100],
          },
        ],
        search: "eme",
      },
      {
        resolveBackend: () => "duckdb-wasm",
        resolveRuntimeFingerprint: async () => "duckdb-wasm:local",
        readJoinDefs: () => [],
        listCharts: async () => [chart],
        getMaterializationCache: () => new Map(),
        runChartSql: async () => [],
        runRuntimeSql: async (sql: string) => {
          runtimeSqlCalls.push(sql);
          if (sql.includes('SELECT DISTINCT "value"')) {
            return [{ value: "EMEA" }, { value: "APAC" }];
          }
          return [];
        },
      },
    );

    const valueQuery = runtimeSqlCalls.find((sql) =>
      sql.includes('SELECT DISTINCT "value"'),
    );

    expect(valueQuery).toBeDefined();
    expect(valueQuery).toContain('b."amount" > 100');
    expect(valueQuery).toContain("ILIKE '%eme%'");
    expect(valueQuery).not.toContain("= 'EMEA'");
    expect(values).toEqual([
      { value: "EMEA", label: "EMEA" },
      { value: "APAC", label: "APAC" },
    ]);
  });

  test("does not reuse cached aliases across runtime fingerprints", async () => {
    const cache = new Map();
    const runtimeSqlCalls: string[] = [];
    const chart = createChart({
      id: "chart-1",
      sql: "SELECT * FROM orders",
    });
    const filters: Filter[] = [
      {
        field: "orders.region",
        op: "eq",
        values: ["EMEA"],
      },
    ];

    await executeDashboardChartsWithFilters(
      {
        dashboardId: "dashboard-1",
        charts: [chart],
        dashboardFilters: filters,
        chartFiltersById: {},
      },
      {
        resolveBackend: () => "duckdb-http",
        resolveRuntimeFingerprint: async () => "duckdb-http:alpha:8080",
        readJoinDefs: () => [],
        listCharts: async () => [chart],
        getMaterializationCache: () => cache,
        runRuntimeSql: async (sql: string) => {
          runtimeSqlCalls.push(sql);
          return [];
        },
        runChartSql: async () => [],
      },
    );

    await executeDashboardChartsWithFilters(
      {
        dashboardId: "dashboard-1",
        charts: [chart],
        dashboardFilters: filters,
        chartFiltersById: {},
      },
      {
        resolveBackend: () => "duckdb-http",
        resolveRuntimeFingerprint: async () => "duckdb-http:beta:8080",
        readJoinDefs: () => [],
        listCharts: async () => [chart],
        getMaterializationCache: () => cache,
        runRuntimeSql: async (sql: string) => {
          runtimeSqlCalls.push(sql);
          return [];
        },
        runChartSql: async () => [],
      },
    );

    expect(
      runtimeSqlCalls.filter((sql) =>
        sql.includes('CREATE OR REPLACE VIEW "mat"."orders"'),
      ).length,
    ).toBe(2);
  });

  test("lists view aliases as materialized tables", async () => {
    const runtimeSqlCalls: string[] = [];

    const tables = await listMaterializedTablesForBackend("duckdb-wasm", {
      runRuntimeSql: async (sql: string) => {
        runtimeSqlCalls.push(sql);
        return [{ table_name: "orders" }, { table_name: "customers" }];
      },
    });

    expect(runtimeSqlCalls[0]).toContain("SELECT DISTINCT table_name");
    expect(runtimeSqlCalls[0]).not.toContain("table_type = 'BASE TABLE'");
    expect(tables).toEqual(["orders", "customers"]);
  });

  test("prefers a chart's stored backend over the active runtime", async () => {
    const backendCalls: string[] = [];
    const chart = createChart({
      id: "chart-1",
      sql: "SELECT * FROM customer",
      sqlBackend: "duckdb-http",
    });

    const result = await executeDashboardChartsWithFilters(
      {
        dashboardId: "dashboard-1",
        charts: [chart],
        dashboardFilters: [],
        chartFiltersById: {},
      },
      {
        resolveBackend: () => "duckdb-wasm",
        readJoinDefs: () => [],
        runRuntimeSql: async () => [],
        runChartSql: async (_chart, backend) => {
          backendCalls.push(backend);
          return [{ source: backend }];
        },
      },
    );

    expect(backendCalls).toEqual(["duckdb-http"]);
    expect(result.backend).toBe("duckdb-http");
    expect(result.rowsByChartId[chart.id]).toEqual([{ source: "duckdb-http" }]);
  });
});
