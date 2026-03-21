import { tool } from "ai";
import { z } from "zod";
import { runQuery } from "@/lib/sql/run-query";

export const listTablesTool = tool({
  description:
    "List all available tables in a datasource. Use this to discover what tables exist before writing SQL.",
  inputSchema: z.object({
    databasePath: z
      .string()
      .describe("Database identifier/path to query (e.g. wasm:local)")
      .default("wasm:local"),
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

    const result = await runQuery({ sql, dbIdentifier: databasePath });

    const tables = result.rows.map((row) => ({
      table_schema: String(row.table_schema ?? ""),
      table_name: String(row.table_name ?? ""),
      table_type: String(row.table_type ?? ""),
    }));

    return { tables, count: tables.length };
  },
});
