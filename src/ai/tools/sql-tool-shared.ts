import { runQuery } from "@/lib/sql/run-query";
import {
  resolveDbIdentifierForSqlBackend,
  resolveSqlBackend,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import type { Result } from "@/lib/types";

export function normalizeRows(rows: Record<string, unknown>[]): Result[] {
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

export function deriveColumns(
  rows: Result[],
): Array<{ name: string; type: string }> {
  if (rows.length === 0) {
    return [];
  }

  return Object.keys(rows[0]).map((name) => ({
    name,
    type: "string",
  }));
}

export async function executeSqlForRuntime(
  sql: string,
  databasePath?: string,
): Promise<{
  rows: Result[];
  durationMs: number;
  backend: SqlBackend;
  dbIdentifier?: string;
}> {
  const backend = resolveSqlBackend({ dbIdentifier: databasePath });
  const dbIdentifier = resolveDbIdentifierForSqlBackend(databasePath, backend);
  const response = await runQuery({ sql, dbIdentifier });
  return {
    rows: normalizeRows(response.rows),
    durationMs: response.durationMs,
    backend: response.backend,
    dbIdentifier,
  };
}
