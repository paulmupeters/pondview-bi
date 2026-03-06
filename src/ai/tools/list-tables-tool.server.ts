import { tool } from "ai";
import { z } from "zod";
import { getTables } from "@/lib/db/router";

export const listTablesToolServer = tool({
  description:
    "List all available tables in a datasource. Use this to discover what tables exist before writing SQL.",
  inputSchema: z.object({
    databasePath: z
      .string()
      .describe("Database identifier/path to query (e.g. md:my_db)")
      .default("md:my_db"),
  }),
  execute: async ({ databasePath }) => {
    const tables = await getTables(databasePath);
    return { tables, count: tables.length };
  },
});
