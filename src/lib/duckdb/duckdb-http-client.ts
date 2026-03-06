import type { HttpDuckDbConfig } from "@/lib/api/types/duckdb";

export interface ResolvedHttpDuckDbConfig {
  host: string;
  port: number;
  auth: string | undefined;
}

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

export interface DuckDbHttpQueryResult {
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
  durationMs: number;
}

function nowMs(): number {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
}

function encodeBase64(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value).toString("base64");
  }

  if (typeof btoa === "function") {
    return btoa(value);
  }

  throw new Error("No base64 encoder is available in this runtime.");
}

export function resolveHttpDuckDbConfigValues(
  config: HttpDuckDbConfig,
): ResolvedHttpDuckDbConfig {
  const host = config.host?.trim();
  const port = config.port;
  const auth = config.auth?.trim();

  if (!host) {
    throw new Error("DuckDB HTTP host is required.");
  }

  if (!port || !Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("DuckDB HTTP port must be a valid port number (1-65535).");
  }

  return {
    host,
    port,
    auth: auth?.length ? auth : undefined,
  };
}

export function buildDuckDbHttpUrl(config: ResolvedHttpDuckDbConfig): URL {
  let baseUrl: string;
  if (config.host.includes("://")) {
    const url = new URL(config.host);
    baseUrl = url.port ? config.host : `${config.host}:${config.port}`;
  } else {
    baseUrl = `http://${config.host}:${config.port}`;
  }

  const url = new URL("/", baseUrl);
  url.searchParams.set("default_format", "JSONCompact");
  return url;
}

export function buildDuckDbHttpPingUrl(config: ResolvedHttpDuckDbConfig): URL {
  const queryUrl = buildDuckDbHttpUrl(config);
  return new URL("/ping", queryUrl);
}

export function buildDuckDbHttpHeaders(
  config: ResolvedHttpDuckDbConfig,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (!config.auth) {
    return headers;
  }

  if (config.auth.includes(":")) {
    const credentials = encodeBase64(config.auth);
    headers.Authorization = `Basic ${credentials}`;
    return headers;
  }

  headers["X-API-Key"] = config.auth;
  return headers;
}

export function toDuckDbHttpQueryResult(
  response: HttpDuckDbResponse,
  durationMs: number,
): DuckDbHttpQueryResult {
  const columns = response.meta.map((column) => ({
    name: column.name,
    type: column.type,
  }));

  const rows = response.data.map((rowData) => {
    const row: Record<string, unknown> = {};

    for (let index = 0; index < response.meta.length; index += 1) {
      const key = response.meta[index]?.name;
      if (key) {
        row[key] = rowData[index];
      }
    }

    return row;
  });

  return {
    rows,
    columns,
    durationMs,
  };
}

async function parseDuckDbHttpError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };

    if (payload.error?.trim()) {
      return payload.error;
    }

    if (payload.message?.trim()) {
      return payload.message;
    }
  }

  const text = await response.text().catch(() => "");
  if (text.trim()) {
    return text.trim();
  }

  return `HTTP ${response.status} ${response.statusText}`;
}

export async function executeDuckDbHttpQuery(
  config: ResolvedHttpDuckDbConfig,
  sql: string,
  signal?: AbortSignal,
): Promise<DuckDbHttpQueryResult> {
  const trimmedSql = sql.trim();
  if (!trimmedSql) {
    throw new Error("SQL query is required");
  }

  const startedAt = nowMs();
  const response = await fetch(buildDuckDbHttpUrl(config), {
    method: "POST",
    headers: buildDuckDbHttpHeaders(config),
    body: trimmedSql,
    signal,
  });

  if (!response.ok) {
    throw new Error(await parseDuckDbHttpError(response));
  }

  const payload = (await response.json()) as HttpDuckDbResponse;
  const durationMs = Math.max(0, Math.round(nowMs() - startedAt));
  return toDuckDbHttpQueryResult(payload, durationMs);
}

export async function pingDuckDbHttp(
  config: ResolvedHttpDuckDbConfig,
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await fetch(buildDuckDbHttpPingUrl(config), {
    method: "GET",
    headers: buildDuckDbHttpHeaders(config),
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    return false;
  }

  const payload = (await response.json().catch(() => ({}))) as {
    status?: string;
  };

  return payload.status === "ok";
}
