import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tool } from "ai";
import { z } from "zod";

function parseFrontmatterName(content: string): string | undefined {
  const match = content.match(/^---\n[\s\S]*?^name:\s*(.+)$/m);
  return match?.[1]?.trim();
}

export const readSkillsMdToolServer = tool({
  description:
    "Read datasource business context before writing SQL so you understand required filters, table mappings, business rules, and quirks.",
  inputSchema: z.object({
    datasource: z
      .string()
      .optional()
      .describe(
        "The name of the datasource to load context for. If omitted, all available context files are returned.",
      ),
  }),
  execute: async ({ datasource }) => {
    const contextDir = join(process.cwd(), "docs", "datasource-context");

    if (!existsSync(contextDir)) {
      return { content: "No business logic documentation found." };
    }

    const files = readdirSync(contextDir).filter((f) => f.endsWith(".md"));
    if (files.length === 0) {
      return { content: "No business logic documentation found." };
    }

    if (datasource) {
      for (const file of files) {
        const raw = readFileSync(join(contextDir, file), "utf-8");
        const name = parseFrontmatterName(raw);
        if (name && name.toLowerCase() === datasource.toLowerCase()) {
          return { content: raw };
        }
      }
      return { content: "No documentation found for the specified datasource." };
    }

    const combined = files
      .map((f) => readFileSync(join(contextDir, f), "utf-8"))
      .join("\n\n---\n\n");

    return { content: combined };
  },
});
