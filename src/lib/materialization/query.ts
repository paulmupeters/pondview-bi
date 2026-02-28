import {
  getMaterializationDbPath,
  runSqlAndGetRowObjectsJson,
} from "@/lib/duckdb/duckdb-node";
import type { Result } from "@/lib/types";

export async function runMaterializedSqlRaw(
  sql: string
): Promise<Record<string, unknown>[]> {
  const dbPath = getMaterializationDbPath();
  return runSqlAndGetRowObjectsJson(dbPath, sql);
}

export async function runMaterializedSqlNormalized(sql: string): Promise<Result[]> {
  const rows = await runMaterializedSqlRaw(sql);
  return normalizeRows(rows);
}

function normalizeRows(rawRows: Record<string, unknown>[]): Result[] {
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

  return rawRows.map((row) => {
    const out: Record<string, string | number | boolean | Date> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = normalizeValue(value);
    }
    return out;
  });
}
