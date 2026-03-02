import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { generateConnectionId, storeCredential } from "@/lib/credentials";
import {
  type SourceEntry,
  updateSourcesFromConnectedTable,
} from "@/lib/sources/source-config";

export const runtime = "nodejs";

export async function GET(_req: Request) {
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
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    table?: string;
    schema?: string;
    tables?: string[];
    type?: string;
    databasePath?: string;
    databaseName?: string;
    attachAs?: string;
    readOnly?: boolean;
    duckdbExtension?: string;
  };

  if (!body || (!body.table && !body.schema)) {
    return new Response("table or schema is required", { status: 400 });
  }

  try {
    // Generate a connectionId and store the raw credential in .env.local
    let connectionId: string | undefined;
    if (body.databasePath) {
      connectionId = generateConnectionId();
      storeCredential(connectionId, body.databasePath);
    }

    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    const result = updateSourcesFromConnectedTable(modelsDir, {
      table: body.table,
      schema: body.schema,
      tables: body.tables,
      type: body.type,
      // Pass connectionId instead of raw databasePath to the source config
      connectionId,
      attachAs: body.attachAs,
      readOnly: body.readOnly,
      duckdbExtension: body.duckdbExtension,
    });

    return Response.json({
      success: true,
      created: result.created,
      addedSources: result.addedSources,
      connectionId,
    });
  } catch (error) {
    console.error("[Semantic Layer] Failed to update sources:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
