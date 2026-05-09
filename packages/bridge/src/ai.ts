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

  return {
    list_tables: tool({
      description: "List all tables available in the Bridge DuckDB runtime.",
      inputSchema: z.object({ databasePath: z.string().optional() }),
      execute: async () => {
        const result = await executeSql(`
          SELECT table_schema, table_name, table_type
          FROM information_schema.tables
          WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
          ORDER BY table_schema, table_name
        `);
        return { tables: result.rows, count: result.rows.length };
      },
    }),
    get_table_schema: tool({
      description: "Get column metadata and a small sample for a table.",
      inputSchema: z.object({
        table: z.string(),
        databasePath: z.string().optional(),
      }),
      execute: async ({ table }) => {
        const schema = await executeSql(`DESCRIBE ${table}`);
        const sample = await executeSql(`SELECT * FROM ${table} LIMIT 5`).catch(
          () => ({ rows: [] }),
        );
        return {
          table,
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
        const result = await executeSql(`SELECT * FROM ${table} LIMIT 5`);
        return { table, columns: result.columns, rows: result.rows };
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
        "Execute the final SQL for the current notebook cell and return the committed result.",
      inputSchema: z.object({
        sql: z.string(),
        databasePath: z.string().optional(),
        userQuery: z.string().optional(),
        generateChart: z.boolean().optional().default(true),
      }),
      execute: async ({ sql }) => {
        const result = await executeSql(sql);
        const queryType = sql.trim().split(/\s+/)[0]?.toUpperCase() || "SELECT";
        const artifactId = randomUUID();
        const createdAt = Date.now();
        const finalData = {
          title: "SQL Query Results",
          stage: "complete" as const,
          progress: 1 as const,
          query: sql,
          sqlBackend: "bridge",
          executionTime: result.durationMs,
          rowCount: result.rows.length,
          columns: result.columns,
          rows: result.rows,
          visualType: "table" as const,
          summary: {
            totalRows: result.rows.length,
            executionTimeMs: result.durationMs,
            queryType,
            insights: [`Query returned ${result.rows.length} rows`],
          },
        };
        return {
          text: `Executed ${queryType} query successfully using Bridge. Retrieved ${result.rows.length} rows in ${result.durationMs}ms.`,
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

function normalizeRows(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};
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

  return `You are Pondview's BI analysis assistant. Help the user analyze data and write useful DuckDB SQL. Use this connected-table context: ${tableContext}`;
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
