import {
  type HttpDuckDbConfig,
  runSqlAndGetRowObjectsJsonHttp,
} from "@/lib/duckdb/duckdb-node";
import type { Result } from "@/lib/types";

/**
 * Executes a SQL query against DuckDB via HTTP connection.
 * Returns normalized results matching the format of runSqlNormalized.
 *
 * @param dbIdentifier - Database identifier (not used for HTTP, but kept for API compatibility)
 * @param sql - SQL query to execute
 * @param config - Optional HTTP configuration. If not provided, will be resolved from environment variables.
 * @returns Array of normalized row objects
 */
export async function runSqlNormalizedHttp(
  dbIdentifier: string,
  sql: string,
  config?: HttpDuckDbConfig,
): Promise<Result[]> {
  console.log("runSqlNormalizedHttp", dbIdentifier, sql, config);
  // Set search_path for materialized tables schema
  // HTTP queries are typically used for materialized semantic layer queries
  // Execute SET search_path first, then the actual query
  // Note: DuckDB HTTP server executes each request in its own session,
  // so we need to combine them in a single request with semicolon separation
  const sqlWithSearchPath = `SET search_path = semantic_materialized; ${sql}`;
  const rawRows = await runSqlAndGetRowObjectsJsonHttp(config, sqlWithSearchPath);

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
