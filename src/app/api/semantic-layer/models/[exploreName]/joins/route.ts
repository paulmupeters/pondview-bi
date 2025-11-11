import type { NextRequest } from "next/server";
import { addJoin, removeJoin } from "@/../semantic-layer/model-updater";
import type { JoinDef } from "@/../semantic-layer/types";
import { join } from "node:path";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ exploreName: string }> }
) {
  const { exploreName } = await params;
  const body = (await req.json()) as JoinDef;

  if (!body.name || !body.to || !body.type || !body.on) {
    return new Response("name, to, type, and on are required", { status: 400 });
  }

  try {
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const result = addJoin(modelsDir, exploreName, body);

    return Response.json({
      success: true,
      created: result.created,
      added: result.added,
    });
  } catch (error) {
    console.error("[Semantic Layer] Failed to add join:", error);
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
  const joinName = searchParams.get("name");

  if (!joinName) {
    return new Response("name query parameter is required", { status: 400 });
  }

  try {
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const removed = removeJoin(modelsDir, exploreName, joinName);

    return Response.json({
      success: true,
      removed,
    });
  } catch (error) {
    console.error("[Semantic Layer] Failed to remove join:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

