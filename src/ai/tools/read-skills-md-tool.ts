import { tool } from "ai";
import { z } from "zod";

export const readSkillsMdTool = tool({
  description:
    "Read the business logic documentation (skills.md) for a datasource. Call this FIRST before writing any SQL to understand mandatory filters, table mappings, business rules, and quirks.",
  inputSchema: z.object({
    datasource: z
      .string()
      .optional()
      .describe(
        "The name of the datasource to load context for. If omitted, all available context files are returned.",
      ),
  }),
  execute: async ({ datasource }) => {
    const params = new URLSearchParams();
    if (datasource) params.set("datasource", datasource);

    const res = await fetch(
      `/api/semantic-layer/context?${params.toString()}`,
    );

    if (!res.ok) {
      throw new Error(
        `Failed to load skills.md: ${res.status} ${res.statusText}`,
      );
    }

    const data = (await res.json()) as { content: string };
    return {
      content: data.content || "No business logic documentation found.",
    };
  },
});
