import type { NextRequest } from "next/server";
import { updateSourcesFromConnectedTable } from "@/../semantic-layer/source-updater";
import { join } from "node:path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    table?: string;
    schema?: string;
    tables?: string[];
  };

  if (!body || (!body.table && !body.schema)) {
    return new Response("table or schema is required", { status: 400 });
  }

  try {
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const result = updateSourcesFromConnectedTable(modelsDir, body);

    return Response.json({
      success: true,
      created: result.created,
      addedSources: result.addedSources,
    });
  } catch (error) {
    console.error("[Semantic Layer] Failed to update sources:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
