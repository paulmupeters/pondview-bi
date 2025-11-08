import { NextRequest } from "next/server";
import { createDashboard, listDashboards } from "@/lib/repositories/dashboard";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listDashboards();
  return Response.json({ dashboards: rows });
}

export async function POST(req: NextRequest) {
  const { title } = (await req.json()) as { title?: string };
  if (!title || title.trim().length === 0) {
    return new Response("Title is required", { status: 400 });
  }
  const { id } = await createDashboard(title.trim());
  return Response.json({ id });
}


