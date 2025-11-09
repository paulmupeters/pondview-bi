import type { NextRequest } from "next/server";
import {
  addChartToDashboard,
  getChartById,
  listChartsByDashboard,
  removeChartFromDashboard,
  reorderDashboardCharts,
} from "@/lib/repositories/dashboard";
import { updateModelFromSQL } from "@/../semantic-layer";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> }
) {
  const { dashboardId } = await params;
  const charts = await listChartsByDashboard(dashboardId);
  return Response.json({ charts });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> }
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
    return new Response("sql and chartConfigJson are required", {
      status: 400,
    });
  }
  const { id } = await addChartToDashboard({
    dashboardId,
    title: body.title ?? null,
    description: body.description ?? null,
    sql: body.sql,
    dbIdentifier: body.dbIdentifier ?? null,
    chartConfigJson: body.chartConfigJson,
  });

  // Update semantic layer models based on SQL
  try {
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const updateResult = updateModelFromSQL(body.sql, modelsDir);

    if (updateResult.success) {
      console.log(
        `[Semantic Layer] Updated model ${updateResult.exploreName}:`,
        `created=${updateResult.created},`,
        `dimensions=${updateResult.addedDimensions},`,
        `measures=${updateResult.addedMeasures}`
      );
    } else {
      console.error(
        `[Semantic Layer] Failed to update model:`,
        updateResult.error
      );
    }
  } catch (error) {
    // Log error but don't fail the chart creation
    console.error("[Semantic Layer] Error updating model:", error);
  }

  return Response.json({ id });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> }
) {
  const { dashboardId } = await params;
  const { chartIds } = (await req.json()) as { chartIds?: unknown };
  if (
    !Array.isArray(chartIds) ||
    chartIds.some((id) => typeof id !== "string")
  ) {
    return new Response("chartIds must be an array of strings", {
      status: 400,
    });
  }
  try {
    await reorderDashboardCharts(dashboardId, chartIds as string[]);
  } catch {
    return new Response("Invalid chart ordering", { status: 400 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> }
) {
  const { dashboardId } = await params;
  const { searchParams } = new URL(req.url);
  const chartId = searchParams.get("chartId");
  if (!chartId) {
    return new Response("chartId is required", { status: 400 });
  }
  // Verify chart belongs to dashboard before deleting
  const chart = await getChartById(chartId);
  if (!chart || chart.dashboardId !== dashboardId) {
    return new Response("Chart not found in dashboard", { status: 404 });
  }
  const result = await removeChartFromDashboard(chartId);
  if (!result.removed) {
    return new Response("Chart not found", { status: 404 });
  }
  return Response.json({ ok: true });
}
