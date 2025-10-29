import type { NextRequest } from "next/server";
import {
  addChartToDashboard,
  listChartsByDashboard,
  reorderDashboardCharts,
} from "@/lib/repositories/dashboard";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  const charts = await listChartsByDashboard(dashboardId);
  return Response.json({ charts });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  const body = (await req.json()) as {
    title?: string | null;
    description?: string | null;
    sql: string;
    dbIdentifier?: string | null;
    chartConfigJson: string;
  };
  if (!body?.sql || !body?.chartConfigJson) {
    return new Response("sql and chartConfigJson are required", { status: 400 });
  }
  const { id } = await addChartToDashboard({
    dashboardId,
    title: body.title ?? null,
    description: body.description ?? null,
    sql: body.sql,
    dbIdentifier: body.dbIdentifier ?? null,
    chartConfigJson: body.chartConfigJson,
  });
  return Response.json({ id });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  const { chartIds } = (await req.json()) as { chartIds?: unknown };
  if (!Array.isArray(chartIds) || chartIds.some((id) => typeof id !== "string")) {
    return new Response("chartIds must be an array of strings", { status: 400 });
  }
  try {
    await reorderDashboardCharts(dashboardId, chartIds as string[]);
  } catch {
    return new Response("Invalid chart ordering", { status: 400 });
  }
  return Response.json({ ok: true });
}


