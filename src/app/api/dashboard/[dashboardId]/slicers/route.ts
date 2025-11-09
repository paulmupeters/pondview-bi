import type { NextRequest } from "next/server";

const repoPromise = import("@/lib/repositories/dashboard");

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  const repo = await repoPromise;
  const slicers = await repo.listSlicersByDashboard(dashboardId);
  return Response.json({ slicers });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  const body = (await req.json()) as {
    field: string;
    title?: string | null;
    limit?: number;
  };
  if (!body?.field) {
    return new Response("field is required", { status: 400 });
  }
  const repo = await repoPromise;
  const { id } = await repo.addSlicerToDashboard({
    dashboardId,
    field: body.field,
    title: body.title ?? null,
    limit: body.limit,
  });
  return Response.json({ id });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  const body = (await req.json()) as {
    slicerId?: string;
    slicerIds?: string[]; // for reordering
    title?: string | null;
    limit?: number;
  };
  const repo = await repoPromise;

  // Handle reordering
  if (body.slicerIds && Array.isArray(body.slicerIds)) {
    if (body.slicerIds.some((id) => typeof id !== "string")) {
      return new Response("slicerIds must be an array of strings", {
        status: 400,
      });
    }
    try {
      await repo.reorderDashboardSlicers(dashboardId, body.slicerIds as string[]);
      return Response.json({ ok: true });
    } catch {
      return new Response("Invalid slicer ordering", { status: 400 });
    }
  }

  // Handle single slicer update
  if (!body.slicerId) {
    return new Response("slicerId is required for updates", { status: 400 });
  }
  const result = await repo.updateSlicer({
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
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId: _dashboardId } = await params;
  const { searchParams } = new URL(req.url);
  const slicerId = searchParams.get("id");
  if (!slicerId) {
    return new Response("id is required", { status: 400 });
  }
  const repo = await repoPromise;
  const result = await repo.removeSlicerFromDashboard(slicerId);
  if (!result.removed) {
    return new Response("Slicer not found", { status: 404 });
  }
  return Response.json({ ok: true });
}
