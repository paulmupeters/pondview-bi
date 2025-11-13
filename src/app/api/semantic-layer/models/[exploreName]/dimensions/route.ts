import type { NextRequest } from "next/server";
import {
  addDimension,
  removeDimension,
} from "@/../semantic-layer/model-updater";
import type { DimensionDef } from "@/../semantic-layer/types";
import { join } from "node:path";
import { materializeSemanticLayer } from "@/lib/materialization/semantic-layer";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ exploreName: string }> }
) {
  const { exploreName } = await params;
  const body = (await req.json()) as DimensionDef;

  if (!body.name || !body.sql || !body.type) {
    return new Response("name, sql, and type are required", { status: 400 });
  }

  try {
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const result = addDimension(modelsDir, exploreName, body);
    const materialization =
      result.added || result.created
        ? await materializeSemanticLayer({
            modelsDir,
            exploreName,
          })
        : [];

    return Response.json({
      success: true,
      created: result.created,
      added: result.added,
      materialization: materialization[0] ?? null,
    });
  } catch (error) {
    console.error("[Semantic Layer] Failed to add dimension:", error);
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
  const dimensionName = searchParams.get("name");

  if (!dimensionName) {
    return new Response("name query parameter is required", { status: 400 });
  }

  try {
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const removed = removeDimension(modelsDir, exploreName, dimensionName);
    const materialization = removed
      ? await materializeSemanticLayer({
          modelsDir,
          exploreName,
        })
      : [];

    return Response.json({
      success: true,
      removed,
      materialization: materialization[0] ?? null,
    });
  } catch (error) {
    console.error("[Semantic Layer] Failed to remove dimension:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

