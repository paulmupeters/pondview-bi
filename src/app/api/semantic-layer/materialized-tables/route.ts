import type { NextRequest } from "next/server";
import { runSqlAndGetRowObjectsJsonHttp } from "@/lib/duckdb/duckdb-node";
import { resolveHttpDuckDbConfig } from "@/lib/duckdb/duckdb-http";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    // Resolve HTTP config from environment variables
    const config = resolveHttpDuckDbConfig();

    // Query DuckDB HTTP for tables in semantic_materialized schema
    const sql = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'semantic_materialized'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const rows = await runSqlAndGetRowObjectsJsonHttp(config, sql);

    const tableNames = rows.map((row) => String(row.table_name));

    return Response.json({ tables: tableNames });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    console.error("[Materialized Tables API] Error:", message);
    return Response.json(
      { error: message, tables: [] },
      { status: 500 }
    );
  }
}

