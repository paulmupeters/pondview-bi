import type { NextRequest } from "next/server";
import {
  addSegment,
  removeSegment,
} from "@/../semantic-layer/model-updater";
import type { SegmentDef } from "@/../semantic-layer/types";
import { join } from "node:path";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ exploreName: string }> }
) {
  const { exploreName } = await params;
  const body = (await req.json()) as SegmentDef;

  if (!body.name || !body.sql) {
    return new Response("name and sql are required", { status: 400 });
  }

  try {
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const result = addSegment(modelsDir, exploreName, body);

    return Response.json({
      success: true,
      created: result.created,
      added: result.added,
    });
  } catch (error) {
    console.error("[Semantic Layer] Failed to add segment:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ exploreName: string }> }
) {
  const { exploreName } = await params;
  const { searchParams } = new URL(req.url);
  const segmentName = searchParams.get("name");

  if (!segmentName) {
    return new Response("name query parameter is required", { status: 400 });
  }

  try {
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const removed = removeSegment(modelsDir, exploreName, segmentName);

    return Response.json({
      success: true,
      removed,
    });
  } catch (error) {
    console.error("[Semantic Layer] Failed to remove segment:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

