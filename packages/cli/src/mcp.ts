import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
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

const visualTypeSchema = z.enum([
  "line",
  "bar",
  "area",
  "pie",
  "table",
  "card",
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
          ${quoteString(chartId)},
          ${quoteString(dashboard.dashboardId)},
          ${quoteString(input.title)},
          ${sqlNullableString(input.description)},
          ${quoteString(input.sql)},
          NULL,
          NULL,
          'bridge',
          ${quoteString(input.sql)},
          ${quoteString(JSON.stringify(defaultBridgeSourceDescriptor()))},
          NULL,
          ${quoteString(JSON.stringify(chartConfig))},
          NULL,
          NULL,
          ${position},
          ${layout.layoutX},
          ${layout.layoutY},
          ${layout.layoutW},
          ${layout.layoutH},
          COALESCE((SELECT created_at FROM ${metadataTable("dashboard_charts")} WHERE id = ${quoteString(chartId)}), ${now}),
          ${now}
        );`,
      );
      await touchDashboard(runtime, dashboard.dashboardId, now);

      return {
        dashboardId: dashboard.dashboardId,
        visualId: chartId,
        title: input.title,
        rowsPreviewed: result.rows.length,
        url: dashboardUrl(appUrl, dashboard.dashboardId),
      };
    },
    openDashboard: async (dashboardId?: string) => ({
      dashboardId: dashboardId?.trim() || null,
      url: dashboardUrl(appUrl, dashboardId?.trim() || undefined),
    }),
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
    "create_dashboard",
    {
      description:
        "Create or update a Pondview dashboard and return a local URL that the agent can open in a browser.",
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
        "Create a Pondview dashboard visual from SQL and return a local dashboard URL. visualType can be line, bar, area, pie, table, or card.",
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
    "open_dashboard",
    {
      description:
        "Return the local Pondview dashboard URL for the agent to open in a browser.",
      inputSchema: {
        dashboardId: z.string().min(1).optional(),
      },
    },
    async ({ dashboardId }) =>
      toToolResult(await handlers.openDashboard(dashboardId)),
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

function toToolResult(value: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
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

function metadataTable(table: string): string {
  return `${quoteIdentifier(METADATA_SCHEMA)}.${quoteIdentifier(table)}`;
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
