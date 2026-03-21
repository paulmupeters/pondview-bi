import type { HttpDuckDbConfig } from "@/lib/api/types/duckdb";
import {
  buildDuckDbHttpHeaders,
  buildDuckDbHttpUrl,
  type HttpDuckDbResponse,
  type ResolvedHttpDuckDbConfig,
  resolveHttpDuckDbConfigValues,
  toDuckDbHttpQueryResult,
} from "@/lib/duckdb/duckdb-http-client";

/**
 * Resolves HTTP DuckDB connection configuration from function parameters or environment variables.
 * Throws an error if neither parameters nor environment variables are available.
 */
export function resolveHttpDuckDbConfig(
  config?: HttpDuckDbConfig,
): ResolvedHttpDuckDbConfig {
  const parseEnvPort = (value: string | undefined): number | undefined => {
    if (!value) {
      return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const host =
    config?.host ?? process.env.PONDVIEW_HOST ?? process.env.DUCKDB_HTTP_HOST;
  const port =
    config?.port ??
    parseEnvPort(process.env.PONDVIEW_PORT) ??
    parseEnvPort(process.env.DUCKDB_HTTP_PORT);
  const auth =
    config?.auth ?? process.env.PONDVIEW_AUTH ?? process.env.DUCKDB_HTTP_AUTH;

  if (!host) {
    throw new Error(
      "DuckDB HTTP host is required. Provide it via function parameter (host) or environment variable (PONDVIEW_HOST or DUCKDB_HTTP_HOST)",
    );
  }

  if (!port || !Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(
      "DuckDB HTTP port is required and must be a valid port number (1-65535). Provide it via function parameter (port) or environment variable (PONDVIEW_PORT or DUCKDB_HTTP_PORT)",
    );
  }

  return resolveHttpDuckDbConfigValues({
    host,
    port,
    auth,
  });
}

/**
 * Executes a SQL query against a DuckDB instance via HTTP (httpserver extension).
 * This is the core HTTP execution function without queue management.
 *
 * @param config - HTTP connection configuration (host, port, auth)
 * @param sql - SQL query to execute
 * @param signal - Optional AbortSignal to cancel the request
 * @returns Array of row objects with column names as keys
 */
export async function executeDuckDbHttpQuery(
  config: ResolvedHttpDuckDbConfig,
  sql: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>[]> {
  const url = buildDuckDbHttpUrl(config);
  const headers = buildDuckDbHttpHeaders(config);

  // Execute query via POST (recommended for complex queries)
  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: sql,
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");

    // Handle DETACH DATABASE IF EXISTS gracefully - if database doesn't exist, treat as success
    // DuckDB HTTP server returns 500 with "database not found" for DETACH DATABASE IF EXISTS
    // when the database doesn't exist, but semantically this should be a no-op
    const sqlUpper = sql.trim().toUpperCase();
    if (
      (sqlUpper.startsWith("DETACH DATABASE IF EXISTS") ||
        sqlUpper.startsWith("DETACH IF EXISTS")) &&
      (errorText.includes("database not found") ||
        errorText.includes("Failed to detach database"))
    ) {
      // Return empty result set (successful no-op)
      return [];
    }

    throw new Error(
      `DuckDB HTTP query failed: ${response.status} ${response.statusText}. ${errorText}`,
    );
  }

  const result = (await response.json()) as HttpDuckDbResponse;
  return toDuckDbHttpQueryResult(result, 0).rows;
}
