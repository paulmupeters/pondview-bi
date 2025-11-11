import type { NextRequest } from "next/server";
import { addMeasure, removeMeasure } from "@/../semantic-layer/model-updater";
import type { MeasureDef } from "@/../semantic-layer/types";
import { join } from "node:path";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ exploreName: string }> }
) {
  const { exploreName } = await params;
  const body = (await req.json()) as MeasureDef;

  if (!body.name || !body.agg) {
    return new Response("name and agg are required", { status: 400 });
  }

  try {
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const result = addMeasure(modelsDir, exploreName, body);

    return Response.json({
      success: true,
      created: result.created,
      added: result.added,
    });
  } catch (error) {
    console.error("[Semantic Layer] Failed to add measure:", error);
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
  const measureName = searchParams.get("name");

  if (!measureName) {
    return new Response("name query parameter is required", { status: 400 });
  }

  try {
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const removed = removeMeasure(modelsDir, exploreName, measureName);

    return Response.json({
      success: true,
      removed,
    });
  } catch (error) {
    console.error("[Semantic Layer] Failed to remove measure:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

