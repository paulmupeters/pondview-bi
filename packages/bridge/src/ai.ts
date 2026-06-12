import { randomUUID } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { BridgeSecretAi } from "@pondview/bridge-protocol";
import {
  createAgentUIStreamResponse,
  createGateway,
  type LanguageModel,
  stepCountIs,
  ToolLoopAgent,
  tool,
} from "ai";
import { z } from "zod";
import type { DuckDbRuntime } from "./runtime/duckdb-runtime";

const XAI_BASE_URL = "https://api.x.ai/v1";
const OLLAMA_BASE_URL = "http://localhost:11434/v1";
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

type BridgeAiResultValue = string | number | boolean;
type BridgeAiResultRow = Record<string, BridgeAiResultValue>;
type BridgeAiColumn = { name: string; type?: string };

type BridgeChartConfig = {
  visualType: "chart";
  title: string;
  description: string;
  takeaway?: string;
  type: "bar" | "line" | "area" | "pie";
  xKey: string;
  yKeys: string[];
  multipleLines?: boolean;
  legend?: boolean;
  countMode?: boolean;
  showGrid?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  showDots?: boolean;
  showLine?: boolean;
  showTooltip?: boolean;
  lineSize?: number;
  labelYAngle?: number;
};

type BridgeCardConfig = {
  configType: "card";
  title: string;
  description: string;
  takeaway?: string;
};

export async function handleAiChatRequest(
  request: Request,
  config: BridgeSecretAi | undefined,
  runtime: DuckDbRuntime,
): Promise<Response> {
  if (!config) {
    return jsonError("Bridge AI provider is not configured.", 400);
  }

  const payload = (await request.json().catch(() => ({}))) as {
    messages?: unknown[];
    connectedTables?: unknown[];
    mode?: "analysis" | "sql-editor";
  };
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const agent = new ToolLoopAgent({
    model: resolveBridgeModel(config, config.model),
    instructions: buildInstructions(payload.connectedTables, payload.mode),
    tools: createBridgeAiTools(runtime),
    stopWhen: stepCountIs(8),
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    abortSignal: request.signal,
    headers: {
      "access-control-allow-origin": "*",
    },
  });
}

function createBridgeAiTools(runtime: DuckDbRuntime) {
  const executeSql = async (sql: string) => {
    const startedAt = Date.now();
    const result = await runtime.query(sql, 500);
    const rows = normalizeRows(result.rows);
    return {
      rows,
      columns: result.columns.map((column) => ({
        name: column.name,
        type: column.type,
      })),
      durationMs: Date.now() - startedAt,
    };
  };
  const listRuntimeTables = async (): Promise<RuntimeTableMetadata[]> => {
    const excludedSchemas = HIDDEN_RUNTIME_SCHEMAS.map(
      (schema) => `'${schema}'`,
    ).join(", ");
    const result = await executeSql(`
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
    list_tables: tool({
      description:
        "List all tables available in the Bridge DuckDB runtime. Use table_reference exactly when calling schema, preview, or SQL tools.",
      inputSchema: z.object({ databasePath: z.string().optional() }),
      execute: async () => {
        const tables = await listRuntimeTables();
        return { tables, count: tables.length };
      },
    }),
    get_table_schema: tool({
      description: "Get column metadata and a small sample for a table.",
      inputSchema: z.object({
        table: z.string(),
        databasePath: z.string().optional(),
      }),
      execute: async ({ table }) => {
        const resolvedTable = await resolveTableReference(table);
        const schema = await executeSql(`DESCRIBE ${resolvedTable}`);
        const sample = await executeSql(
          `SELECT * FROM ${resolvedTable} LIMIT 5`,
        ).catch(() => ({ rows: [] }));
        return {
          table: resolvedTable,
          requestedTable: table,
          columns: schema.rows,
          sampleRows: sample.rows,
        };
      },
    }),
    run_preview: tool({
      description: "Fetch 5 sample rows from a table.",
      inputSchema: z.object({
        table: z.string(),
        databasePath: z.string().optional(),
      }),
      execute: async ({ table }) => {
        const resolvedTable = await resolveTableReference(table);
        const result = await executeSql(
          `SELECT * FROM ${resolvedTable} LIMIT 5`,
        );
        return {
          table: resolvedTable,
          requestedTable: table,
          columns: result.columns,
          rows: result.rows,
        };
      },
    }),
    execute_exploratory_sql: tool({
      description: "Validate or refine a SQL draft and return preview rows.",
      inputSchema: z.object({
        sql: z.string(),
        databasePath: z.string().optional(),
      }),
      execute: async ({ sql }) => {
        const result = await executeSql(sql);
        const queryType = sql.trim().split(/\s+/)[0]?.toUpperCase() || "SELECT";
        return {
          text: `Validated ${queryType} draft successfully on Bridge. Preview returned ${result.rows.length} rows in ${result.durationMs}ms.`,
          sql,
          sqlBackend: "bridge",
          rowCount: result.rows.length,
          columns: result.columns,
          rows: result.rows,
          summary: {
            totalRows: result.rows.length,
            executionTimeMs: result.durationMs,
            queryType,
          },
        };
      },
    }),
    execute_final_sql: tool({
      description:
        "Execute the final SQL for the current notebook cell and return the committed result. Include userQuery when the user wants a chart or KPI card so Bridge can choose an appropriate visualization.",
      inputSchema: z.object({
        sql: z.string(),
        databasePath: z.string().optional(),
        userQuery: z.string().optional(),
        generateChart: z.boolean().optional().default(true),
      }),
      execute: async ({ sql, userQuery, generateChart }) => {
        const result = await executeSql(sql);
        const artifactId = randomUUID();
        const createdAt = Date.now();
        const finalData = buildBridgeFinalSqlPayload({
          sql,
          rows: result.rows,
          columns: result.columns,
          durationMs: result.durationMs,
          userQuery,
          generateChart,
        });
        return {
          text: `Executed ${finalData.summary.queryType} query successfully using Bridge. Retrieved ${result.rows.length} rows in ${result.durationMs}ms. ${finalData.summary.insights.join(
            ". ",
          )}.`,
          parts: [
            {
              type: "data-execute-sql" as const,
              data: {
                id: artifactId,
                version: 1,
                status: "complete" as const,
                progress: 1,
                payload: finalData,
                createdAt,
                updatedAt: Date.now(),
              },
            },
          ],
        };
      },
    }),
  };
}

function normalizeRows(rows: Record<string, unknown>[]): BridgeAiResultRow[] {
  return rows.map((row) => {
    const normalized: BridgeAiResultRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined) {
        normalized[key] = "";
      } else if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        normalized[key] = value;
      } else {
        normalized[key] = JSON.stringify(value);
      }
    }
    return normalized;
  });
}

export function buildBridgeFinalSqlPayload({
  sql,
  rows,
  columns,
  durationMs,
  userQuery,
  generateChart = true,
}: {
  sql: string;
  rows: BridgeAiResultRow[];
  columns: BridgeAiColumn[];
  durationMs: number;
  userQuery?: string;
  generateChart?: boolean;
}) {
  const rowCount = rows.length;
  const queryType = sql.trim().split(/\s+/)[0]?.toUpperCase() || "SELECT";
  const visualizationQuery = userQuery?.trim() || sql;
  const insights = [
    `Query returned ${rowCount} row${rowCount === 1 ? "" : "s"}`,
  ];
  let chartConfig: BridgeChartConfig | undefined;
  let cardConfig: BridgeCardConfig | undefined;
  let visualType: "table" | "chart" | "card" = "table";

  const isSingleValue = rowCount === 1 && columns.length === 1;
  const isChartWorthy =
    rowCount > 0 && rowCount <= 500 && queryType === "SELECT";
  const hasNumericData = columns.some((column) =>
    rows.some((row) => isNumericValue(row[column.name])),
  );

  if (isSingleValue) {
    const columnName = columns[0]?.name ?? "value";
    cardConfig = buildBridgeCardConfig({
      columnName,
      value: rows[0]?.[columnName],
      userQuery: visualizationQuery,
    });
    visualType = "card";
    insights.push("Card visualization generated for the single value");
  } else if (isChartWorthy && hasNumericData && generateChart) {
    chartConfig = buildBridgeChartConfig({
      rows,
      userQuery: visualizationQuery,
    });

    if (chartConfig) {
      visualType = "chart";
      insights.push("Chart visualization generated from Bridge result data");
    } else {
      insights.push(
        "Table view enabled because no chartable dimension was found",
      );
    }
  } else {
    insights.push(
      "Table view enabled, no chart or card visualization generated",
    );
  }

  return {
    title: "SQL Query Results",
    stage: "complete" as const,
    progress: 1 as const,
    query: sql,
    sqlBackend: "bridge" as const,
    executionTime: durationMs,
    rowCount,
    columns,
    rows,
    visualType,
    chartConfig,
    cardConfig,
    summary: {
      totalRows: rowCount,
      executionTimeMs: durationMs,
      queryType,
      insights,
    },
  };
}

function isNumericValue(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }

  return Number.isFinite(Number(value));
}

function isLikelyTemporalColumn(name: string, values: unknown[]): boolean {
  const normalizedName = name.toLowerCase();
  if (
    /\b(date|time|day|week|month|quarter|year|created|updated|period)\b/.test(
      normalizedName,
    )
  ) {
    return true;
  }

  return values.some((value) => {
    if (typeof value !== "string") {
      return false;
    }
    return !Number.isNaN(Date.parse(value));
  });
}

function prettifyColumnName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function truncateTitle(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
}

function buildBridgeChartConfig({
  rows,
  userQuery,
}: {
  rows: BridgeAiResultRow[];
  userQuery: string;
}): BridgeChartConfig | undefined {
  const firstRow = rows[0];
  if (!firstRow) {
    return undefined;
  }

  const columnNames = Object.keys(firstRow);
  if (columnNames.length < 2) {
    return undefined;
  }

  const numericColumns = columnNames.filter((columnName) =>
    rows.some((row) => isNumericValue(row[columnName])),
  );
  if (numericColumns.length === 0) {
    return undefined;
  }

  const xKey =
    columnNames.find((columnName) => !numericColumns.includes(columnName)) ??
    columnNames.find((columnName) => columnName !== numericColumns[0]) ??
    columnNames[0];
  const yKeys = numericColumns.filter((columnName) => columnName !== xKey);
  if (yKeys.length === 0) {
    return undefined;
  }

  const xValues = rows.map((row) => row[xKey]);
  const chartType = isLikelyTemporalColumn(xKey, xValues) ? "line" : "bar";
  const primaryMeasure = prettifyColumnName(yKeys[0]);
  const dimension = prettifyColumnName(xKey);
  const title = truncateTitle(userQuery) || `${primaryMeasure} by ${dimension}`;

  return {
    visualType: "chart",
    title,
    description: `${chartType === "line" ? "Line" : "Bar"} chart using ${dimension} on the X axis and ${yKeys
      .map(prettifyColumnName)
      .join(", ")} on the Y axis.`,
    type: chartType,
    xKey,
    yKeys,
    multipleLines: false,
    legend: yKeys.length > 1,
    countMode: false,
    showGrid: true,
    showXAxis: true,
    showYAxis: true,
    showDots: chartType === "line",
    showLine: chartType === "line",
    showTooltip: true,
    lineSize: 2,
    labelYAngle: -90,
  };
}

function buildBridgeCardConfig({
  columnName,
  value,
  userQuery,
}: {
  columnName: string;
  value: BridgeAiResultValue | undefined;
  userQuery: string;
}): BridgeCardConfig {
  const title = truncateTitle(userQuery) || prettifyColumnName(columnName);
  const prettyColumn = prettifyColumnName(columnName);

  return {
    configType: "card",
    title,
    description: `${prettyColumn}: ${String(value ?? "")}`,
  };
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
  const schema = table.table_schema.trim() || "main";
  const name = table.table_name.trim();
  const parts = catalog
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

  let normalizedParts = parts.map(normalizeIdentifierPart);
  if (normalizedParts.length === 1 && normalizedParts[0]?.includes(".")) {
    normalizedParts = splitTableReference(normalizedParts[0]).map(
      normalizeIdentifierPart,
    );
  }
  if (normalizedParts.length === 0 || normalizedParts.length > 3) {
    return tableReference;
  }
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

function resolveBridgeModel(
  config: BridgeSecretAi,
  modelId: string,
): LanguageModel {
  switch (config.provider) {
    case "gateway":
      return createGateway({ apiKey: config.apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey: config.apiKey })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey: config.apiKey })(modelId);
    case "xai":
      return createOpenAICompatible({
        apiKey: config.apiKey,
        baseURL: XAI_BASE_URL,
        name: "xai",
      })(modelId);
    case "ollama":
      return createOpenAICompatible({
        apiKey: config.apiKey || "ollama",
        baseURL: config.ollamaBaseUrl || OLLAMA_BASE_URL,
        name: "ollama",
      })(modelId);
    case "openai-compatible":
      return createOpenAICompatible({
        apiKey: config.apiKey,
        baseURL: config.openAiCompatibleUrl ?? "",
        name: config.openAiCompatibleName ?? "openai-compatible",
      })(modelId);
  }
}

function buildInstructions(
  connectedTables: unknown,
  mode: "analysis" | "sql-editor" | undefined,
): string {
  const tableContext = JSON.stringify(connectedTables ?? []);
  if (mode === "sql-editor") {
    return `You help users write, refine, fix, and understand SQL inside Pondview's SQL editor. Keep responses concise and practical. Use this connected-table context: ${tableContext}`;
  }

  return `You are Pondview's BI analysis assistant. Help the user analyze data and write useful DuckDB SQL. First use list_tables, then use the exact table_reference returned by list_tables for get_table_schema, run_preview, and SQL. Attached databases like Postgres require the catalog alias in the table reference. When the user asks for a chart, graph, trend, distribution, ranking, or KPI card, pass their original request as userQuery to execute_final_sql and leave generateChart true so Bridge can render the visualization. Use this connected-table context: ${tableContext}`;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "content-type": "application/json",
    },
  });
}
