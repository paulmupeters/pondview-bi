import type { NextRequest } from "next/server";
import { getChartById, updateChartConfig } from "@/lib/repositories/dashboard";

export const runtime = "nodejs";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ chartId: string }> },
) {
  const { chartId } = await params;
  const chart = await getChartById(chartId);
  if (!chart) {
    return new Response("Chart not found", { status: 404 });
  }
  const body = (await req.json()) as { chartConfigJson?: string };
  if (!body?.chartConfigJson) {
    return new Response("chartConfigJson is required", { status: 400 });
  }
  await updateChartConfig(chartId, body.chartConfigJson);
  return Response.json({ ok: true });
}


