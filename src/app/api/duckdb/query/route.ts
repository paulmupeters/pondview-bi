
import {
  type HttpDuckDbConfig,
  runSqlAndGetRowObjectsJsonHttp,
} from "@/lib/duckdb/duckdb-node";
import { runSqlNormalized } from "@/lib/duckdb/query";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sql: string;
      config?: HttpDuckDbConfig;
      dbIdentifier?: string;
    };

    if (!body?.sql) {
      return Response.json({ error: "SQL query is required" }, { status: 400 });
    }

    // If dbIdentifier is provided, use runSqlNormalized which handles
    // Postgres attachments, MotherDuck, and local DuckDB connections
    if (body.dbIdentifier) {
      const rows = await runSqlNormalized(body.dbIdentifier, body.sql);
      return Response.json({ rows });
    }

    // Otherwise, use HTTP connection if config is provided
    const rows = await runSqlAndGetRowObjectsJsonHttp(
      body.config,
      body.sql,
      req.signal
    );
    return Response.json({ rows });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    console.error("error-----------s>> ", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
