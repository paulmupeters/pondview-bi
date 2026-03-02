import { resolveHttpDuckDbConfig } from "@/lib/duckdb/duckdb-http";
import { runSqlAndGetRowObjectsJsonHttp } from "@/lib/duckdb/duckdb-node";

export const runtime = "nodejs";

export type DuckdbTableEntry = {
  schema: string;
  name: string;
  type: string;
};

export type DuckdbTablesResponse = {
  tables: DuckdbTableEntry[];
  configured: boolean;
  host?: string;
  port?: number;
  error?: string;
};

export async function GET(_req: Request) {
  try {
    // Resolve HTTP config from environment variables
    let config: ReturnType<typeof resolveHttpDuckDbConfig>;
    try {
      config = resolveHttpDuckDbConfig();
    } catch {
      // Not configured — return early with configured: false
      return Response.json({ tables: [], configured: false } satisfies DuckdbTablesResponse);
    }

    const connectionMeta = { configured: true, host: config.host, port: config.port };

    // First, try to detach any problematic postgres attachments that might be lingering
    // This prevents information_schema queries from failing when scanning attached databases
    try {
      const commonPostgresAliases = [
        "postgres",
        "pg",
        "postgresql",
        "postgres_source",
      ];
      for (const alias of commonPostgresAliases) {
        try {
          await runSqlAndGetRowObjectsJsonHttp(
            config,
            `DETACH DATABASE IF EXISTS "${alias}";`
          );
        } catch {
          // Ignore errors - database might not exist or already detached
        }
      }
    } catch {
      // Ignore errors during cleanup - continue with the query
    }

    // Query DuckDB HTTP for all tables across all schemas
    const sql = `
      SELECT table_schema, table_name, table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      ORDER BY table_schema, table_name
    `;
    let rows: Record<string, unknown>[];

    try {
      rows = await runSqlAndGetRowObjectsJsonHttp(config, sql);
    } catch {
      // Fallback: use SHOW ALL TABLES if information_schema fails
      try {
        rows = await runSqlAndGetRowObjectsJsonHttp(
          config,
          "SHOW ALL TABLES;"
        );
        // SHOW ALL TABLES returns columns: database, schema, name, column_names, column_types, temporary
        const tables: DuckdbTableEntry[] = rows
          .filter(
            (row) =>
              String(row.schema ?? "") !== "information_schema" &&
              String(row.schema ?? "") !== "pg_catalog"
          )
          .map((row) => ({
            schema: String(row.schema ?? ""),
            name: String(row.name ?? ""),
            type: "BASE TABLE",
          }));
        return Response.json({ tables, ...connectionMeta } satisfies DuckdbTablesResponse);
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError ?? "");
        console.error(
          "[DuckDB Tables API] Both information_schema and SHOW ALL TABLES failed:",
          fallbackMessage
        );
        return Response.json(
          { tables: [], error: fallbackMessage, ...connectionMeta } satisfies DuckdbTablesResponse,
          { status: 500 },
        );
      }
    }

    const tables: DuckdbTableEntry[] = rows.map((row) => ({
      schema: String(row.table_schema ?? ""),
      name: String(row.table_name ?? ""),
      type: String(row.table_type ?? ""),
    }));

    return Response.json({ tables, ...connectionMeta } satisfies DuckdbTablesResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "");

    // Check if this is a connection error to an external database
    const isConnectionError =
      message.includes("Connection refused") ||
      message.includes("Unable to connect") ||
      message.includes("connection to server");

    if (isConnectionError) {
      console.warn(
        "[DuckDB Tables API] Connection error (likely from attached database):",
        message,
        "\nTip: Restart the DuckDB HTTP server to clear lingering attachments."
      );
      return Response.json({ tables: [], configured: true, error: message } satisfies DuckdbTablesResponse);
    }

    console.error("[DuckDB Tables API] Error:", message);
    return Response.json(
      { error: message, tables: [], configured: true } satisfies DuckdbTablesResponse,
      { status: 500 },
    );
  }
}
