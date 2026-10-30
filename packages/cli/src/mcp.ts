import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import {
  type CallToolResult,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { BridgeQueryResponse } from "@pondview/bridge-protocol";
import { z } from "zod";
import {
  type ApplyFiltersResult,
  applyFiltersToSql,
} from "./filters/apply-filters";
import type { JoinDefinition, JoinKind } from "./filters/graph";
import { normalizeFilterPayload } from "./filters/normalize-filters";
import { findBaseTableReference } from "./filters/parse-tables";
import { FILTER_OPERATORS, type Filter } from "./filters/types";
import { BridgeProjectStore } from "./project-store";
import { DuckDbRuntime } from "./runtime/duckdb-runtime";
import { BridgeSecretStore } from "./secrets";
import {
  createProjectDatabasePath,
  resolveProjectDefaultDatabasePath,
} from "./server";

const DEFAULT_QUERY_LIMIT = 500;
// Rows shipped to the inline view in structuredContent. Larger results should
// be aggregated server-side in SQL.
const VISUAL_ROW_LIMIT = 5000;
// Rows echoed into the text result, which is all the model sees of a visual.
const VISUAL_TEXT_PREVIEW_ROWS = 20;
// Rows echoed into the text result of the query tool.
const QUERY_TEXT_PREVIEW_ROWS = 20;
const DEFAULT_SLICER_OPTION_LIMIT = 100;
const MAX_SLICER_OPTION_LIMIT = 1000;
const VISUAL_VIEW_URI = "ui://pondview/visual";
const DASHBOARD_VIEW_URI = "ui://pondview/dashboard";
const DEFAULT_BRIDGE_APP_URL = "http://127.0.0.1:17817";
const METADATA_SCHEMA = "pondview";
const HIDDEN_RUNTIME_SCHEMAS = [
  "information_schema",
  "pg_catalog",
  "pondview",
  "pondview_exec",
  "md_information_schema",
] as const;

type RuntimeTableMetadata = {
  table_catalog: string;
  table_schema: string;
  table_name: string;
  table_type: string;
  table_reference: string;
};

export interface BridgeMcpOptions {
  databasePath?: string;
  projectDir?: string;
  allowWriteSql?: boolean;
  secretsPath?: string;
  appUrl?: string;
  viewsDir?: string;
}

type BridgeMcpServerOptions = Pick<
  BridgeMcpOptions,
  "allowWriteSql" | "appUrl" | "viewsDir"
>;

type VisualInput = {
  title: string;
  description?: string;
  sql: string;
  visualType: z.infer<typeof visualTypeSchema>;
  xKey?: string;
  yKeys?: string[];
  chartConfig?: Record<string, unknown>;
};

// Mirrors VisualPayload in packages/mcp-views/src/visual/visual-payload.ts.
export type VisualPayload = {
  title: string;
  description: string | null;
  sql: string;
  visualType: z.infer<typeof visualTypeSchema>;
  config: Record<string, unknown>;
  columns: BridgeQueryResponse["columns"];
  rows: BridgeQueryResponse["rows"];
  rowCount: number;
  truncated: boolean;
  saved: { dashboardId: string; visualId: string } | null;
};

export type { Filter } from "./filters/types";

// Mirrors the Phase 2 contract in specs/mcp-app.md, shared with the dashboard
// view in packages/mcp-views.
export type DashboardLayout = { x: number; y: number; w: number; h: number };
export type DashboardCard =
  | {
      kind: "visual";
      id: string;
      layout: DashboardLayout;
      visual: VisualPayload | null;
      error: string | null;
    }
  | {
      kind: "text";
      id: string;
      layout: DashboardLayout;
      title: string;
      content: string;
    };
export type DashboardSlicer = {
  id: string;
  field: string;
  title: string | null;
  options: Array<string | number | boolean | null>;
};
export type DashboardPayload = {
  id: string;
  title: string;
  columns: number;
  cards: DashboardCard[];
  slicers: DashboardSlicer[];
  filters: Filter[];
  skippedFilters: Array<{ visualId: string; field: string; reason: string }>;
};

type DashboardFilterContext = {
  filters: Filter[];
  joinDefs: JoinDefinition[];
  runtimeTables: RuntimeTableMetadata[];
};

type UpdateVisualConfigInput = {
  visualId: string;
  visualType?: z.infer<typeof visualTypeSchema>;
  xKey?: string;
  yKeys?: string[];
  title?: string;
};

export interface McpRuntime {
  query(sql: string, limit?: number): Promise<BridgeQueryResponse>;
}

export interface BridgeMcpHttpHandler {
  handleRequest(request: Request): Promise<Response>;
  close(): Promise<void>;
}

type BridgeMcpHttpSession = {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
};

const visualTypeSchema = z.enum([
  "line",
  "bar",
  "area",
  "pie",
  "table",
  "card",
]);
const uiViewSchema = z.enum([
  "app",
  "dashboards",
  "dashboard",
  "analysis",
  "analyses",
]);

const chartVisualTypes = new Set<string>(["line", "bar", "area", "pie"]);

const filterSchema = z.object({
  field: z.string().min(1),
  op: z.enum(FILTER_OPERATORS),
  values: z.array(z.unknown()).optional(),
});

const visualInputShape = {
  title: z.string().min(1),
  description: z.string().optional(),
  sql: z.string().min(1),
  visualType: visualTypeSchema,
  xKey: z.string().min(1).optional(),
  yKeys: z.array(z.string().min(1)).optional(),
  chartConfig: z.record(z.string(), z.unknown()).optional(),
};

// Every tool declares annotations; the Claude connector directory requires a
// title plus readOnlyHint or destructiveHint on each one.
const readOnlyAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
} as const;
const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const mcpInputSchema = <Schema extends Record<string, z.ZodType>>(
  schema: Schema,
): Schema & ZodRawShapeCompat =>
  schema as unknown as Schema & ZodRawShapeCompat;

export function createBridgeMcpToolHandlers(
  runtime: McpRuntime,
  options: Pick<BridgeMcpOptions, "allowWriteSql" | "appUrl"> = {},
) {
  const appUrl = normalizeAppUrl(options.appUrl);
  const executeSql = async (sql: string, limit = DEFAULT_QUERY_LIMIT) => {
    assertSqlAllowed(sql, Boolean(options.allowWriteSql));
    return runtime.query(sql, limit);
  };

  const listRuntimeTables = async (): Promise<RuntimeTableMetadata[]> => {
    const excludedSchemas = HIDDEN_RUNTIME_SCHEMAS.map(
      (schema) => `'${schema}'`,
    ).join(", ");
    const result = await runtime.query(`
      SELECT table_catalog, table_schema, table_name, table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN (${excludedSchemas})
      ORDER BY table_catalog, table_schema, table_name
    `);

    return result.rows.map((row) => {
      const metadata = {
        table_catalog: String(row.table_catalog ?? ""),
        table_schema: String(row.table_schema ?? ""),
        table_name: String(row.table_name ?? ""),
        table_type: String(row.table_type ?? ""),
      };

      return {
        ...metadata,
        table_reference: buildRuntimeTableReference(metadata),
      };
    });
  };

  const resolveTableReference = async (table: string): Promise<string> => {
    const tables = await listRuntimeTables();
    return resolveRuntimeTableReferenceFromMetadata(table, tables);
  };

  const buildDashboardPayload = async (
    dashboardId: string,
    rawFilters: unknown,
  ): Promise<DashboardPayload> => {
    const id = dashboardId.trim();
    const tables = await listMetadataTables(runtime);
    const dashboard = tables.has("dashboards")
      ? (
          await runtime.query(
            `SELECT id, title, columns
             FROM ${metadataTable("dashboards")}
             WHERE id = ${quoteString(id)}
             LIMIT 1;`,
          )
        ).rows[0]
      : undefined;
    if (!dashboard) {
      throw new Error(
        `Dashboard "${id}" not found. Use list_dashboards to see dashboard ids.`,
      );
    }

    const context: DashboardFilterContext = {
      filters: normalizeFilterPayload(rawFilters),
      joinDefs: (
        await queryDashboardRows(runtime, tables, "dashboard_join_defs", id)
      ).map(joinDefinitionFromRow),
      runtimeTables: await listRuntimeTables(),
    };
    const charts = await queryDashboardRows(
      runtime,
      tables,
      "dashboard_charts",
      id,
      "position",
    );
    const slicerRows = await queryDashboardRows(
      runtime,
      tables,
      "dashboard_slicers",
      id,
      "position",
    );

    // Run cards one at a time: the runtime shares a single DuckDB connection.
    const cards: DashboardCard[] = [];
    const skippedFilters: DashboardPayload["skippedFilters"] = [];
    for (const chart of charts) {
      const { card, skipped } = await buildDashboardCard(
        runtime,
        chart,
        context,
      );
      cards.push(card);
      skippedFilters.push(
        ...skipped.map((skip) => ({ visualId: card.id, ...skip })),
      );
    }
    const slicers: DashboardSlicer[] = [];
    for (const slicer of slicerRows) {
      slicers.push(
        await buildDashboardSlicer(runtime, slicer, context.runtimeTables),
      );
    }

    return {
      id,
      title: String(dashboard.title ?? id),
      columns: toFiniteNumber(dashboard.columns) ?? 4,
      cards,
      slicers,
      filters: context.filters,
      skippedFilters,
    };
  };

  return {
    listTables: async () => {
      const tables = await listRuntimeTables();
      return { tables, count: tables.length };
    },
    getTableSchema: async (table: string) => {
      const resolvedTable = await resolveTableReference(table);
      const schema = await runtime.query(`DESCRIBE ${resolvedTable}`);
      const sample = await runtime
        .query(`SELECT * FROM ${resolvedTable} LIMIT 5`, 5)
        .catch(() => ({ rows: [] }));

      return {
        table: resolvedTable,
        requestedTable: table,
        columns: schema.rows,
        sampleRows: sample.rows,
      };
    },
    describeTable: async (table: string) => {
      const tables = await listRuntimeTables();
      const resolvedTable = resolveRuntimeTableReferenceFromMetadata(
        table,
        tables,
      );
      if (!tables.some((entry) => entry.table_reference === resolvedTable)) {
        throw new Error(
          `Table "${table}" not found. Use list_tables to see table_reference values.`,
        );
      }
      const schema = await runtime.query(`DESCRIBE ${resolvedTable}`);
      const sample = await runtime
        .query(`SELECT * FROM ${resolvedTable} LIMIT 5`, 5)
        .catch(() => ({ rows: [] }));
      const count = await runtime
        .query(`SELECT COUNT(*) AS row_count FROM ${resolvedTable}`)
        .catch(() => null);

      return {
        table: resolvedTable,
        requestedTable: table,
        columns: schema.rows,
        rowCount: toFiniteNumber(count?.rows[0]?.row_count) ?? null,
        sampleRows: sample.rows,
      };
    },
    runPreview: async (table: string) => {
      const resolvedTable = await resolveTableReference(table);
      const result = await runtime.query(
        `SELECT * FROM ${resolvedTable} LIMIT 5`,
        5,
      );

      return {
        table: resolvedTable,
        requestedTable: table,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rows.length,
      };
    },
    executeSql: async (sql: string, limit = DEFAULT_QUERY_LIMIT) => {
      const result = await executeSql(sql, limit);
      return {
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        rowsChanged: result.rowsChanged,
      };
    },
    // Unlike executeSql, query never writes, even with --allow-write-sql.
    query: async (sql: string, limit = DEFAULT_QUERY_LIMIT) => {
      assertSqlAllowed(sql, false);
      const result = await runtime.query(sql, limit);
      return {
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.rowCount > result.rows.length,
      };
    },
    listDashboards: async () => {
      const dashboards = await listDashboardSummaries(runtime, appUrl);
      return { dashboards, count: dashboards.length };
    },
    getDashboard: async (dashboardId: string) =>
      getDashboardSnapshot(runtime, appUrl, dashboardId),
    listVisuals: async (dashboardId?: string) => {
      const visuals = await listVisualSummaries(runtime, appUrl, dashboardId);
      return { visuals, count: visuals.length };
    },
    getVisual: async (visualId: string) =>
      getVisualSnapshot(runtime, appUrl, visualId),
    createDashboard: async (input: { id?: string; title: string }) => {
      const now = Date.now();
      const id = input.id?.trim() || createStableId(input.title, "dashboard");
      await ensureDashboardMetadata(runtime);
      await runtime.query(
        `INSERT OR REPLACE INTO ${metadataTable("dashboards")} (
          id,
          title,
          created_at,
          updated_at,
          columns,
          auto_fit_rows,
          runtime_backend,
          active_snapshot_id,
          home_db_identifier,
          home_sql_backend,
          storage_status,
          project_path
        ) VALUES (
          ${quoteString(id)},
          ${quoteString(input.title)},
          COALESCE((SELECT created_at FROM ${metadataTable("dashboards")} WHERE id = ${quoteString(id)}), ${now}),
          ${now},
          COALESCE((SELECT columns FROM ${metadataTable("dashboards")} WHERE id = ${quoteString(id)}), 4),
          COALESCE((SELECT auto_fit_rows FROM ${metadataTable("dashboards")} WHERE id = ${quoteString(id)}), FALSE),
          'bridge',
          NULL,
          NULL,
          'bridge',
          'shared',
          COALESCE((SELECT project_path FROM ${metadataTable("dashboards")} WHERE id = ${quoteString(id)}), NULL)
        );`,
      );
      return {
        dashboardId: id,
        title: input.title,
        url: dashboardUrl(appUrl, id),
      };
    },
    showChart: async (input: VisualInput) => {
      assertSqlAllowed(input.sql, false);
      const result = await runtime.query(input.sql, VISUAL_ROW_LIMIT);
      return { visual: buildVisualPayload(input, result, null) };
    },
    createVisual: async (
      input: VisualInput & {
        dashboardId?: string;
        dashboardTitle?: string;
      },
    ) => {
      assertSqlAllowed(input.sql, Boolean(options.allowWriteSql));
      const result = await runtime.query(input.sql, VISUAL_ROW_LIMIT);
      const dashboard = await ensureDashboardForVisual(runtime, {
        id: input.dashboardId,
        title: input.dashboardTitle,
        fallbackTitle: "Pondview Visuals",
      });
      const chartId = createStableId(input.title, "visual");
      const now = Date.now();
      const position = await nextChartPosition(runtime, dashboard.dashboardId);
      const visual = buildVisualPayload(input, result, {
        dashboardId: dashboard.dashboardId,
        visualId: chartId,
      });
      const chartConfig = visual.config;
      const layout = initialLayout(chartConfig, position);

      await insertDashboardChart(runtime, {
        id: chartId,
        dashboardId: dashboard.dashboardId,
        title: input.title,
        description: input.description,
        sql: input.sql,
        chartConfig,
        position,
        layout,
        now,
      });
      await touchDashboard(runtime, dashboard.dashboardId, now);

      return {
        dashboardId: dashboard.dashboardId,
        visualId: chartId,
        title: input.title,
        rowsPreviewed: result.rows.length,
        url: dashboardUrl(appUrl, dashboard.dashboardId),
        visualUrl: visualUrl(appUrl, chartId),
        visual,
      };
    },
    createTextCard: async (input: {
      dashboardId?: string;
      dashboardTitle?: string;
      title?: string;
      content: string;
      colSpan?: number;
    }) => {
      const title = input.title?.trim() || "Text";
      const dashboard = await ensureDashboardForVisual(runtime, {
        id: input.dashboardId,
        title: input.dashboardTitle,
        fallbackTitle: "Pondview Notes",
      });
      const chartId = createStableId(title, "text-card");
      const now = Date.now();
      const position = await nextChartPosition(runtime, dashboard.dashboardId);
      const chartConfig = buildTextCardConfig(input, title);
      const layout = initialLayout(chartConfig, position);
      const sql = "SELECT 1 AS pondview_text_card";

      await insertDashboardChart(runtime, {
        id: chartId,
        dashboardId: dashboard.dashboardId,
        title,
        description: null,
        sql,
        chartConfig,
        position,
        layout,
        now,
      });
      await touchDashboard(runtime, dashboard.dashboardId, now);

      return {
        dashboardId: dashboard.dashboardId,
        textCardId: chartId,
        title,
        url: dashboardUrl(appUrl, dashboard.dashboardId),
        visualUrl: visualUrl(appUrl, chartId),
      };
    },
    showDashboard: async (dashboardId: string, filters: unknown = []) => ({
      dashboard: await buildDashboardPayload(dashboardId, filters),
    }),
    runVisual: async (visualId: string, filters: unknown = []) => {
      const chart = await loadVisualChart(runtime, visualId);
      const tables = await listMetadataTables(runtime);
      const context: DashboardFilterContext = {
        filters: normalizeFilterPayload(filters),
        joinDefs: (
          await queryDashboardRows(
            runtime,
            tables,
            "dashboard_join_defs",
            String(chart.dashboard_id ?? ""),
          )
        ).map(joinDefinitionFromRow),
        runtimeTables: await listRuntimeTables(),
      };
      const { visual, skipped } = await runStoredVisual(
        runtime,
        chart,
        context,
      );
      return { visual, skippedFilters: skipped };
    },
    updateVisualConfig: async (input: UpdateVisualConfigInput) => {
      const chart = await loadVisualChart(runtime, input.visualId);
      const sql = String(chart.sql ?? "");
      assertSqlAllowed(sql, false);
      const result = await runtime.query(sql, VISUAL_ROW_LIMIT);
      const config = parseChartConfig(chart.chart_config_json);
      const currentType = storedVisualType(config);
      const visualType = input.visualType ?? currentType;
      const title =
        input.title?.trim() || String(chart.title ?? config.title ?? "");
      // Within chart types (or with no type change) patch the stored config
      // so app-made styling survives; otherwise rebuild it for the new type.
      const nextConfig =
        visualType === currentType ||
        (chartVisualTypes.has(currentType) && chartVisualTypes.has(visualType))
          ? {
              ...config,
              title,
              ...(chartVisualTypes.has(visualType) ? { type: visualType } : {}),
              ...(input.xKey ? { xKey: input.xKey } : {}),
              ...(input.yKeys
                ? { yKeys: input.yKeys, legend: input.yKeys.length > 1 }
                : {}),
            }
          : buildVisualConfig(
              {
                title,
                description:
                  typeof chart.description === "string"
                    ? chart.description
                    : undefined,
                visualType,
                xKey:
                  input.xKey ??
                  (typeof config.xKey === "string" ? config.xKey : undefined),
                yKeys:
                  input.yKeys ??
                  (Array.isArray(config.yKeys)
                    ? config.yKeys.map(String)
                    : undefined),
              },
              result.columns,
            );
      const now = Date.now();
      await runtime.query(
        `UPDATE ${metadataTable("dashboard_charts")}
         SET title = ${quoteString(title)},
             chart_config_json = ${quoteString(JSON.stringify(nextConfig))},
             updated_at = ${now}
         WHERE id = ${quoteString(String(chart.id))};`,
      );
      await touchDashboard(runtime, String(chart.dashboard_id ?? ""), now);
      return {
        visual: storedVisualPayload(
          { ...chart, title, chart_config_json: JSON.stringify(nextConfig) },
          result,
        ),
      };
    },
    deleteVisual: async (visualId: string) => {
      const id = visualId.trim();
      const tables = await listMetadataTables(runtime);
      const existing = tables.has("dashboard_charts")
        ? (
            await runtime.query(
              `SELECT dashboard_id FROM ${metadataTable("dashboard_charts")}
               WHERE id = ${quoteString(id)};`,
            )
          ).rows[0]
        : undefined;
      if (!existing) {
        return { visualId: id, dashboardId: null, deleted: false };
      }

      const dashboardId = String(existing.dashboard_id ?? "");
      if (tables.has("chart_slicers")) {
        await runtime.query(
          `DELETE FROM ${metadataTable("chart_slicers")}
           WHERE chart_id = ${quoteString(id)};`,
        );
      }
      await runtime.query(
        `DELETE FROM ${metadataTable("dashboard_charts")}
         WHERE id = ${quoteString(id)};`,
      );
      if (tables.has("dashboards")) {
        await touchDashboard(runtime, dashboardId, Date.now());
      }
      return { visualId: id, dashboardId, deleted: true };
    },
    deleteDashboard: async (dashboardId: string) => {
      const id = dashboardId.trim();
      const tables = await listMetadataTables(runtime);
      const removed = { charts: 0, measures: 0, slicers: 0, joinDefs: 0 };
      const existing = tables.has("dashboards")
        ? (
            await runtime.query(
              `SELECT id FROM ${metadataTable("dashboards")}
               WHERE id = ${quoteString(id)};`,
            )
          ).rows[0]
        : undefined;
      if (!existing) {
        return { dashboardId: id, deleted: false, removed };
      }

      if (tables.has("chart_slicers") && tables.has("dashboard_charts")) {
        await runtime.query(
          `DELETE FROM ${metadataTable("chart_slicers")}
           WHERE chart_id IN (
             SELECT id FROM ${metadataTable("dashboard_charts")}
             WHERE dashboard_id = ${quoteString(id)}
           );`,
        );
      }
      const children = [
        ["charts", "dashboard_charts"],
        ["measures", "dashboard_measures"],
        ["slicers", "dashboard_slicers"],
        ["joinDefs", "dashboard_join_defs"],
      ] as const;
      for (const [key, table] of children) {
        if (!tables.has(table)) {
          continue;
        }
        const result = await runtime.query(
          `DELETE FROM ${metadataTable(table)}
           WHERE dashboard_id = ${quoteString(id)};`,
        );
        removed[key] = result.rowsChanged ?? 0;
      }
      await runtime.query(
        `DELETE FROM ${metadataTable("dashboards")}
         WHERE id = ${quoteString(id)};`,
      );
      return { dashboardId: id, deleted: true, removed };
    },
    openUi: async (input: {
      view?: z.infer<typeof uiViewSchema>;
      dashboardId?: string;
      analysisId?: string;
    }) => ({
      view: input.view ?? "app",
      dashboardId: input.dashboardId?.trim() || null,
      analysisId: input.analysisId?.trim() || null,
      url: uiUrl(appUrl, input),
    }),
    openDashboard: async (dashboardId?: string) => ({
      dashboardId: dashboardId?.trim() || null,
      url: dashboardUrl(appUrl, dashboardId?.trim() || undefined),
    }),
    openVisual: async (visualId: string) => {
      const id = visualId.trim();
      return {
        visualId: id,
        url: visualUrl(appUrl, id),
      };
    },
  };
}

export function createBridgeMcpServer(
  runtime: McpRuntime,
  options: BridgeMcpServerOptions = {},
): McpServer {
  const server = new McpServer({
    name: "pondview-bridge",
    version: "0.1.0",
  });
  const handlers = createBridgeMcpToolHandlers(runtime, options);
  const executeSqlAnnotations = options.allowWriteSql
    ? { ...writeAnnotations, destructiveHint: true }
    : readOnlyAnnotations;

  registerAppResource(
    server,
    "Pondview visual",
    VISUAL_VIEW_URI,
    {
      description: "Interactive chart, table, or metric card for a SQL result.",
      _meta: { ui: { prefersBorder: true } },
    },
    async () => ({
      contents: [
        {
          uri: VISUAL_VIEW_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: loadViewHtml("visual", options.viewsDir),
          _meta: { ui: { prefersBorder: true } },
        },
      ],
    }),
  );

  registerAppResource(
    server,
    "Pondview dashboard",
    DASHBOARD_VIEW_URI,
    {
      description:
        "Interactive Pondview dashboard with its visuals, text cards, and slicers.",
      _meta: { ui: { prefersBorder: true } },
    },
    async () => ({
      contents: [
        {
          uri: DASHBOARD_VIEW_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: loadViewHtml("dashboard", options.viewsDir),
          _meta: { ui: { prefersBorder: true } },
        },
      ],
    }),
  );

  server.registerTool(
    "list_tables",
    {
      title: "List tables",
      description:
        "List tables available in the Pondview Bridge DuckDB runtime. Use table_reference exactly in other Pondview MCP tools.",
      inputSchema: {},
      annotations: readOnlyAnnotations,
    },
    async () => toToolResult(await handlers.listTables()),
  );

  server.registerTool(
    "get_table_schema",
    {
      title: "Get table schema",
      description:
        "(deprecated: use describe_table) Get column metadata and a small sample for a table.",
      inputSchema: mcpInputSchema({
        table: z.string().min(1),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ table }: { table: string }) =>
      toToolResult(await handlers.getTableSchema(table)),
  );

  server.registerTool(
    "run_preview",
    {
      title: "Preview table",
      description:
        "(deprecated: use describe_table) Fetch up to 5 sample rows from a table.",
      inputSchema: mcpInputSchema({
        table: z.string().min(1),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ table }: { table: string }) =>
      toToolResult(await handlers.runPreview(table)),
  );

  server.registerTool(
    "execute_sql",
    {
      title: "Execute SQL",
      description:
        "(deprecated: use query) Execute SQL in the Pondview Bridge DuckDB runtime. Read-only SQL is allowed by default; writes require starting the MCP server with --allow-write-sql.",
      inputSchema: mcpInputSchema({
        sql: z.string().min(1),
        limit: z.number().int().positive().max(5000).optional(),
      }),
      annotations: executeSqlAnnotations,
    },
    async ({ sql, limit }: { sql: string; limit?: number }) =>
      toToolResult(
        await handlers.executeSql(sql, limit ?? DEFAULT_QUERY_LIMIT),
      ),
  );

  server.registerTool(
    "describe_table",
    {
      title: "Describe table",
      description:
        "Get a table's columns, row count, and up to 5 sample rows. Use a table_reference from list_tables.",
      inputSchema: mcpInputSchema({
        table: z.string().min(1),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ table }: { table: string }) =>
      toToolResult(await handlers.describeTable(table)),
  );

  server.registerTool(
    "query",
    {
      title: "Query data",
      description: `Run a read-only SQL query (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN) in the Pondview DuckDB runtime. Results are capped at limit rows (default ${DEFAULT_QUERY_LIMIT}, max 5000) and the text result shows the first ${QUERY_TEXT_PREVIEW_ROWS}; aggregate in SQL instead of paging through rows. Use show_chart to answer with a chart.`,
      inputSchema: mcpInputSchema({
        sql: z.string().min(1),
        limit: z.number().int().positive().max(5000).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ sql, limit }: { sql: string; limit?: number }) => {
      const result = await handlers.query(sql, limit ?? DEFAULT_QUERY_LIMIT);
      return toAppToolResult(queryResultText(result), result);
    },
  );

  registerAppTool(
    server,
    "show_chart",
    {
      title: "Show chart",
      description:
        "Run a read-only SQL query and show the result inline in the conversation as an interactive chart, table, or metric card. Nothing is saved; use save_visual to add a visual to a dashboard. visualType can be line, bar, area, pie, table, or card. Aggregate in SQL: results over 5000 rows are truncated.",
      inputSchema: mcpInputSchema(visualInputShape),
      annotations: readOnlyAnnotations,
      _meta: { ui: { resourceUri: VISUAL_VIEW_URI } },
    },
    async (input: VisualInput) => {
      const { visual } = await handlers.showChart(input);
      return toVisualToolResult(visualSummaryText(visual), { visual });
    },
  );

  server.registerTool(
    "list_dashboards",
    {
      title: "List dashboards",
      description:
        "List existing Pondview dashboards, including chart counts and dashboard URLs.",
      inputSchema: {},
      annotations: readOnlyAnnotations,
    },
    async () => toToolResult(await handlers.listDashboards()),
  );

  server.registerTool(
    "get_dashboard",
    {
      title: "Get dashboard",
      description:
        "Get a Pondview dashboard with its charts, measures, slicers, join definitions, and URL.",
      inputSchema: mcpInputSchema({
        dashboardId: z.string().min(1),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ dashboardId }: { dashboardId: string }) =>
      toToolResult(await handlers.getDashboard(dashboardId)),
  );

  server.registerTool(
    "list_visuals",
    {
      title: "List visuals",
      description:
        "List Pondview dashboard visuals, optionally filtered by dashboard, including standalone visual URLs.",
      inputSchema: mcpInputSchema({
        dashboardId: z.string().min(1).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ dashboardId }: { dashboardId?: string }) =>
      toToolResult(await handlers.listVisuals(dashboardId)),
  );

  server.registerTool(
    "get_visual",
    {
      title: "Get visual",
      description:
        "Get one Pondview dashboard visual by id, including its standalone visual URL.",
      inputSchema: mcpInputSchema({
        visualId: z.string().min(1),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ visualId }: { visualId: string }) =>
      toToolResult(await handlers.getVisual(visualId)),
  );

  server.registerTool(
    "create_dashboard",
    {
      title: "Create dashboard",
      description:
        "Create or update a Pondview dashboard and return a local URL. After calling this, open the returned URL in a browser or in-app preview so the user sees the rendered dashboard instead of a raw link.",
      inputSchema: mcpInputSchema({
        title: z.string().min(1),
        id: z.string().min(1).optional(),
      }),
      annotations: writeAnnotations,
    },
    async (input: { title: string; id?: string }) =>
      toToolResult(await handlers.createDashboard(input)),
  );

  registerAppTool(
    server,
    "create_visual",
    {
      title: "Create visual",
      description:
        "(deprecated: use save_visual) Create a Pondview dashboard visual from SQL and save it to a dashboard. The visual is shown inline in the conversation when the host supports it; otherwise open the returned dashboard URL. visualType can be line, bar, area, pie, table, or card. Use show_chart instead to answer a question without saving.",
      inputSchema: mcpInputSchema({
        dashboardId: z.string().min(1).optional(),
        dashboardTitle: z.string().min(1).optional(),
        ...visualInputShape,
      }),
      annotations: writeAnnotations,
      _meta: { ui: { resourceUri: VISUAL_VIEW_URI } },
    },
    async (
      input: VisualInput & { dashboardId?: string; dashboardTitle?: string },
    ) => {
      const { visual, ...saved } = await handlers.createVisual(input);
      return toVisualToolResult(
        `Saved "${visual.title}" to dashboard ${saved.dashboardId}.\n` +
          `Dashboard: ${saved.url}\nVisual: ${saved.visualUrl}\n\n` +
          visualSummaryText(visual),
        { ...saved, visual },
      );
    },
  );

  registerAppTool(
    server,
    "save_visual",
    {
      title: "Save visual",
      description:
        "Save a visual built from SQL to a Pondview dashboard (created if dashboardId is new or omitted) and show it inline. visualType can be line, bar, area, pie, table, or card. Use show_chart instead to answer a question without saving, and show_dashboard to show the whole dashboard.",
      inputSchema: mcpInputSchema({
        dashboardId: z.string().min(1).optional(),
        dashboardTitle: z.string().min(1).optional(),
        ...visualInputShape,
      }),
      annotations: writeAnnotations,
      _meta: { ui: { resourceUri: VISUAL_VIEW_URI } },
    },
    async (
      input: VisualInput & { dashboardId?: string; dashboardTitle?: string },
    ) => {
      const { visual, ...saved } = await handlers.createVisual(input);
      return toVisualToolResult(
        `Saved "${visual.title}" (visual ${saved.visualId}) to dashboard ${saved.dashboardId}.\n\n` +
          visualSummaryText(visual),
        { ...saved, visual },
      );
    },
  );

  registerAppTool(
    server,
    "show_dashboard",
    {
      title: "Show dashboard",
      description:
        "Show a saved Pondview dashboard inline in the conversation, with its visuals, text cards, and slicers. Optional filters ({ field: 'table.column', op, values }) narrow every visual that can reach the field through the dashboard's joins. The text result summarizes each card; the user sees the data in the view.",
      inputSchema: mcpInputSchema({
        dashboardId: z.string().min(1),
        filters: z.array(filterSchema).optional(),
      }),
      annotations: readOnlyAnnotations,
      _meta: { ui: { resourceUri: DASHBOARD_VIEW_URI } },
    },
    async ({
      dashboardId,
      filters,
    }: {
      dashboardId: string;
      filters?: Filter[];
    }) => {
      const result = await handlers.showDashboard(dashboardId, filters ?? []);
      return toAppToolResult(dashboardSummaryText(result.dashboard), result);
    },
  );

  registerAppTool(
    server,
    "get_dashboard_data",
    {
      title: "Get dashboard data",
      description:
        "Re-run every visual on a dashboard with the given slicer filters. Called by the dashboard view.",
      inputSchema: mcpInputSchema({
        dashboardId: z.string().min(1),
        filters: z.array(filterSchema),
      }),
      annotations: readOnlyAnnotations,
      _meta: { ui: { resourceUri: DASHBOARD_VIEW_URI, visibility: ["app"] } },
    },
    async ({
      dashboardId,
      filters,
    }: {
      dashboardId: string;
      filters: Filter[];
    }) => {
      const result = await handlers.showDashboard(dashboardId, filters);
      return toAppToolResult(dashboardSummaryText(result.dashboard), result);
    },
  );

  registerAppTool(
    server,
    "run_visual",
    {
      title: "Run visual",
      description:
        "Re-run one saved visual with optional slicer filters. Called by the dashboard view.",
      inputSchema: mcpInputSchema({
        visualId: z.string().min(1),
        filters: z.array(filterSchema).optional(),
      }),
      annotations: readOnlyAnnotations,
      _meta: { ui: { resourceUri: DASHBOARD_VIEW_URI, visibility: ["app"] } },
    },
    async ({ visualId, filters }: { visualId: string; filters?: Filter[] }) => {
      const { visual } = await handlers.runVisual(visualId, filters ?? []);
      return toVisualToolResult(visualSummaryText(visual), { visual });
    },
  );

  registerAppTool(
    server,
    "update_visual_config",
    {
      title: "Update visual config",
      description:
        "Change a saved visual's chart type, axes, or title. Called by the dashboard view.",
      inputSchema: mcpInputSchema({
        visualId: z.string().min(1),
        visualType: visualTypeSchema.optional(),
        xKey: z.string().min(1).optional(),
        yKeys: z.array(z.string().min(1)).optional(),
        title: z.string().min(1).optional(),
      }),
      annotations: writeAnnotations,
      _meta: { ui: { resourceUri: DASHBOARD_VIEW_URI, visibility: ["app"] } },
    },
    async (input: UpdateVisualConfigInput) => {
      const { visual } = await handlers.updateVisualConfig(input);
      return toVisualToolResult(
        `Updated "${visual.title}".\n\n${visualSummaryText(visual)}`,
        { visual },
      );
    },
  );

  server.registerTool(
    "delete_visual",
    {
      title: "Delete visual",
      description:
        "Permanently delete one visual or text card from its dashboard.",
      inputSchema: mcpInputSchema({
        visualId: z.string().min(1),
      }),
      annotations: { ...writeAnnotations, destructiveHint: true },
    },
    async ({ visualId }: { visualId: string }) =>
      toToolResult(await handlers.deleteVisual(visualId)),
  );

  server.registerTool(
    "delete_dashboard",
    {
      title: "Delete dashboard",
      description:
        "Permanently delete a dashboard with all of its visuals, text cards, measures, slicers, and join definitions.",
      inputSchema: mcpInputSchema({
        dashboardId: z.string().min(1),
      }),
      annotations: { ...writeAnnotations, destructiveHint: true },
    },
    async ({ dashboardId }: { dashboardId: string }) =>
      toToolResult(await handlers.deleteDashboard(dashboardId)),
  );

  server.registerTool(
    "create_text_card",
    {
      title: "Create text card",
      description:
        "Create a markdown text card on a Pondview dashboard and return a local dashboard URL. Use this for narrative notes, headings, and explanations that do not need SQL. After calling this, open the returned URL in a browser or in-app preview so the user sees the rendered card instead of a raw link.",
      inputSchema: mcpInputSchema({
        dashboardId: z.string().min(1).optional(),
        dashboardTitle: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        content: z.string().min(1),
        colSpan: z.number().int().min(1).max(4).optional(),
      }),
      annotations: writeAnnotations,
    },
    async (input: {
      dashboardId?: string;
      dashboardTitle?: string;
      title?: string;
      content: string;
      colSpan?: number;
    }) => toToolResult(await handlers.createTextCard(input)),
  );

  server.registerTool(
    "open_ui",
    {
      title: "Get Pondview UI URL",
      description:
        "(deprecated: use show_dashboard) Return a local Pondview UI URL for the app, dashboards, a dashboard, analyses, or an analysis. This tool does not open anything itself, but if you have a browser or in-app preview tool you should open the returned URL there so the user sees the rendered UI.",
      inputSchema: mcpInputSchema({
        view: uiViewSchema.optional(),
        dashboardId: z.string().min(1).optional(),
        analysisId: z.string().min(1).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async (input: {
      view?: z.infer<typeof uiViewSchema>;
      dashboardId?: string;
      analysisId?: string;
    }) => toToolResult(await handlers.openUi(input)),
  );

  server.registerTool(
    "open_dashboard",
    {
      title: "Get dashboard URL",
      description:
        "(deprecated: use show_dashboard) Return the local Pondview dashboard URL. After calling this, open the returned URL in a browser or in-app preview so the user sees the rendered dashboard instead of a raw link.",
      inputSchema: mcpInputSchema({
        dashboardId: z.string().min(1).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ dashboardId }: { dashboardId?: string }) =>
      toToolResult(await handlers.openDashboard(dashboardId)),
  );

  server.registerTool(
    "open_visual",
    {
      title: "Get visual URL",
      description:
        "(deprecated: use show_dashboard) Return a local Pondview standalone visual URL. After calling this, open the returned URL in a browser or in-app preview so the user sees the rendered visual instead of a raw link.",
      inputSchema: mcpInputSchema({
        visualId: z.string().min(1),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ visualId }: { visualId: string }) =>
      toToolResult(await handlers.openVisual(visualId)),
  );

  return server;
}

export async function runBridgeMcpServerWithRuntime(
  runtime: McpRuntime,
  options: BridgeMcpServerOptions = {},
): Promise<void> {
  const server = createBridgeMcpServer(runtime, options);
  await server.connect(new StdioServerTransport());
}

export async function runBridgeMcpServer(
  options: BridgeMcpOptions = {},
): Promise<void> {
  const secrets = new BridgeSecretStore(options.secretsPath);
  const databasePath = resolveMcpDatabasePath(options);
  const runtime = new DuckDbRuntime({
    databasePath,
    resolveSource: (id) => secrets.getSource(id),
  });

  process.once("exit", () => {
    void runtime.close();
  });
  process.once("SIGINT", () => {
    void runtime.close().finally(() => process.exit(130));
  });
  process.once("SIGTERM", () => {
    void runtime.close().finally(() => process.exit(143));
  });

  await runBridgeMcpServerWithRuntime(runtime, options);
}

export function createBridgeMcpHttpHandler(
  runtime: McpRuntime,
  options: BridgeMcpServerOptions = {},
): BridgeMcpHttpHandler {
  const sessions = new Map<string, BridgeMcpHttpSession>();

  const jsonRpcError = (
    status: number,
    message: string,
    code = -32000,
  ): Response =>
    new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code, message },
        id: null,
      }),
      {
        status,
        headers: { "content-type": "application/json" },
      },
    );

  return {
    async handleRequest(request) {
      if (request.method === "GET") {
        return new Response(null, {
          status: 405,
          headers: { allow: "POST, DELETE" },
        });
      }

      const sessionId = request.headers.get("mcp-session-id");
      const existingSession = sessionId ? sessions.get(sessionId) : undefined;
      if (existingSession) {
        return existingSession.transport.handleRequest(request);
      }

      if (request.method === "DELETE") {
        return jsonRpcError(404, "Session not found", -32001);
      }

      if (request.method !== "POST") {
        return new Response(null, {
          status: 405,
          headers: { allow: "POST, DELETE" },
        });
      }

      const message = await request
        .clone()
        .json()
        .catch(() => undefined);
      if (sessionId || !isInitializeRequest(message)) {
        return jsonRpcError(
          sessionId ? 404 : 400,
          sessionId
            ? "Session not found"
            : "Bad Request: initialize request required",
          sessionId ? -32001 : -32600,
        );
      }

      let session: BridgeMcpHttpSession;
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        enableJsonResponse: true,
        onsessioninitialized: (initializedSessionId) => {
          sessions.set(initializedSessionId, session);
        },
        onsessionclosed: (closedSessionId) => {
          if (closedSessionId) {
            sessions.delete(closedSessionId);
          }
        },
      });
      const server = createBridgeMcpServer(runtime, options);
      session = { server, transport };
      await server.connect(transport);

      const response = await transport.handleRequest(request);
      if (!transport.sessionId) {
        await server.close();
      }
      return response;
    },
    async close() {
      const activeSessions = [...sessions.values()];
      sessions.clear();
      await Promise.allSettled(
        activeSessions.map(({ server }) => server.close()),
      );
    },
  };
}

export function toToolResult(value: Record<string, unknown>): CallToolResult {
  const content: CallToolResult["content"] = [];
  const primaryUrl =
    typeof value.visualUrl === "string" && value.visualUrl.length > 0
      ? value.visualUrl
      : value.url;
  if (typeof primaryUrl === "string" && primaryUrl.length > 0) {
    content.push({ type: "text", text: openInBrowserNudge(primaryUrl) });
  }
  content.push({ type: "text", text: JSON.stringify(value, null, 2) });
  return {
    content,
    structuredContent: value,
  };
}

// Visual results keep the row payload out of the text content: the view reads
// structuredContent, while the model only needs a summary and a short preview.
export function toVisualToolResult(
  text: string,
  structuredContent: Record<string, unknown> & { visual: VisualPayload },
): CallToolResult {
  return toAppToolResult(text, structuredContent);
}

function toAppToolResult(
  text: string,
  structuredContent: Record<string, unknown>,
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

function buildVisualPayload(
  input: VisualInput,
  result: BridgeQueryResponse,
  saved: VisualPayload["saved"],
): VisualPayload {
  return {
    title: input.title,
    description: input.description ?? null,
    sql: input.sql,
    visualType: input.visualType,
    config: buildVisualConfig(input, result.columns),
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    truncated: result.rowCount > result.rows.length,
    saved,
  };
}

function visualSummaryText(visual: VisualPayload): string {
  const previewRows = visual.rows.slice(0, VISUAL_TEXT_PREVIEW_ROWS);
  const lines = [
    `${visual.visualType} visual "${visual.title}" from ${visual.rowCount} row(s).`,
  ];
  if (visual.truncated) {
    lines.push(
      `Only the first ${visual.rows.length} rows are shown; aggregate in SQL to include everything.`,
    );
  }
  const xKey = visual.config.xKey;
  const yKeys = visual.config.yKeys;
  if (typeof xKey === "string" && Array.isArray(yKeys)) {
    lines.push(`x: ${xKey}; y: ${yKeys.join(", ")}`);
  }
  lines.push(
    `Columns: ${visual.columns.map((column) => column.name).join(", ")}`,
  );
  if (previewRows.length > 0) {
    lines.push(
      `First ${previewRows.length} row(s):`,
      JSON.stringify(previewRows, null, 2),
    );
  }
  return lines.join("\n");
}

function queryResultText(result: {
  columns: BridgeQueryResponse["columns"];
  rows: BridgeQueryResponse["rows"];
  rowCount: number;
  truncated: boolean;
}): string {
  const previewRows = result.rows.slice(0, QUERY_TEXT_PREVIEW_ROWS);
  const lines = [`${result.rowCount} row(s).`];
  if (result.truncated) {
    lines.push(
      `Only the first ${result.rows.length} rows were returned; aggregate in SQL or raise limit.`,
    );
  }
  lines.push(
    `Columns: ${result.columns.map((column) => `${column.name} (${column.type})`).join(", ")}`,
  );
  if (previewRows.length > 0) {
    lines.push(
      `First ${previewRows.length} row(s):`,
      JSON.stringify(previewRows, null, 2),
    );
  }
  return lines.join("\n");
}

// One or two lines per card; rows stay in structuredContent for the view.
function dashboardSummaryText(dashboard: DashboardPayload): string {
  const lines = [
    `Dashboard "${dashboard.title}" (${dashboard.id}): ${dashboard.cards.length} card(s), ${dashboard.slicers.length} slicer(s).`,
  ];
  if (dashboard.filters.length > 0) {
    lines.push(
      `Active filters: ${dashboard.filters
        .map(
          (filter) =>
            `${filter.field} ${filter.op} ${JSON.stringify(filter.values ?? [])}`,
        )
        .join("; ")}`,
    );
  }
  for (const card of dashboard.cards) {
    if (card.kind === "text") {
      lines.push(`- text "${card.title}" (${card.id})`);
    } else if (card.error || !card.visual) {
      lines.push(`- visual ${card.id} failed: ${card.error ?? "no result"}`);
    } else {
      const { visual } = card;
      const axes =
        typeof visual.config.xKey === "string" &&
        Array.isArray(visual.config.yKeys)
          ? `; x: ${visual.config.xKey}; y: ${visual.config.yKeys.join(", ")}`
          : "";
      lines.push(
        `- ${visual.visualType} "${visual.title}" (${card.id}): ${visual.rowCount} row(s)${visual.truncated ? ", truncated" : ""}${axes}`,
      );
    }
  }
  for (const slicer of dashboard.slicers) {
    lines.push(
      `- slicer ${slicer.title ? `"${slicer.title}" ` : ""}on ${slicer.field}: ${slicer.options.length} option(s)`,
    );
  }
  for (const skipped of dashboard.skippedFilters) {
    lines.push(
      `Filter ${skipped.field} skipped for ${skipped.visualId}: ${skipped.reason}`,
    );
  }
  return lines.join("\n");
}

async function buildDashboardCard(
  runtime: McpRuntime,
  chart: Record<string, unknown>,
  context: DashboardFilterContext,
): Promise<{
  card: DashboardCard;
  skipped: ApplyFiltersResult["skippedFilters"];
}> {
  const id = String(chart.id ?? "");
  const config = parseChartConfig(chart.chart_config_json);
  const layout = dashboardCardLayout(chart, config);
  if (config.configType === "text") {
    return {
      card: {
        kind: "text",
        id,
        layout,
        title: String(config.title ?? chart.title ?? ""),
        content: typeof config.content === "string" ? config.content : "",
      },
      skipped: [],
    };
  }

  try {
    const { visual, skipped } = await runStoredVisual(runtime, chart, context);
    return {
      card: { kind: "visual", id, layout, visual, error: null },
      skipped,
    };
  } catch (error) {
    return {
      card: {
        kind: "visual",
        id,
        layout,
        visual: null,
        error: error instanceof Error ? error.message : String(error),
      },
      skipped: [],
    };
  }
}

async function runStoredVisual(
  runtime: McpRuntime,
  chart: Record<string, unknown>,
  context: DashboardFilterContext,
): Promise<{
  visual: VisualPayload;
  skipped: ApplyFiltersResult["skippedFilters"];
}> {
  const sql = String(chart.sql ?? "");
  const filtered = applyDashboardFilters(sql, context);
  assertSqlAllowed(filtered.sql, false);
  const result = await runtime.query(filtered.sql, VISUAL_ROW_LIMIT);
  return {
    visual: storedVisualPayload(chart, result),
    skipped: filtered.skippedFilters,
  };
}

function applyDashboardFilters(
  sql: string,
  context: DashboardFilterContext,
): ApplyFiltersResult {
  if (context.filters.length === 0) {
    return { sql, appliedFilters: 0, skippedFilters: [] };
  }
  // Keep the chart's own spelling of its base table; resolve joined tables
  // against the runtime catalog, quoting anything unknown so filter fields
  // from the view can never inject SQL.
  const baseRef = findBaseTableReference(sql);
  return applyFiltersToSql(sql, context.filters, context.joinDefs, {
    resolveTableRef: (tableName) =>
      baseRef && tableName === baseRef.tableName
        ? baseRef.rawReference
        : resolveRuntimeTableReferenceFromMetadata(
            quoteIdentifier(tableName),
            context.runtimeTables,
          ),
  });
}

function storedVisualPayload(
  chart: Record<string, unknown>,
  result: BridgeQueryResponse,
): VisualPayload {
  const config = parseChartConfig(chart.chart_config_json);
  return {
    title: String(chart.title ?? config.title ?? ""),
    description:
      typeof chart.description === "string" ? chart.description : null,
    sql: String(chart.sql ?? ""),
    visualType: storedVisualType(config),
    config,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    truncated: result.rowCount > result.rows.length,
    saved: {
      dashboardId: String(chart.dashboard_id ?? ""),
      visualId: String(chart.id ?? ""),
    },
  };
}

function storedVisualType(
  config: Record<string, unknown>,
): z.infer<typeof visualTypeSchema> {
  if (config.configType === "table" || config.configType === "card") {
    return config.configType;
  }
  return typeof config.type === "string" && chartVisualTypes.has(config.type)
    ? (config.type as z.infer<typeof visualTypeSchema>)
    : "table";
}

function parseChartConfig(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function dashboardCardLayout(
  chart: Record<string, unknown>,
  config: Record<string, unknown>,
): DashboardLayout {
  const fallback = initialLayout(config, toFiniteNumber(chart.position) ?? 0);
  return {
    x: toFiniteNumber(chart.layout_x) ?? fallback.layoutX,
    y: toFiniteNumber(chart.layout_y) ?? fallback.layoutY,
    w: toFiniteNumber(chart.layout_w) ?? fallback.layoutW,
    h: toFiniteNumber(chart.layout_h) ?? fallback.layoutH,
  };
}

async function buildDashboardSlicer(
  runtime: McpRuntime,
  slicer: Record<string, unknown>,
  runtimeTables: RuntimeTableMetadata[],
): Promise<DashboardSlicer> {
  const field = String(slicer.field ?? "");
  const base = {
    id: String(slicer.id ?? ""),
    field,
    title: typeof slicer.title === "string" ? slicer.title : null,
  };
  const parts = field
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return { ...base, options: [] };
  }

  const column = quoteIdentifier(parts[parts.length - 1]);
  const limit = Math.min(
    MAX_SLICER_OPTION_LIMIT,
    Math.max(1, toFiniteNumber(slicer.limit) ?? DEFAULT_SLICER_OPTION_LIMIT),
  );
  try {
    const tableReference = resolveRuntimeTableReferenceFromMetadata(
      quoteIdentifier(parts[parts.length - 2]),
      runtimeTables,
    );
    const result = await runtime.query(
      `SELECT DISTINCT ${column} AS value
       FROM ${tableReference}
       WHERE ${column} IS NOT NULL
       ORDER BY 1
       LIMIT ${Math.floor(limit)};`,
    );
    return {
      ...base,
      options: result.rows.map((row) => {
        const value = row.value;
        return value === null ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
          ? value
          : String(value);
      }),
    };
  } catch {
    // A slicer on a missing table or column renders with no options rather
    // than failing the whole dashboard.
    return { ...base, options: [] };
  }
}

async function loadVisualChart(
  runtime: McpRuntime,
  visualId: string,
): Promise<Record<string, unknown>> {
  const id = visualId.trim();
  const tables = await listMetadataTables(runtime);
  const chart = tables.has("dashboard_charts")
    ? (
        await runtime.query(
          `SELECT *
           FROM ${metadataTable("dashboard_charts")}
           WHERE id = ${quoteString(id)}
           LIMIT 1;`,
        )
      ).rows[0]
    : undefined;
  if (!chart) {
    throw new Error(`Visual "${id}" not found.`);
  }
  if (parseChartConfig(chart.chart_config_json).configType === "text") {
    throw new Error(`"${id}" is a text card, not a visual.`);
  }
  return chart;
}

function joinDefinitionFromRow(row: Record<string, unknown>): JoinDefinition {
  const type = row.join_type;
  return {
    leftTable: String(row.left_table ?? ""),
    leftColumn: String(row.left_column ?? ""),
    rightTable: String(row.right_table ?? ""),
    rightColumn: String(row.right_column ?? ""),
    ...(type === "inner" ||
    type === "left" ||
    type === "right" ||
    type === "full"
      ? { type: type as JoinKind }
      : {}),
  };
}

function toFiniteNumber(value: unknown): number | undefined {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function loadViewHtml(view: string, viewsDir?: string): string {
  const candidates = [
    viewsDir?.trim() ? resolve(viewsDir.trim()) : undefined,
    // Published CLI: lib/cli.js -> views/ (copied in by prepack).
    fileURLToPath(new URL("../views", import.meta.url)),
    // Workspace: src/mcp.ts or lib/cli.js -> packages/mcp-views/dist.
    fileURLToPath(new URL("../../mcp-views/dist", import.meta.url)),
  ];
  for (const dir of candidates) {
    const path = dir ? join(dir, `${view}.html`) : undefined;
    if (path && existsSync(path)) {
      return readFileSync(path, "utf8");
    }
  }
  return `<!doctype html><html><body style="font-family:sans-serif;padding:16px">
<p>The Pondview ${view} view has not been built. Run <code>bun run mcp-views:build</code> and reconnect.</p>
</body></html>`;
}

function openInBrowserNudge(url: string): string {
  return (
    `Open this in a browser to view it: ${url}\n` +
    "If you have an in-app/preview browser tool, render it there instead of just returning the link."
  );
}

function normalizeAppUrl(value: string | undefined): string {
  const trimmed = value?.trim() || DEFAULT_BRIDGE_APP_URL;
  return trimmed.replace(/\/+$/, "");
}

function dashboardUrl(appUrl: string, dashboardId?: string): string {
  const path = dashboardId
    ? `/dashboards/view?id=${encodeURIComponent(dashboardId)}&pondviewMode=dashboard`
    : "/dashboards?pondviewMode=dashboard";
  return `${appUrl}${path}`;
}

function visualUrl(appUrl: string, visualId: string): string {
  return `${appUrl}/visual/${encodeURIComponent(visualId)}?pondviewMode=dashboard`;
}

function uiUrl(
  appUrl: string,
  input: {
    view?: z.infer<typeof uiViewSchema>;
    dashboardId?: string;
    analysisId?: string;
  },
): string {
  const view = input.view ?? "app";
  if (view === "dashboards") {
    return dashboardUrl(appUrl);
  }
  if (view === "dashboard") {
    return dashboardUrl(appUrl, input.dashboardId?.trim() || undefined);
  }
  if (view === "analyses") {
    return `${appUrl}/analysis/all`;
  }
  if (view === "analysis") {
    const analysisId = input.analysisId?.trim();
    return analysisId
      ? `${appUrl}/analysis?id=${encodeURIComponent(analysisId)}`
      : `${appUrl}/analysis`;
  }
  return appUrl;
}

function metadataTable(table: string): string {
  return `${quoteIdentifier(METADATA_SCHEMA)}.${quoteIdentifier(table)}`;
}

async function listMetadataTables(runtime: McpRuntime): Promise<Set<string>> {
  const result = await runtime.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = ${quoteString(METADATA_SCHEMA)};`,
  );
  return new Set(result.rows.map((row) => String(row.table_name ?? "")));
}

async function listDashboardSummaries(
  runtime: McpRuntime,
  appUrl: string,
): Promise<Array<Record<string, unknown>>> {
  const tables = await listMetadataTables(runtime);
  if (!tables.has("dashboards")) {
    return [];
  }

  const chartCount = tables.has("dashboard_charts")
    ? `(SELECT COUNT(*) FROM ${metadataTable("dashboard_charts")} c WHERE c.dashboard_id = d.id)`
    : "0";
  const measureCount = tables.has("dashboard_measures")
    ? `(SELECT COUNT(*) FROM ${metadataTable("dashboard_measures")} m WHERE m.dashboard_id = d.id)`
    : "0";
  const slicerCount = tables.has("dashboard_slicers")
    ? `(SELECT COUNT(*) FROM ${metadataTable("dashboard_slicers")} s WHERE s.dashboard_id = d.id)`
    : "0";
  const result = await runtime.query(
    `SELECT
       d.id,
       d.title,
       d.created_at,
       d.updated_at,
       d.columns,
       d.auto_fit_rows,
       d.runtime_backend,
       d.storage_status,
       d.project_path,
       ${chartCount} AS chart_count,
       ${measureCount} AS measure_count,
       ${slicerCount} AS slicer_count
     FROM ${metadataTable("dashboards")} d
     ORDER BY d.updated_at DESC;`,
  );

  return result.rows.map((row) => ({
    ...row,
    url: dashboardUrl(appUrl, String(row.id ?? "")),
  }));
}

async function getDashboardSnapshot(
  runtime: McpRuntime,
  appUrl: string,
  dashboardId: string,
): Promise<Record<string, unknown>> {
  const id = dashboardId.trim();
  const tables = await listMetadataTables(runtime);
  if (!tables.has("dashboards")) {
    return emptyDashboardSnapshot(appUrl, id);
  }

  const dashboardResult = await runtime.query(
    `SELECT *
     FROM ${metadataTable("dashboards")}
     WHERE id = ${quoteString(id)}
     LIMIT 1;`,
  );
  const dashboard = dashboardResult.rows[0] ?? null;
  if (!dashboard) {
    return emptyDashboardSnapshot(appUrl, id);
  }

  return {
    dashboard: {
      ...dashboard,
      url: dashboardUrl(appUrl, id),
    },
    charts: await queryDashboardRows(runtime, tables, "dashboard_charts", id),
    measures: await queryDashboardRows(
      runtime,
      tables,
      "dashboard_measures",
      id,
    ),
    slicers: await queryDashboardRows(runtime, tables, "dashboard_slicers", id),
    joinDefs: await queryDashboardRows(
      runtime,
      tables,
      "dashboard_join_defs",
      id,
    ),
    url: dashboardUrl(appUrl, id),
  };
}

async function listVisualSummaries(
  runtime: McpRuntime,
  appUrl: string,
  dashboardId?: string,
): Promise<Array<Record<string, unknown>>> {
  const tables = await listMetadataTables(runtime);
  if (!tables.has("dashboard_charts")) {
    return [];
  }

  const id = dashboardId?.trim();
  const dashboardTitleSelect = tables.has("dashboards")
    ? ", d.title AS dashboard_title"
    : ", NULL AS dashboard_title";
  const dashboardJoin = tables.has("dashboards")
    ? `LEFT JOIN ${metadataTable("dashboards")} d ON d.id = c.dashboard_id`
    : "";
  const where = id ? `WHERE c.dashboard_id = ${quoteString(id)}` : "";
  const result = await runtime.query(
    `SELECT
       c.id,
       c.dashboard_id,
       c.title,
       c.description,
       c.chart_config_json,
       c.position,
       c.created_at,
       c.updated_at
       ${dashboardTitleSelect}
     FROM ${metadataTable("dashboard_charts")} c
     ${dashboardJoin}
     ${where}
     ORDER BY c.updated_at DESC, c.position ASC;`,
  );

  return result.rows.map((row) => visualSummaryFromRow(row, appUrl));
}

async function getVisualSnapshot(
  runtime: McpRuntime,
  appUrl: string,
  visualId: string,
): Promise<Record<string, unknown>> {
  const id = visualId.trim();
  const tables = await listMetadataTables(runtime);
  if (!tables.has("dashboard_charts")) {
    return emptyVisualSnapshot(appUrl, id);
  }

  const dashboardTitleSelect = tables.has("dashboards")
    ? ", d.title AS dashboard_title"
    : ", NULL AS dashboard_title";
  const dashboardJoin = tables.has("dashboards")
    ? `LEFT JOIN ${metadataTable("dashboards")} d ON d.id = c.dashboard_id`
    : "";
  const result = await runtime.query(
    `SELECT
       c.*
       ${dashboardTitleSelect}
     FROM ${metadataTable("dashboard_charts")} c
     ${dashboardJoin}
     WHERE c.id = ${quoteString(id)}
     LIMIT 1;`,
  );
  const visual = result.rows[0] ?? null;
  if (!visual) {
    return emptyVisualSnapshot(appUrl, id);
  }

  return {
    visual: {
      ...visual,
      ...visualConfigMetadata(visual.chart_config_json),
      dashboardUrl: dashboardUrl(appUrl, String(visual.dashboard_id ?? "")),
      visualUrl: visualUrl(appUrl, String(visual.id ?? id)),
    },
    visualId: id,
    url: visualUrl(appUrl, id),
    visualUrl: visualUrl(appUrl, id),
  };
}

function emptyVisualSnapshot(
  appUrl: string,
  visualId: string,
): Record<string, unknown> {
  return {
    visual: null,
    visualId,
    url: visualUrl(appUrl, visualId),
    visualUrl: visualUrl(appUrl, visualId),
  };
}

function visualSummaryFromRow(
  row: Record<string, unknown>,
  appUrl: string,
): Record<string, unknown> {
  const id = String(row.id ?? "");
  const dashboardId = String(row.dashboard_id ?? "");
  return {
    id,
    visualId: id,
    dashboardId,
    dashboardTitle: row.dashboard_title ?? null,
    title: row.title ?? null,
    description: row.description ?? null,
    ...visualConfigMetadata(row.chart_config_json),
    position: row.position ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    dashboardUrl: dashboardUrl(appUrl, dashboardId),
    visualUrl: visualUrl(appUrl, id),
  };
}

function visualConfigMetadata(value: unknown): {
  configType: string | null;
  type: string | null;
} {
  if (typeof value !== "string") {
    return { configType: null, type: null };
  }
  try {
    const config = JSON.parse(value) as Record<string, unknown>;
    return {
      configType:
        typeof config.configType === "string"
          ? config.configType
          : typeof config.visualType === "string"
            ? config.visualType
            : null,
      type: typeof config.type === "string" ? config.type : null,
    };
  } catch {
    return { configType: null, type: null };
  }
}

function emptyDashboardSnapshot(
  appUrl: string,
  dashboardId: string,
): Record<string, unknown> {
  return {
    dashboard: null,
    charts: [],
    measures: [],
    slicers: [],
    joinDefs: [],
    url: dashboardUrl(appUrl, dashboardId),
  };
}

async function queryDashboardRows(
  runtime: McpRuntime,
  tables: Set<string>,
  table: string,
  dashboardId: string,
  orderBy = table === "dashboard_join_defs" ? "position" : "created_at",
): Promise<Array<Record<string, unknown>>> {
  if (!tables.has(table)) {
    return [];
  }
  const result = await runtime.query(
    `SELECT *
     FROM ${metadataTable(table)}
     WHERE dashboard_id = ${quoteString(dashboardId)}
     ORDER BY ${quoteIdentifier(orderBy)};`,
  );
  return result.rows;
}

async function ensureDashboardMetadata(runtime: McpRuntime): Promise<void> {
  await runtime.query(
    `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)};`,
  );
  await runtime.query(
    `CREATE TABLE IF NOT EXISTS ${metadataTable("dashboards")} (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      columns INTEGER NOT NULL DEFAULT 4,
      auto_fit_rows BOOLEAN NOT NULL DEFAULT FALSE,
      runtime_backend TEXT NOT NULL,
      active_snapshot_id TEXT,
      home_db_identifier TEXT,
      home_sql_backend TEXT,
      storage_status TEXT NOT NULL DEFAULT 'best-effort',
      project_path TEXT
    );`,
  );
  await runtime.query(
    `CREATE TABLE IF NOT EXISTS ${metadataTable("dashboard_charts")} (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      title TEXT,
      description TEXT,
      sql TEXT NOT NULL,
      db_identifier TEXT,
      catalog_context TEXT,
      sql_backend TEXT,
      source_sql TEXT NOT NULL,
      source_descriptor_json TEXT NOT NULL,
      snapshot_id TEXT,
      chart_config_json TEXT NOT NULL,
      semantic_query_json TEXT,
      explore_name TEXT,
      position INTEGER NOT NULL,
      layout_x INTEGER,
      layout_y INTEGER,
      layout_w INTEGER,
      layout_h INTEGER,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );`,
  );
}

async function ensureDashboardForVisual(
  runtime: McpRuntime,
  input: { id?: string; title?: string; fallbackTitle: string },
): Promise<{ dashboardId: string }> {
  // Adding a card to an existing dashboard keeps its title unless the caller
  // passes a new one.
  const id = input.id?.trim();
  if (id && !input.title) {
    const tables = await listMetadataTables(runtime);
    if (tables.has("dashboards")) {
      const existing = await runtime.query(
        `SELECT id FROM ${metadataTable("dashboards")}
         WHERE id = ${quoteString(id)};`,
      );
      if (existing.rows.length > 0) {
        return { dashboardId: id };
      }
    }
  }
  const handlers = createBridgeMcpToolHandlers(runtime, {
    allowWriteSql: true,
  });
  return handlers.createDashboard({
    id,
    title: input.title ?? input.fallbackTitle,
  });
}

async function nextChartPosition(
  runtime: McpRuntime,
  dashboardId: string,
): Promise<number> {
  await ensureDashboardMetadata(runtime);
  const result = await runtime.query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS position
     FROM ${metadataTable("dashboard_charts")}
     WHERE dashboard_id = ${quoteString(dashboardId)};`,
  );
  const raw = result.rows[0]?.position;
  const position =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : 0;
  return Number.isFinite(position) ? position : 0;
}

async function insertDashboardChart(
  runtime: McpRuntime,
  input: {
    id: string;
    dashboardId: string;
    title: string;
    description?: string | null;
    sql: string;
    chartConfig: Record<string, unknown>;
    position: number;
    layout: {
      layoutX: number;
      layoutY: number;
      layoutW: number;
      layoutH: number;
    };
    now: number;
  },
): Promise<void> {
  await runtime.query(
    `INSERT OR REPLACE INTO ${metadataTable("dashboard_charts")} (
      id,
      dashboard_id,
      title,
      description,
      sql,
      db_identifier,
      catalog_context,
      sql_backend,
      source_sql,
      source_descriptor_json,
      snapshot_id,
      chart_config_json,
      semantic_query_json,
      explore_name,
      position,
      layout_x,
      layout_y,
      layout_w,
      layout_h,
      created_at,
      updated_at
    ) VALUES (
      ${quoteString(input.id)},
      ${quoteString(input.dashboardId)},
      ${quoteString(input.title)},
      ${sqlNullableString(input.description)},
      ${quoteString(input.sql)},
      NULL,
      NULL,
      'bridge',
      ${quoteString(input.sql)},
      ${quoteString(JSON.stringify(defaultBridgeSourceDescriptor()))},
      NULL,
      ${quoteString(JSON.stringify(input.chartConfig))},
      NULL,
      NULL,
      ${input.position},
      ${input.layout.layoutX},
      ${input.layout.layoutY},
      ${input.layout.layoutW},
      ${input.layout.layoutH},
      COALESCE((SELECT created_at FROM ${metadataTable("dashboard_charts")} WHERE id = ${quoteString(input.id)}), ${input.now}),
      ${input.now}
    );`,
  );
}

async function touchDashboard(
  runtime: McpRuntime,
  dashboardId: string,
  updatedAt: number,
): Promise<void> {
  await runtime.query(
    `UPDATE ${metadataTable("dashboards")}
     SET updated_at = ${updatedAt}
     WHERE id = ${quoteString(dashboardId)};`,
  );
}

function buildVisualConfig(
  input: {
    title: string;
    description?: string;
    visualType: z.infer<typeof visualTypeSchema>;
    xKey?: string;
    yKeys?: string[];
    chartConfig?: Record<string, unknown>;
  },
  columns: Array<{ name: string }>,
): Record<string, unknown> {
  if (input.visualType === "table") {
    return {
      configType: "table",
      title: input.title,
      description: input.description ?? "",
      ...(input.chartConfig ?? {}),
    };
  }

  if (input.visualType === "card") {
    return {
      configType: "card",
      title: input.title,
      description: input.description ?? "",
      ...(input.chartConfig ?? {}),
    };
  }

  const xKey = input.xKey ?? columns[0]?.name ?? "";
  const yKeys =
    input.yKeys && input.yKeys.length > 0
      ? input.yKeys
      : columns
          .slice(1)
          .filter((column) => column.name !== xKey)
          .map((column) => column.name)
          .slice(0, 3);

  return {
    visualType: "chart",
    title: input.title,
    description: input.description ?? "",
    type: input.visualType,
    xKey,
    yKeys,
    multipleLines: false,
    legend: yKeys.length > 1,
    countMode: false,
    showGrid: true,
    showXAxis: true,
    showYAxis: true,
    showDots: input.visualType === "line",
    showTooltip: true,
    lineSize: 2,
    labelYAngle: -90,
    ...(input.chartConfig ?? {}),
  };
}

function buildTextCardConfig(
  input: {
    content: string;
    colSpan?: number;
  },
  title: string,
): Record<string, unknown> {
  return {
    configType: "text",
    title,
    content: input.content,
    ...(input.colSpan === undefined ? {} : { colSpan: input.colSpan }),
  };
}

function initialLayout(
  chartConfig: Record<string, unknown>,
  position: number,
): { layoutX: number; layoutY: number; layoutW: number; layoutH: number } {
  const rawColSpan = chartConfig.colSpan;
  const layoutW =
    typeof rawColSpan === "number" && Number.isFinite(rawColSpan)
      ? Math.min(4, Math.max(1, Math.round(rawColSpan)))
      : chartConfig.configType === "card"
        ? 1
        : 2;
  return {
    layoutX: (position * layoutW) % 4,
    layoutY: Math.floor((position * layoutW) / 4),
    layoutW,
    layoutH: chartConfig.configType === "card" ? 1 : 2,
  };
}

function defaultBridgeSourceDescriptor(): Record<string, unknown> {
  return {
    kind: "runtime",
    runtimeBackend: "bridge",
    dbIdentifier: null,
    catalogContext: null,
  };
}

function createStableId(value: string, prefix: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug || prefix}-${randomUUID().slice(0, 8)}`;
}

export function resolveMcpDatabasePath(
  options: BridgeMcpOptions,
): string | undefined {
  if (options.databasePath?.trim()) {
    return resolve(options.databasePath.trim());
  }

  const projectDir = options.projectDir?.trim();
  if (!projectDir) {
    return undefined;
  }

  const projects = new BridgeProjectStore({ rootPath: projectDir });
  return (
    resolveProjectDefaultDatabasePath(projects) ??
    createProjectDatabasePath(projects.rootPath)
  );
}

function assertSqlAllowed(sql: string, allowWriteSql: boolean): void {
  if (allowWriteSql || isReadOnlySql(sql)) {
    return;
  }

  throw new Error(
    "execute_sql only allows read-only SQL by default. Restart pondview mcp with --allow-write-sql to permit writes.",
  );
}

function isReadOnlySql(sql: string): boolean {
  const normalized = stripLeadingSqlComments(sql).trimStart().toLowerCase();
  return (
    normalized.startsWith("select") ||
    normalized.startsWith("with") ||
    normalized.startsWith("show") ||
    normalized.startsWith("describe") ||
    normalized.startsWith("explain")
  );
}

function stripLeadingSqlComments(sql: string): string {
  let remaining = sql;
  while (true) {
    const trimmed = remaining.trimStart();
    if (trimmed.startsWith("--")) {
      const newlineIndex = trimmed.indexOf("\n");
      remaining = newlineIndex === -1 ? "" : trimmed.slice(newlineIndex + 1);
      continue;
    }
    if (trimmed.startsWith("/*")) {
      const endIndex = trimmed.indexOf("*/");
      remaining = endIndex === -1 ? "" : trimmed.slice(endIndex + 2);
      continue;
    }
    return trimmed;
  }
}

function normalizeIdentifierPart(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if (first === '"' && last === '"') {
      return trimmed.slice(1, -1).replace(/""/g, '"').toLowerCase();
    }
    if (first === "`" && last === "`") {
      return trimmed.slice(1, -1).replace(/``/g, "`").toLowerCase();
    }
  }
  return trimmed.toLowerCase();
}

function splitTableReference(reference: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "`" | null = null;

  for (let index = 0; index < reference.length; index += 1) {
    const char = reference[index];

    if (quote) {
      current += char;
      if (char === quote) {
        const next = reference[index + 1];
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }

    if (char === ".") {
      const part = current.trim();
      if (!part) {
        return [];
      }
      parts.push(part);
      current = "";
      continue;
    }

    current += char;
  }

  if (quote) {
    return [];
  }

  const finalPart = current.trim();
  if (!finalPart) {
    return [];
  }
  parts.push(finalPart);
  return parts;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNullableString(value: string | null | undefined): string {
  return value === null || value === undefined ? "NULL" : quoteString(value);
}

function isDefaultTableSchema(schema: string): boolean {
  const normalized = schema.trim().toLowerCase();
  return normalized === "" || normalized === "main" || normalized === "public";
}

function buildRuntimeTableReference(
  table: Pick<
    RuntimeTableMetadata,
    "table_catalog" | "table_schema" | "table_name"
  >,
): string {
  const catalog = table.table_catalog.trim();
  const schema = table.table_schema.trim();
  const name = table.table_name.trim();
  const parts =
    catalog && isDefaultTableSchema(schema)
      ? [catalog, name]
      : catalog
        ? [catalog, schema, name]
        : isDefaultTableSchema(schema)
          ? [name]
          : [schema, name];

  return parts.map(quoteIdentifier).join(".");
}

function resolveRuntimeTableReferenceFromMetadata(
  tableReference: string,
  tables: RuntimeTableMetadata[],
): string {
  const parts = splitTableReference(tableReference);
  if (parts.length === 0 || parts.length > 3) {
    return tableReference;
  }

  const normalizedParts = parts.map(normalizeIdentifierPart);
  const matches = tables.filter((table) => {
    const catalog = table.table_catalog.trim().toLowerCase();
    const schema = table.table_schema.trim().toLowerCase();
    const name = table.table_name.trim().toLowerCase();

    if (normalizedParts.length === 1) {
      return name === normalizedParts[0];
    }

    if (normalizedParts.length === 2) {
      const [qualifier, tableName] = normalizedParts;
      return (
        name === tableName &&
        (schema === qualifier ||
          catalog === qualifier ||
          (isDefaultTableSchema(qualifier) && isDefaultTableSchema(schema)))
      );
    }

    const [catalogName, schemaName, tableName] = normalizedParts;
    return (
      catalog === catalogName && schema === schemaName && name === tableName
    );
  });

  if (matches.length === 0) {
    return tableReference;
  }

  if (matches.length > 1) {
    const options = matches.map(buildRuntimeTableReference).join(", ");
    throw new Error(
      `Table reference "${tableReference}" is ambiguous. Use one of: ${options}`,
    );
  }

  return buildRuntimeTableReference(matches[0]);
}
