import { tool } from "ai";
import { z } from "zod";
import { runSqlNormalized } from "@/lib/db/router";
import type { Result } from "@/lib/types";

export const getTableSchemaToolServer = tool({
  description:
    "Get the schema of a table, including column names, types and sample data",
  inputSchema: z.object({
    table: z.string().describe("The table name to get schema for"),
    databasePath: z
      .string()
      .describe("Database identifier/path to query (e.g. md:my_db)")
      .default("md:my_db"),
  }),
  execute: async ({ table, databasePath }) => {
    const describeSql = `DESCRIBE ${table}`;

    const schemaRows = (await runSqlNormalized(
      databasePath,
      describeSql,
    )) as Array<{
      column_name: string;
      column_type: string;
      null: string;
      key: string;
      default: string | null;
      extra: string | null;
    }>;

    let sampleRows: Result[] = [];
    try {
      sampleRows = await runSqlNormalized(
        databasePath,
        `SELECT * FROM ${table} LIMIT 5`,
      );
    } catch (error) {
      console.warn(
        `[getTableSchemaTool] Failed to fetch sample rows for ${table}:`,
        error,
      );
    }

    return {
      table,
      columns: schemaRows.map((col) => ({
        name: col.column_name,
        type: col.column_type,
        nullable: col.null === "YES",
        key: col.key,
        default: col.default,
        extra: col.extra,
      })),
      sampleRows,
    };
  },
});
