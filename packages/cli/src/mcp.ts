import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  type CallToolResult,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { BridgeQueryResponse } from "@pondview/bridge-protocol";
import { z } from "zod";
import { BridgeProjectStore } from "./project-store";
import { DuckDbRuntime } from "./runtime/duckdb-runtime";
import { BridgeSecretStore } from "./secrets";
import {
  createProjectDatabasePath,
  resolveProjectDefaultDatabasePath,
} from "./server";

const DEFAULT_QUERY_LIMIT = 500;
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
}

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
    createVisual: async (input: {
      dashboardId?: string;
      dashboardTitle?: string;
      title: string;
      description?: string;
      sql: string;
      visualType: z.infer<typeof visualTypeSchema>;
      xKey?: string;
      yKeys?: string[];
      chartConfig?: Record<string, unknown>;
    }) => {
      assertSqlAllowed(input.sql, Boolean(options.allowWriteSql));
      const result = await runtime.query(input.sql, DEFAULT_QUERY_LIMIT);
      const dashboard = await ensureDashboardForVisual(runtime, {
        id: input.dashboardId,
        title: input.dashboardTitle ?? "Pondview Visuals",
      });
      const chartId = createStableId(input.title, "visual");
      const now = Date.now();
      const position = await nextChartPosition(runtime, dashboard.dashboardId);
      const chartConfig = buildVisualConfig(input, result.columns);
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
        title: input.dashboardTitle ?? "Pondview Notes",
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
  options: Pick<BridgeMcpOptions, "allowWriteSql" | "appUrl"> = {},
): McpServer {
  const server = new McpServer({
    name: "pondview-bridge",
    version: "0.1.0",
  });
  const handlers = createBridgeMcpToolHandlers(runtime, options);

  server.registerTool(
    "list_tables",
    {
      description:
        "List tables available in the Pondview Bridge DuckDB runtime. Use table_reference exactly in other Pondview MCP tools.",
      inputSchema: {},
    },
    async () => toToolResult(await handlers.listTables()),
  );

  server.registerTool(
    "get_table_schema",
    {
      description: "Get column metadata and a small sample for a table.",
      inputSchema: {
        table: z.string().min(1),
      },
    },
    async ({ table }) => toToolResult(await handlers.getTableSchema(table)),
  );

  server.registerTool(
    "run_preview",
    {
      description: "Fetch up to 5 sample rows from a table.",
      inputSchema: {
        table: z.string().min(1),
      },
    },
    async ({ table }) => toToolResult(await handlers.runPreview(table)),
  );

  server.registerTool(
    "execute_sql",
    {
      description:
        "Execute SQL in the Pondview Bridge DuckDB runtime. Read-only SQL is allowed by default; writes require starting the MCP server with --allow-write-sql.",
      inputSchema: {
        sql: z.string().min(1),
        limit: z.number().int().positive().max(5000).optional(),
      },
    },
    async ({ sql, limit }) =>
      toToolResult(
        await handlers.executeSql(sql, limit ?? DEFAULT_QUERY_LIMIT),
      ),
  );

  server.registerTool(
    "list_dashboards",
    {
      description:
        "List existing Pondview dashboards, including chart counts and dashboard URLs.",
      inputSchema: {},
    },
    async () => toToolResult(await handlers.listDashboards()),
  );

  server.registerTool(
    "get_dashboard",
    {
      description:
        "Get a Pondview dashboard with its charts, measures, slicers, join definitions, and URL.",
      inputSchema: {
        dashboardId: z.string().min(1),
      },
    },
    async ({ dashboardId }) =>
      toToolResult(await handlers.getDashboard(dashboardId)),
  );

  server.registerTool(
    "list_visuals",
    {
      description:
        "List Pondview dashboard visuals, optionally filtered by dashboard, including standalone visual URLs.",
      inputSchema: {
        dashboardId: z.string().min(1).optional(),
      },
    },
    async ({ dashboardId }) =>
      toToolResult(await handlers.listVisuals(dashboardId)),
  );

  server.registerTool(
    "get_visual",
    {
      description:
        "Get one Pondview dashboard visual by id, including its standalone visual URL.",
      inputSchema: {
        visualId: z.string().min(1),
      },
    },
    async ({ visualId }) => toToolResult(await handlers.getVisual(visualId)),
  );

  server.registerTool(
    "create_dashboard",
    {
      description:
        "Create or update a Pondview dashboard and return a local URL. After calling this, open the returned URL in a browser or in-app preview so the user sees the rendered dashboard instead of a raw link.",
      inputSchema: {
        title: z.string().min(1),
        id: z.string().min(1).optional(),
      },
    },
    async (input) => toToolResult(await handlers.createDashboard(input)),
  );

  server.registerTool(
    "create_visual",
    {
      description:
        "Create a Pondview dashboard visual from SQL and return a local dashboard URL. After calling this, open the returned URL in a browser or in-app preview so the user sees the rendered visual instead of a raw link. visualType can be line, bar, area, pie, table, or card.",
      inputSchema: {
        dashboardId: z.string().min(1).optional(),
        dashboardTitle: z.string().min(1).optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        sql: z.string().min(1),
        visualType: visualTypeSchema,
        xKey: z.string().min(1).optional(),
        yKeys: z.array(z.string().min(1)).optional(),
        chartConfig: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (input) => toToolResult(await handlers.createVisual(input)),
  );

  server.registerTool(
    "create_text_card",
    {
      description:
        "Create a markdown text card on a Pondview dashboard and return a local dashboard URL. Use this for narrative notes, headings, and explanations that do not need SQL. After calling this, open the returned URL in a browser or in-app preview so the user sees the rendered card instead of a raw link.",
      inputSchema: {
        dashboardId: z.string().min(1).optional(),
        dashboardTitle: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        content: z.string().min(1),
        colSpan: z.number().int().min(1).max(4).optional(),
      },
    },
    async (input) => toToolResult(await handlers.createTextCard(input)),
  );

  server.registerTool(
    "open_ui",
    {
      description:
        "Return a local Pondview UI URL for the app, dashboards, a dashboard, analyses, or an analysis. This tool does not open anything itself, but if you have a browser or in-app preview tool you should open the returned URL there so the user sees the rendered UI.",
      inputSchema: {
        view: uiViewSchema.optional(),
        dashboardId: z.string().min(1).optional(),
        analysisId: z.string().min(1).optional(),
      },
    },
    async (input) => toToolResult(await handlers.openUi(input)),
  );

  server.registerTool(
    "open_dashboard",
    {
      description:
        "Return the local Pondview dashboard URL. After calling this, open the returned URL in a browser or in-app preview so the user sees the rendered dashboard instead of a raw link.",
      inputSchema: {
        dashboardId: z.string().min(1).optional(),
      },
    },
    async ({ dashboardId }) =>
      toToolResult(await handlers.openDashboard(dashboardId)),
  );

  server.registerTool(
    "open_visual",
    {
      description:
        "Return a local Pondview standalone visual URL. After calling this, open the returned URL in a browser or in-app preview so the user sees the rendered visual instead of a raw link.",
      inputSchema: {
        visualId: z.string().min(1),
      },
    },
    async ({ visualId }) => toToolResult(await handlers.openVisual(visualId)),
  );

  return server;
}

export async function runBridgeMcpServerWithRuntime(
  runtime: McpRuntime,
  options: Pick<BridgeMcpOptions, "allowWriteSql" | "appUrl"> = {},
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
  options: Pick<BridgeMcpOptions, "allowWriteSql" | "appUrl"> = {},
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
): Promise<Array<Record<string, unknown>>> {
  if (!tables.has(table)) {
    return [];
  }
  const orderBy = table === "dashboard_join_defs" ? "position" : "created_at";
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
  input: { id?: string; title: string },
): Promise<{ dashboardId: string }> {
  const handlers = createBridgeMcpToolHandlers(runtime, {
    allowWriteSql: true,
  });
  return handlers.createDashboard(input);
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
