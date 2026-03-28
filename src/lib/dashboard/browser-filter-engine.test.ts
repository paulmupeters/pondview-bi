import { describe, expect, test } from "bun:test";
import {
  buildMaterializationTableRefs,
  executeDashboardChartsWithFilters,
  getRelevantTablesForChart,
  listMaterializedTablesForBackend,
  loadDashboardDimensions,
  loadDashboardDimensionValues,
} from "@/lib/dashboard/browser-filter-engine";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import type { Filter } from "@/lib/types/filters";
import type { DbDashboardChart } from "@/lib/workspace/dashboard-repo";

function createChart(input: {
  id: string;
  dashboardId?: string;
  sql: string;
  catalogContext?: string | null;
  sqlBackend?: DbDashboardChart["sqlBackend"];
  dbIdentifier?: string | null;
  sourceDescriptor?: DbDashboardChart["sourceDescriptor"];
}): DbDashboardChart {
  const now = Date.now();
  return {
    id: input.id,
    dashboardId: input.dashboardId ?? "dashboard-1",
    title: null,
    description: null,
    sql: input.sql,
    dbIdentifier: input.dbIdentifier ?? null,
    catalogContext: input.catalogContext ?? null,
    sqlBackend: input.sqlBackend ?? null,
    chartConfigJson: "{}",
    semanticQueryJson: null,
    exploreName: null,
    position: 0,
    createdAt: now,
    updatedAt: now,
    sourceDescriptor: input.sourceDescriptor ?? null,
    sourceDescriptorJson: null,
    snapshotId: null,
    sourceSql: input.sql,
    sourceDbIdentifier: input.dbIdentifier ?? null,
    sourceCatalogContext: input.catalogContext ?? null,
    sourceSqlBackend: input.sqlBackend ?? null,
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
        catalogContext: null,
        mode: "live",
        sourceDescriptor: {
          kind: "runtime",
          runtimeBackend: "duckdb-wasm",
          dbIdentifier: "wasm:local",
          catalogContext: null,
        },
      },
      {
        tableName: "items",
        sourceReference: '"analytics"."items"',
        catalogContext: null,
        mode: "live",
        sourceDescriptor: {
          kind: "runtime",
          runtimeBackend: "duckdb-wasm",
          dbIdentifier: "wasm:local",
          catalogContext: null,
        },
      },
      {
        tableName: "orders",
        sourceReference: '"main"."orders"',
        catalogContext: null,
        mode: "live",
        sourceDescriptor: {
          kind: "runtime",
          runtimeBackend: "duckdb-wasm",
          dbIdentifier: "wasm:local",
          catalogContext: null,
        },
      },
    ]);
  });

  test("collects relevant tables across multi-hop joins", () => {
    const tables = getRelevantTablesForChart("SELECT * FROM orders", [
      {
        leftTable: "orders",
        leftColumn: "customer_id",
        rightTable: "customers",
        rightColumn: "id",
        type: "left",
      },
      {
        leftTable: "customers",
        leftColumn: "region_id",
        rightTable: "regions",
        rightColumn: "id",
        type: "left",
      },
    ]);

    expect(Array.from(tables).sort()).toEqual([
      "customers",
      "orders",
      "regions",
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
        readJoinDefs: async () => [],
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

    expect(
      runtimeSqlCalls.some((sql) => sql.includes('"pondview_exec"."orders"')),
    ).toBe(true);
    expect(
      runtimeSqlCalls.some((sql) =>
        /CREATE OR REPLACE VIEW "pondview_exec"\."orders" AS SELECT \* FROM "main"\.orders;?/.test(
          sql,
        ),
      ),
    ).toBe(true);
    expect(
      runtimeSqlCalls.some((sql) =>
        sql.includes('CREATE OR REPLACE TABLE "pondview_exec"."orders"'),
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
        readJoinDefs: async () => [
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
        sql.includes('CREATE OR REPLACE VIEW "pondview_exec"."customers"'),
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
        readJoinDefs: async () => [],
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
        readJoinDefs: async () => [],
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
        readJoinDefs: async () => [],
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
        sql.includes(
          'CREATE OR REPLACE VIEW "pondview_exec"."orders"',
        ),
      ).length,
    ).toBe(2);
  });

  test("dedupes concurrent materialization for the same dashboard signature", async () => {
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

    await Promise.all([
      executeDashboardChartsWithFilters(
        {
          dashboardId: "dashboard-1",
          charts: [chart],
          dashboardFilters: filters,
          chartFiltersById: {},
        },
        {
          resolveBackend: () => "duckdb-http",
          resolveRuntimeFingerprint: async () => "duckdb-http:shared:8080",
          readJoinDefs: async () => [],
          listCharts: async () => [chart],
          getMaterializationCache: () => cache,
          runRuntimeSql: async (sql: string) => {
            runtimeSqlCalls.push(sql);
            return [];
          },
          runChartSql: async () => [],
        },
      ),
      executeDashboardChartsWithFilters(
        {
          dashboardId: "dashboard-1",
          charts: [chart],
          dashboardFilters: filters,
          chartFiltersById: {},
        },
        {
          resolveBackend: () => "duckdb-http",
          resolveRuntimeFingerprint: async () => "duckdb-http:shared:8080",
          readJoinDefs: async () => [],
          listCharts: async () => [chart],
          getMaterializationCache: () => cache,
          runRuntimeSql: async (sql: string) => {
            runtimeSqlCalls.push(sql);
            return [];
          },
          runChartSql: async () => [],
        },
      ),
    ]);

    expect(
      runtimeSqlCalls.filter((sql) =>
        sql.includes(
          'CREATE OR REPLACE VIEW "pondview_exec"."orders"',
        ),
      ).length,
    ).toBe(1);
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
        readJoinDefs: async () => [],
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

  test("uses chart catalog context for alias creation but not alias-backed execution", async () => {
    const runtimeSqlCalls: Array<{
      sql: string;
      catalogContext?: string | null;
    }> = [];
    const chart = createChart({
      id: "chart-ctx",
      sql: "SELECT * FROM analytics.events",
      catalogContext: "warehouse",
    });

    await executeDashboardChartsWithFilters(
      {
        dashboardId: "dashboard-ctx",
        charts: [chart],
        dashboardFilters: [
          {
            field: "events.kind",
            op: "eq",
            values: ["signup"],
          },
        ],
        chartFiltersById: {},
      },
      {
        resolveBackend: () => "duckdb-http",
        resolveRuntimeFingerprint: async () => "duckdb-http:test",
        readJoinDefs: async () => [],
        listCharts: async () => [chart],
        getMaterializationCache: () => new Map(),
        runRuntimeSql: async (
          sql: string,
          _backend: SqlBackend,
          catalogContext?: string | null,
        ) => {
          runtimeSqlCalls.push({ sql, catalogContext });
          return [];
        },
      },
    );

    expect(
      runtimeSqlCalls.some(
        (call) =>
          call.sql.includes(
            'CREATE OR REPLACE VIEW "pondview_exec"."events"',
          ) &&
          call.catalogContext === "warehouse",
      ),
    ).toBe(true);
    expect(
      runtimeSqlCalls.some(
        (call) =>
          call.sql.includes('WITH "__filtered_base"') &&
          call.catalogContext == null,
      ),
    ).toBe(true);
  });

  test("materializes external tables through the temporary attachment catalog", async () => {
    const runtimeSqlCalls: Array<{
      sql: string;
      catalogContext?: string | null;
    }> = [];
    const chart = createChart({
      id: "chart-external",
      sql: "SELECT * FROM duck.astronomy",
      sqlBackend: "duckdb-http",
      dbIdentifier: "postgres://user:pass@localhost:5432/astronomy",
      sourceDescriptor: {
        kind: "external",
        runtimeBackend: "duckdb-http",
        dbIdentifier: "postgres://user:pass@localhost:5432/astronomy",
        catalogContext: null,
        externalType: "postgres",
      },
    });

    await executeDashboardChartsWithFilters(
      {
        dashboardId: "dashboard-external",
        charts: [chart],
        dashboardFilters: [],
        chartFiltersById: {},
      },
      {
        resolveBackend: () => "duckdb-http",
        resolveRuntimeFingerprint: async () => "duckdb-http:test",
        readJoinDefs: async () => [],
        listCharts: async () => [chart],
        getMaterializationCache: () => new Map(),
        runRuntimeSql: async (
          sql: string,
          _backend: SqlBackend,
          catalogContext?: string | null,
        ) => {
          runtimeSqlCalls.push({ sql, catalogContext });
          return [];
        },
      },
    );

    const materializationCall = runtimeSqlCalls.find((call) =>
      call.sql.includes('CREATE OR REPLACE TABLE "pondview_exec"."astronomy"'),
    );

    expect(materializationCall).toBeDefined();
    expect(materializationCall?.sql).toContain("SELECT * FROM duck.astronomy");
    expect(materializationCall?.sql).not.toContain(
      '".duck.astronomy',
    );
    expect(materializationCall?.catalogContext).toMatch(
      /^pondview_exec_source_astronomy_/,
    );
  });

  test("materializes MotherDuck tables through a temporary attachment", async () => {
    const runtimeSqlCalls: Array<{
      sql: string;
      catalogContext?: string | null;
    }> = [];
    const chart = createChart({
      id: "chart-motherduck",
      sql: "SELECT * FROM unicorns",
      sqlBackend: "duckdb-http",
      dbIdentifier: "md:analytics",
      sourceDescriptor: {
        kind: "motherduck",
        runtimeBackend: "duckdb-http",
        dbIdentifier: "md:analytics",
        catalogContext: null,
      },
    });

    await loadDashboardDimensions("dashboard-motherduck", {
      resolveBackend: () => "duckdb-http",
      resolveRuntimeFingerprint: async () => "duckdb-http:test",
      readJoinDefs: async () => [],
      listCharts: async () => [chart],
      getMaterializationCache: () => new Map(),
      runRuntimeSql: async (
        sql: string,
        _backend: SqlBackend,
        catalogContext?: string | null,
      ) => {
        runtimeSqlCalls.push({ sql, catalogContext });
        if (sql.startsWith("DESCRIBE ")) {
          return [{ column_name: "name", column_type: "VARCHAR" }];
        }
        return [];
      },
    });

    const attachCall = runtimeSqlCalls.find((call) =>
      call.sql.includes("ATTACH 'md:analytics' AS"),
    );
    expect(attachCall).toBeDefined();

    const materializationCall = runtimeSqlCalls.find((call) =>
      call.sql.includes('CREATE OR REPLACE TABLE "pondview_exec"."unicorns"'),
    );
    expect(materializationCall).toBeDefined();
    expect(materializationCall?.catalogContext ?? null).toBeNull();
    expect(materializationCall?.sql).toMatch(
      /^CREATE OR REPLACE TABLE "pondview_exec"\."unicorns" AS SELECT \* FROM "pondview_exec_source_unicorns_[^"]+"\.unicorns;$/,
    );
  });
});
