import { runSqlAndGetRowObjectsJson as runRaw } from "@/lib/duckdb/duckdb-node";
import { resolveDbPath } from "@/lib/duckdb/path";
import type { Result } from "@/lib/types";

export async function runSqlNormalized(
  dbIdentifier: string,
  sql: string,
): Promise<Result[]> {
  const dbPath = resolveDbPath(dbIdentifier);
  const rawRows = await runRaw(dbPath, sql);


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
