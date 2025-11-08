import type { NextRequest } from "next/server";
import { deleteDashboard } from "@/lib/repositories/dashboard";

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
