import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { NextRequest } from "next/server";
import {
  type SourceEntry,
  updateSourcesFromConnectedTable,
} from "@/../semantic-layer/source-updater";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const filePath = join(modelsDir, "sources.yml");
    if (!existsSync(filePath)) {
      return Response.json({ sources: [] });
    }
    const content = readFileSync(filePath, "utf-8");
    const yamlData = yaml.load(content) as {
      version: number;
      sources: SourceEntry[];
    };
    return Response.json({ sources: yamlData.sources || [] });
  } catch (error) {
    console.error("[Semantic Layer Sources] Failed to load sources:", error);
    return Response.json(
      {
        error: "Failed to load sources",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    table?: string;
    schema?: string;
    tables?: string[];
    type?: string;
    databasePath?: string;
    attachAs?: string;
    readOnly?: boolean;
    duckdbExtension?: string;
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
