import { getChartById, updateChartConfig, updateChartSql } from "@/lib/repositories/dashboard";

export const runtime = "nodejs";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ chartId: string }> },
) {
  const { chartId } = await params;
  const chart = await getChartById(chartId);
  if (!chart) {
    return new Response("Chart not found", { status: 404 });
  }
  const body = (await req.json()) as { chartConfigJson?: string; sql?: string };
  if (body?.chartConfigJson) {
    await updateChartConfig(chartId, body.chartConfigJson);
  }
  if (body?.sql) {
    await updateChartSql(chartId, body.sql);
  }
  if (!body?.chartConfigJson && !body?.sql) {
    return new Response("chartConfigJson or sql is required", { status: 400 });
  }
  return Response.json({ ok: true });
}


