import { tool } from "ai";
import { z } from "zod";
import { runQuery } from "@/lib/sql/run-query";
import { resolveToolRuntimeTarget } from "./sql-tool-shared";

export const listTablesTool = tool({
  description:
    "List all available tables in a datasource. Use this to discover what tables exist before writing SQL.",
  inputSchema: z.object({
    databasePath: z
      .string()
      .optional()
      .describe(
        "Optional database identifier/path to query. Omit to use the selected Query Runtime.",
      ),
  }),
  execute: async ({ databasePath }) => {
    const sql = `
      SELECT
        table_schema,
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      ORDER BY table_schema, table_name
    `;

    const { dbIdentifier } = resolveToolRuntimeTarget(databasePath);
    const result = await runQuery({ sql, dbIdentifier });

    const tables = result.rows.map((row) => ({
      table_schema: String(row.table_schema ?? ""),
      table_name: String(row.table_name ?? ""),
      table_type: String(row.table_type ?? ""),
    }));

    return { tables, count: tables.length };
  },
});
