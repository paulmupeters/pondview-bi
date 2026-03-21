import { tool } from "ai";
import { z } from "zod";
import { readDatasourceContext } from "@/lib/semantic-layer/context";

export const readSkillsMdTool = tool({
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
    return {
      content:
        (await readDatasourceContext(datasource)).content ||
        "No business logic documentation found.",
    };
  },
});
