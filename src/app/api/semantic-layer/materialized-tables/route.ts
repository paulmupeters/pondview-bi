import type { NextRequest } from "next/server";
import { runMaterializedSqlRaw } from "@/lib/materialization/query";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const rows = await runMaterializedSqlRaw(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'mat'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `
    );
    const tableNames = rows.map((row) => String(row.table_name ?? ""));
    return Response.json({ tables: tableNames.filter(Boolean) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.error("[Materialized Tables API] Error:", message);
    return Response.json({ error: message, tables: [] }, { status: 500 });
  }
}
