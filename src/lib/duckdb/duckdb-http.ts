/**
 * HTTP connection configuration for DuckDB httpserver extension
 */
export interface HttpDuckDbConfig {
  host?: string;
  port?: number;
  auth?: string;
}

/**
 * Resolved HTTP DuckDB connection configuration
 */
export interface ResolvedHttpDuckDbConfig {
  host: string;
  port: number;
  auth: string | undefined;
}

/**
 * Response format from DuckDB httpserver extension
 */
export interface HttpDuckDbResponse {
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
 * Resolves HTTP DuckDB connection configuration from function parameters or environment variables.
 * Throws an error if neither parameters nor environment variables are available.
 */
export function resolveHttpDuckDbConfig(config?: HttpDuckDbConfig): ResolvedHttpDuckDbConfig {
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
 * Builds the HTTP endpoint URL for DuckDB httpserver extension.
 */
export function buildDuckDbHttpUrl(config: ResolvedHttpDuckDbConfig): URL {
  // Build the HTTP endpoint URL
  // If host already includes protocol, use it; otherwise default to http
  let baseUrl: string;
  if (config.host.includes('://')) {
    // Host already includes protocol, check if it includes port
    const urlObj = new URL(config.host);
    if (urlObj.port) {
      // Port already in host, use as-is
      baseUrl = config.host;
    } else {
      // No port in host, add it
      baseUrl = `${config.host}:${config.port}`;
    }
  } else {
    baseUrl = `http://${config.host}:${config.port}`;
  }
  const url = new URL('/', baseUrl);
  url.searchParams.set('default_format', 'JSONCompact');
  return url;
}

/**
 * Builds request headers for DuckDB HTTP requests, including authentication if provided.
 */
export function buildDuckDbHttpHeaders(config: ResolvedHttpDuckDbConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // Handle authentication
  if (config.auth) {
    // Check if auth contains ':' (Basic Auth format: user:pass)
    if (config.auth.includes(':')) {
      const [username, password] = config.auth.split(':', 2);
      const credentials = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    } else {
      // Token auth (X-API-Key header)
      headers['X-API-Key'] = config.auth;
    }
  }

  return headers;
}

/**
 * Converts DuckDB HTTP response (JSONCompact format) to an array of row objects.
 */
export function convertHttpResponseToRowObjects(response: HttpDuckDbResponse): Record<string, unknown>[] {
  // Convert JSONCompact format to array of row objects
  // JSONCompact format: { meta: [{name, type}], data: [[col1, col2, ...], ...] }
  const rows: Record<string, unknown>[] = [];
  for (const rowData of response.data) {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < response.meta.length; i++) {
      const columnName = response.meta[i]!.name;
      row[columnName] = rowData[i];
    }
    rows.push(row);
  }
  return rows;
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
    method: 'POST',
    headers,
    body: sql,
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `DuckDB HTTP query failed: ${response.status} ${response.statusText}. ${errorText}`,
    );
  }

  const result = (await response.json()) as HttpDuckDbResponse;
  return convertHttpResponseToRowObjects(result);
}

