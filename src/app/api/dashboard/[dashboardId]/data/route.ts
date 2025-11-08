import type { NextRequest } from "next/server";
import { listChartsByDashboard } from "@/lib/repositories/dashboard";
import { runSqlNormalized } from "@/lib/db/router";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  const charts = await listChartsByDashboard(dashboardId);
  const results = await Promise.all(
    charts.map(async (c) => {
      try {
        const rows = await runSqlNormalized(c.dbIdentifier || "md:my_db", c.sql);
        return { ...c, rows };
      } catch (e) {
        return { ...c, rows: [] as any[] };
      }
    }),
  );
  return Response.json({ charts: results });
}


