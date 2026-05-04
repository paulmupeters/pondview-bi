import { runQuery } from "@/lib/sql/run-query";
import {
  classifyDbIdentifier,
  DEFAULT_WASM_DB_IDENTIFIER,
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

export function resolveToolRuntimeTarget(databasePath?: string): {
  backend: SqlBackend;
  dbIdentifier?: string;
} {
  const backend = resolveSqlBackend({ dbIdentifier: databasePath });
  const normalizedDatabasePath = databasePath?.trim();
  const safeDatabasePath =
    backend === "duckdb-wasm" &&
    normalizedDatabasePath &&
    classifyDbIdentifier(normalizedDatabasePath) === "unknown"
      ? DEFAULT_WASM_DB_IDENTIFIER
      : databasePath;

  return {
    backend,
    dbIdentifier: resolveDbIdentifierForSqlBackend(safeDatabasePath, backend),
  };
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
  const { dbIdentifier } = resolveToolRuntimeTarget(databasePath);
  const response = await runQuery({ sql, dbIdentifier });
  return {
    rows: normalizeRows(response.rows),
    durationMs: response.durationMs,
    backend: response.backend,
    dbIdentifier,
  };
}
