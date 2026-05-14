import { tool } from "ai";
import { z } from "zod";
import { listRuntimeTables } from "./sql-tool-shared";

export const listTablesTool = tool({
  description:
    "List all available tables in a datasource. Use table_reference exactly when calling schema, preview, or SQL tools.",
  inputSchema: z.object({
    databasePath: z
      .string()
      .optional()
      .describe(
        "Optional database identifier/path to query. Omit to use the selected Query Runtime.",
      ),
  }),
  execute: async ({ databasePath }) => {
    const tables = await listRuntimeTables(databasePath);
    return { tables, count: tables.length };
  },
});
