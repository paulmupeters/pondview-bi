import { tool } from "ai";
import { z } from "zod";
import { runQuery } from "@/lib/sql/run-query";
import {
  resolveDbIdentifierForSqlBackend,
  resolveSqlBackend,
} from "@/lib/sql/sql-runtime";
import type { Result } from "@/lib/types";

function normalizeRows(rows: Record<string, unknown>[]): Result[] {
  const normalizeValue = (value: unknown): string | number | boolean | Date => {
    if (value instanceof Date) return value;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }
    if (value === null || value === undefined) return "";
    return JSON.stringify(value);
  };

  return rows.map((row) => {
    const normalized: Result = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = normalizeValue(value);
    }
    return normalized;
  });
}

async function runSqlForRuntime(
  databasePath: string | undefined,
  sql: string,
): Promise<Result[]> {
  const backend = resolveSqlBackend({ dbIdentifier: databasePath });
  const dbIdentifier = resolveDbIdentifierForSqlBackend(databasePath, backend);
  const result = await runQuery({ sql, dbIdentifier });
  return normalizeRows(result.rows);
}

export const getTableSchemaTool = tool({
  description:
    "Get the schema of a table, including column names, types and sample data",
  inputSchema: z.object({
    table: z.string().describe("The table name to get schema for"),
    databasePath: z
      .string()
      .optional()
      .describe(
        "Optional database identifier/path to query. Omit to use the selected Query Runtime.",
      ),
  }),
  execute: async ({ table, databasePath }) => {
    const describeSql = `DESCRIBE ${table}`;

    const schemaRows = (await runSqlForRuntime(
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
      sampleRows = await runSqlForRuntime(
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
