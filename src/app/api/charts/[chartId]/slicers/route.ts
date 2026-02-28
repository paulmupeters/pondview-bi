import type { NextRequest } from "next/server";
import {
  addSlicerToChart,
  getChartById,
  listSlicersByChart,
  removeSlicerFromChart,
  reorderChartSlicers,
  updateChartSlicer,
} from "@/lib/repositories/dashboard";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chartId: string }> },
) {
  const { chartId } = await params;
  const chart = await getChartById(chartId);
  if (!chart) {
    return new Response("Chart not found", { status: 404 });
  }
  const slicers = await listSlicersByChart(chartId);
  return Response.json({ slicers });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chartId: string }> },
) {
  const { chartId } = await params;
  const chart = await getChartById(chartId);
  if (!chart) {
    return new Response("Chart not found", { status: 404 });
  }
  const body = (await req.json()) as {
    field: string;
    title?: string | null;
    limit?: number;
  };
  if (!body?.field) {
    return new Response("field is required", { status: 400 });
  }
  const { id } = await addSlicerToChart({
    chartId,
    field: body.field,
    title: body.title ?? null,
    limit: body.limit,
  });
  return Response.json({ id });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chartId: string }> },
) {
  const { chartId } = await params;
  const chart = await getChartById(chartId);
  if (!chart) {
    return new Response("Chart not found", { status: 404 });
  }
  const body = (await req.json()) as {
    slicerId?: string;
    slicerIds?: string[];
    title?: string | null;
    limit?: number;
  };

  if (body.slicerIds && Array.isArray(body.slicerIds)) {
    if (body.slicerIds.some((id) => typeof id !== "string")) {
      return new Response("slicerIds must be an array of strings", {
        status: 400,
      });
    }
    try {
      await reorderChartSlicers(chartId, body.slicerIds);
      return Response.json({ ok: true });
    } catch {
      return new Response("Invalid slicer ordering", { status: 400 });
    }
  }

  if (!body.slicerId) {
    return new Response("slicerId is required for updates", { status: 400 });
  }

  const result = await updateChartSlicer({
    slicerId: body.slicerId,
    title: body.title,
    limit: body.limit,
  });
  if (!result.updated) {
    return new Response("Slicer not found", { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ chartId: string }> },
) {
  const { chartId } = await params;
  const chart = await getChartById(chartId);
  if (!chart) {
    return new Response("Chart not found", { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const slicerId = searchParams.get("id");
  if (!slicerId) {
    return new Response("id is required", { status: 400 });
  }
  const result = await removeSlicerFromChart(slicerId);
  if (!result.removed) {
    return new Response("Slicer not found", { status: 404 });
  }
  return Response.json({ ok: true });
}
