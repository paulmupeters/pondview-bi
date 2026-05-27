import { mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { DuckDbRuntime } from "./runtime/duckdb-runtime";
import { BridgeSecretStore } from "./secrets";

const DEFAULT_PROJECT_DATABASE_PATH = "runtime/pondview-runtime.duckdb";
const DEFAULT_QUERY_LIMIT = 500;
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
}

export function createBridgeMcpToolHandlers(
  runtime: DuckDbRuntime,
  options: Pick<BridgeMcpOptions, "allowWriteSql"> = {},
) {
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
  };
}

export function createBridgeMcpServer(
  runtime: DuckDbRuntime,
  options: Pick<BridgeMcpOptions, "allowWriteSql"> = {},
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

  return server;
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
  const server = createBridgeMcpServer(runtime, options);

  process.once("exit", () => {
    void runtime.close();
  });
  process.once("SIGINT", () => {
    void runtime.close().finally(() => process.exit(130));
  });
  process.once("SIGTERM", () => {
    void runtime.close().finally(() => process.exit(143));
  });

  await server.connect(new StdioServerTransport());
}

function toToolResult(value: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function resolveMcpDatabasePath(options: BridgeMcpOptions): string | undefined {
  if (options.databasePath?.trim()) {
    return resolve(options.databasePath.trim());
  }

  const projectDir = options.projectDir?.trim();
  if (!projectDir) {
    return undefined;
  }

  const projectRoot = resolve(projectDir);
  const databasePath = isAbsolute(DEFAULT_PROJECT_DATABASE_PATH)
    ? resolve(DEFAULT_PROJECT_DATABASE_PATH)
    : resolve(projectRoot, DEFAULT_PROJECT_DATABASE_PATH);
  mkdirSync(resolve(databasePath, ".."), { recursive: true });
  return databasePath;
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
