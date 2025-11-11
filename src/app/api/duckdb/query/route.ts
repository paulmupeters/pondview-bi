import { NextRequest } from "next/server";

import {
  type HttpDuckDbConfig,
  runSqlAndGetRowObjectsJsonHttp,
} from "@/lib/duckdb/duckdb-node";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      sql: string;
      config?: HttpDuckDbConfig;
    };

    if (!body?.sql) {
      return Response.json({ error: "SQL query is required" }, { status: 400 });
    }

    const rows = await runSqlAndGetRowObjectsJsonHttp(
      body.config,
      body.sql,
      req.signal,
    );

    return Response.json({ rows });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    return Response.json({ error: message }, { status: 500 });
  }
}

