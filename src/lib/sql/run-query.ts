import type { HttpDuckDbConfig } from "@/lib/duckdb/duckdb-node";
import { isMaterializedTableIdentifier } from "@/lib/duckdb/materialized-tables";

export type RunQueryOptions = {
  sql: string;
  config?: HttpDuckDbConfig;
  dbIdentifier?: string;
  signal?: AbortSignal;
};

export type RunQueryResult = {
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
  durationMs: number;
};

/**
 * Fetches HTTP config from API endpoint
 */
async function fetchHttpConfig(): Promise<HttpDuckDbConfig> {
  const response = await fetch("/api/duckdb/config");
  if (!response.ok) {
    throw new Error(
      `Failed to fetch DuckDB HTTP config: ${response.statusText}`
    );
  }
  const data = (await response.json()) as HttpDuckDbConfig;
  return data;
}

export async function runQuery({
  sql,
  config,
  dbIdentifier,
  signal,
}: RunQueryOptions): Promise<RunQueryResult> {
  const trimmedSql = sql.trim();

  if (!trimmedSql) {
    throw new Error("SQL query is required");
  }

  const startedAt =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  // Check if dbIdentifier is a materialized table identifier
  // If so, fetch HTTP config and use it instead of dbIdentifier
  let finalConfig = config;
  let finalDbIdentifier = dbIdentifier;

  if (dbIdentifier && isMaterializedTableIdentifier(dbIdentifier)) {
    // For materialized tables, use HTTP config instead of dbIdentifier
    finalConfig = await fetchHttpConfig();
    finalDbIdentifier = undefined;
  }

  const requestBody: {
    sql: string;
    config?: HttpDuckDbConfig;
    dbIdentifier?: string;
  } = {
    sql: trimmedSql,
  };

  if (finalConfig) {
    requestBody.config = finalConfig;
  }

  if (finalDbIdentifier) {
    requestBody.dbIdentifier = finalDbIdentifier;
  }

  const response = await fetch("/api/duckdb/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(errorData.error || `Query failed with ${response.status}`);
  }

  const data = (await response.json()) as { rows: Record<string, unknown>[] };
  const columns =
    data.rows[0] !== undefined
      ? Object.keys(data.rows[0]).map((name) => ({ name }))
      : [];
  const durationMs =
    Math.round(
      (typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? performance.now()
        : Date.now()) - startedAt
    ) || 0;

  return {
    rows: data.rows,
    columns,
    durationMs: Math.max(0, durationMs),
  };
}
