import { tool } from "ai";
import { z } from "zod";
import { runQuery } from "@/lib/sql/run-query";
import type { Result } from "@/lib/types";

function normalizeRows(rows: Record<string, unknown>[]): Result[] {
  return rows.map((row) => {
    const normalized: Result = {};
    for (const [key, value] of Object.entries(row)) {
      if (value instanceof Date) {
        normalized[key] = value;
      } else if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        normalized[key] = value;
      } else if (value === null || value === undefined) {
        normalized[key] = "";
      } else {
        normalized[key] = JSON.stringify(value);
      }
    }
    return normalized;
  });
}

export const runPreviewTool = tool({
  description:
    "Fetch 5 sample rows from a table to inspect data formats and values (e.g. how boolean/date fields are stored). Use this before writing a filtered query.",
  inputSchema: z.object({
    table: z
      .string()
      .describe("The table name to preview (can be schema-qualified, e.g. public.users)"),
    databasePath: z
      .string()
      .describe("Database identifier/path to query (e.g. wasm:local)")
      .default("wasm:local"),
  }),
  execute: async ({ table, databasePath }) => {
    const result = await runQuery({
      sql: `SELECT * FROM ${table} LIMIT 5`,
      dbIdentifier: databasePath,
    });

    const rows = normalizeRows(result.rows);
    const columns =
      rows.length > 0
        ? Object.keys(rows[0]).map((name) => ({ name }))
        : [];

    return { table, columns, rows };
  },
});
