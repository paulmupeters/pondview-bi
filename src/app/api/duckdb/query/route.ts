import type { NextRequest } from "next/server";

import {
  type HttpDuckDbConfig,
  runSqlAndGetRowObjectsJson,
  runSqlAndGetRowObjectsJsonHttp,
} from "@/lib/duckdb/duckdb-node";
import { resolveDbPath } from "@/lib/duckdb/path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      sql: string;
      config?: HttpDuckDbConfig;
      dbIdentifier?: string;
    };

    if (!body?.sql) {
      return Response.json({ error: "SQL query is required" }, { status: 400 });
    }

    // If dbIdentifier is provided, use local/MotherDuck connection
    if (body.dbIdentifier) {
      const dbPath = resolveDbPath(body.dbIdentifier);
      const rows = await runSqlAndGetRowObjectsJson(dbPath, body.sql);
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
