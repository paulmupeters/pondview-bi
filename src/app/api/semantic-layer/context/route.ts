import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

function parseFrontmatter(content: string): { name?: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { body: content };

  const frontmatter = match[1];
  const body = match[2];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  return {
    name: nameMatch?.[1]?.trim(),
    body,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const datasource = url.searchParams.get("datasource") ?? undefined;

    const contextDir = join(process.cwd(), "semantic-layer", "context");
    if (!existsSync(contextDir)) {
      return Response.json({ content: "" });
    }

    const files = readdirSync(contextDir).filter((f) => f.endsWith(".md"));
    if (files.length === 0) {
      return Response.json({ content: "" });
    }

    if (datasource) {
      for (const file of files) {
        const raw = readFileSync(join(contextDir, file), "utf-8");
        const parsed = parseFrontmatter(raw);
        if (
          parsed.name &&
          parsed.name.toLowerCase() === datasource.toLowerCase()
        ) {
          return Response.json({ content: raw, file });
        }
      }
      return Response.json({ content: "" });
    }

    const combined = files
      .map((f) => readFileSync(join(contextDir, f), "utf-8"))
      .join("\n\n---\n\n");

    return Response.json({ content: combined });
  } catch (error) {
    console.error("[Semantic Layer Context] Failed to read context:", error);
    return Response.json(
      {
        error: "Failed to read context",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
