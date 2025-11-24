import { join } from "node:path";
import type { NextRequest } from "next/server";
import { loadModelsFromDirectory } from "@/../semantic-layer/model-loader";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const dataModel = loadModelsFromDirectory(modelsDir);
    return Response.json(dataModel);
  } catch (error) {
    console.error("[Semantic Layer Models] Failed to load models:", error);
    return Response.json(
      {
        error: "Failed to load semantic layer models",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
