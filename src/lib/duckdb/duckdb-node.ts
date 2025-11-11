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

/**
 * HTTP connection configuration for DuckDB httpserver extension
 */
export interface HttpDuckDbConfig {
  host?: string;
  port?: number;
  auth?: string;
}

/**
 * Resolves HTTP DuckDB connection configuration from function parameters or environment variables.
 * Throws an error if neither parameters nor environment variables are available.
 */
export function resolveHttpDuckDbConfig(config?: HttpDuckDbConfig): {
  host: string;
  port: number;
  auth: string | undefined;
} {
  const host = config?.host ?? process.env.DUCKDB_HTTP_HOST;
  const port = config?.port ?? (process.env.DUCKDB_HTTP_PORT ? Number.parseInt(process.env.DUCKDB_HTTP_PORT, 10) : undefined);
  const auth = config?.auth ?? process.env.DUCKDB_HTTP_AUTH;

  if (!host) {
    throw new Error(
      'DuckDB HTTP host is required. Provide it via function parameter (host) or environment variable (DUCKDB_HTTP_HOST)',
    );
  }

  if (!port || !Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(
      'DuckDB HTTP port is required and must be a valid port number (1-65535). Provide it via function parameter (port) or environment variable (DUCKDB_HTTP_PORT)',
    );
  }

  return {
    host: host.trim(),
    port,
    auth: auth?.trim() || undefined,
  };
}

/**
 * Response format from DuckDB httpserver extension
 */
interface HttpDuckDbResponse {
  meta: Array<{ name: string; type: string }>;
  data: unknown[][];
  rows: number;
  statistics?: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

/**
 * Executes a SQL query against a DuckDB instance via HTTP (httpserver extension).
 * Returns results as an array of row objects compatible with runSqlAndGetRowObjectsJson.
 *
 * @param config - HTTP connection configuration (host, port, auth)
 * @param sql - SQL query to execute
 * @returns Array of row objects with column names as keys
 */
export async function runSqlAndGetRowObjectsJsonHttp(
  config: HttpDuckDbConfig | undefined,
  sql: string,
): Promise<Record<string, unknown>[]> {
  const { host, port, auth } = resolveHttpDuckDbConfig(config);

  // Build the HTTP endpoint URL
  // If host already includes protocol, use it; otherwise default to http
  let baseUrl: string;
  if (host.includes('://')) {
    // Host already includes protocol, check if it includes port
    const urlObj = new URL(host);
    if (urlObj.port) {
      // Port already in host, use as-is
      baseUrl = host;
    } else {
      // No port in host, add it
      baseUrl = `${host}:${port}`;
    }
  } else {
    baseUrl = `http://${host}:${port}`;
  }
  const url = new URL('/', baseUrl);
  url.searchParams.set('default_format', 'JSONCompact');

  // Prepare request headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // Handle authentication
  if (auth) {
    // Check if auth contains ':' (Basic Auth format: user:pass)
    if (auth.includes(':')) {
      const [username, password] = auth.split(':', 2);
      const credentials = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    } else {
      // Token auth (X-API-Key header)
      headers['X-API-Key'] = auth;
    }
  }

  // Execute query via POST (recommended for complex queries)
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: sql,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `DuckDB HTTP query failed: ${response.status} ${response.statusText}. ${errorText}`,
    );
  }

  const result = (await response.json()) as HttpDuckDbResponse;

  // Convert JSONCompact format to array of row objects
  // JSONCompact format: { meta: [{name, type}], data: [[col1, col2, ...], ...] }
  const rows: Record<string, unknown>[] = [];
  for (const rowData of result.data) {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < result.meta.length; i++) {
      const columnName = result.meta[i]!.name;
      row[columnName] = rowData[i];
    }
    rows.push(row);
  }

  return rows;
}