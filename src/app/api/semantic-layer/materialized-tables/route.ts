import type { NextRequest } from "next/server";
import { resolveHttpDuckDbConfig } from "@/lib/duckdb/duckdb-http";
import { runSqlAndGetRowObjectsJsonHttp } from "@/lib/duckdb/duckdb-node";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    // Resolve HTTP config from environment variables
    const config = resolveHttpDuckDbConfig();

    // First, try to detach any problematic postgres attachments that might be lingering
    // This prevents information_schema queries from failing when scanning attached databases
    try {
      // Try to detach common postgres attachment aliases
      // These are common aliases that might have been used
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

    // Query DuckDB HTTP for tables in semantic_materialized schema
    // Use SHOW TABLES which queries only the specified schema directly
    // This avoids scanning attached databases that might be unavailable
    let sql = `SHOW TABLES FROM semantic_materialized;`;
    let rows: Record<string, unknown>[];

    try {
      rows = await runSqlAndGetRowObjectsJsonHttp(config, sql);
      // SHOW TABLES returns a column named 'name' (not 'table_name')
      const tableNames = rows.map((row) =>
        String(row.name ?? row.table_name ?? "")
      );
      return Response.json({ tables: tableNames.filter(Boolean) });
    } catch {
      // If SHOW TABLES fails, fall back to information_schema query
      // This might still fail if there are attached databases, but we'll handle it
      sql = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'semantic_materialized'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;
      rows = await runSqlAndGetRowObjectsJsonHttp(config, sql);
      const tableNames = rows.map((row) => String(row.table_name));
      return Response.json({ tables: tableNames });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "");

    // Check if this is a connection error to an external database
    const isConnectionError =
      message.includes("Connection refused") ||
      message.includes("Unable to connect") ||
      message.includes("connection to server");

    if (isConnectionError) {
      // Log the error but return empty list instead of failing
      // This allows the UI to continue working even if some attached databases are unavailable
      console.warn(
        "[Materialized Tables API] Connection error (likely from attached database):",
        message,
        "\nTip: Restart the DuckDB HTTP server to clear lingering attachments."
      );
      return Response.json({ tables: [] });
    }

    console.error("[Materialized Tables API] Error:", message);
    return Response.json({ error: message, tables: [] }, { status: 500 });
  }
}
