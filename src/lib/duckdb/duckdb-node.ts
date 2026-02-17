import duckdb, { DuckDBInstance } from "@duckdb/node-api";

import {
  executeDuckDbHttpQuery,
  type HttpDuckDbConfig,
  resolveHttpDuckDbConfig,
} from "./duckdb-http";
import { RequestQueue } from "./request-queue";

// Lightweight instance cache to avoid re-initializing DuckDB for the same dbPath
declare global {
  // eslint-disable-next-line no-var
  var __duckdbInstanceCache: Map<string, Promise<DuckDBInstance>> | undefined;
  // eslint-disable-next-line no-var
  var __duckdbHttpQueue: RequestQueue | undefined;
}

const instanceCache: Map<
  string,
  Promise<DuckDBInstance>
> = globalThis.__duckdbInstanceCache ??
new Map<string, Promise<DuckDBInstance>>();
if (!globalThis.__duckdbInstanceCache) {
  globalThis.__duckdbInstanceCache = instanceCache;
}

// Shared HTTP request queue with concurrency of 1 (default)
const httpQueue: RequestQueue =
  globalThis.__duckdbHttpQueue ?? new RequestQueue(1);
if (!globalThis.__duckdbHttpQueue) {
  globalThis.__duckdbHttpQueue = httpQueue;
}

function normalizeDbPath(dbPath: string): string {
  // Default to in-memory if empty/undefined
  const trimmed = (dbPath ?? "").trim();
  return trimmed.length > 0 ? trimmed : ":memory:";
}

/**
 * Returns the DuckDB database path used for materialization.
 * When DUCKDB_PERSIST_PATH is set, materialized tables are stored in a file on
 * disk and survive process restarts. Otherwise, an in-memory instance is used.
 */
export function getMaterializationDbPath(): string {
  return (
    process.env.DUCKDB_PERSIST_PATH?.trim() ||
    process.env.DUCKDB_RUNTIME_DB?.trim() ||
    process.env.DUCKDB_PATH?.trim() ||
    process.env.DUCKDB_DATABASE_PATH?.trim() ||
    ":memory:"
  );
}

export async function getDuckDbInstance(
  dbPath: string
): Promise<DuckDBInstance> {
  const key = normalizeDbPath(dbPath);
  let p = instanceCache.get(key);
  if (!p) {
    p = DuckDBInstance.create(key);
    instanceCache.set(key, p);
  }
  return p;
}

export async function runSqlAndGetRowObjectsJson(
  dbPath: string,
  sql: string
): Promise<Record<string, unknown>[]> {
  const instance = await getDuckDbInstance(dbPath);
  const connection = await instance.connect();

  // Run to completion and read all rows
  const reader = await connection.runAndReadAll(sql);

  // JSON-safe representation (e.g., bigint/interval types)
  return reader.getRowObjectsJson();
}

export function getDuckDbVersion(): string {
  return duckdb.version();
}

// Note: Avoid running any DuckDB code at import time to prevent
// native binding resolution during Next build. Consumers should call
// exported functions from server-only contexts.

// Re-export HTTP types for convenience
export type { HttpDuckDbConfig } from "./duckdb-http";

/**
 * Executes a SQL query against a DuckDB instance via HTTP (httpserver extension).
 * Returns results as an array of row objects compatible with runSqlAndGetRowObjectsJson.
 * Requests are queued to ensure sequential execution (concurrency: 1).
 *
 * @param config - HTTP connection configuration (host, port, auth)
 * @param sql - SQL query to execute
 * @param signal - Optional AbortSignal to cancel the request
 * @returns Array of row objects with column names as keys
 */
export async function runSqlAndGetRowObjectsJsonHttp(
  config: HttpDuckDbConfig | undefined,
  sql: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>[]> {
  const resolvedConfig = resolveHttpDuckDbConfig(config);
  return httpQueue.add(() =>
    executeDuckDbHttpQuery(resolvedConfig, sql, signal)
  );
}
