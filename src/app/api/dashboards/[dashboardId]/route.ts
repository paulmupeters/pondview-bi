import type { NextRequest } from "next/server";
import {
  deleteDashboard,
  updateDashboardTitle,
} from "@/lib/repositories/dashboard";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  const result = await deleteDashboard(dashboardId);
  if (!result.deleted) {
    return new Response("Dashboard not found", { status: 404 });
  }
  return new Response(null, { status: 204 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  const { title } = (await req.json()) as { title?: string };
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) {
    return new Response("Title is required", { status: 400 });
  }
  const result = await updateDashboardTitle(dashboardId, trimmedTitle);
  if (!result.updated) {
    return new Response("Dashboard not found", { status: 404 });
  }
  return Response.json({ id: dashboardId, title: trimmedTitle });
}
