import { tool } from "ai";
import { z } from "zod";
import { runSqlNormalized } from "@/lib/db/router";
import type { Result } from "@/lib/types";

export const runPreviewToolServer = tool({
  description:
    "Fetch 5 sample rows from a table to inspect data formats and values (e.g. how boolean/date fields are stored). Use this before writing a filtered query.",
  inputSchema: z.object({
    table: z
      .string()
      .describe("The table name to preview (can be schema-qualified, e.g. public.users)"),
    databasePath: z
      .string()
      .describe("Database identifier/path to query (e.g. md:my_db)")
      .default("md:my_db"),
  }),
  execute: async ({ table, databasePath }) => {
    const rows = (await runSqlNormalized(
      databasePath,
      `SELECT * FROM ${table} LIMIT 5`,
    )) as Result[];

    const columns =
      rows.length > 0
        ? Object.keys(rows[0]).map((name) => ({ name }))
        : [];

    return { table, columns, rows };
  },
});
