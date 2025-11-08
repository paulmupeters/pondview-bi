import duckdb, { DuckDBInstance } from '@duckdb/node-api';

// Lightweight instance cache to avoid re-initializing DuckDB for the same dbPath
declare global {
  // eslint-disable-next-line no-var
  var __duckdbInstanceCache: Map<string, Promise<DuckDBInstance>> | undefined;
}

const instanceCache: Map<string, Promise<DuckDBInstance>> =
  globalThis.__duckdbInstanceCache ?? new Map<string, Promise<DuckDBInstance>>();
if (!globalThis.__duckdbInstanceCache) {
  globalThis.__duckdbInstanceCache = instanceCache;
}

function normalizeDbPath(dbPath: string): string {
  // Default to in-memory if empty/undefined
  const trimmed = (dbPath ?? '').trim();
  return trimmed.length > 0 ? trimmed : ':memory:';
}

export async function getDuckDbInstance(dbPath: string): Promise<DuckDBInstance> {
  const key = normalizeDbPath(dbPath);
  let p = instanceCache.get(key);
  if (!p) {
    p = DuckDBInstance.create(key);
    instanceCache.set(key, p);
  }
  return p;
}

export async function runSqlAndGetRowObjectsJson(dbPath: string, sql: string): Promise<Record<string, unknown>[]> {
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