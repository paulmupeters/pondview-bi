export interface PondviewBridgeSession {
  host: string;
  port: number;
  secret?: string;
  hasSecret: boolean;
}

export interface PondviewJsonCompactResponse {
  meta: Array<{ name: string; type: string }>;
  data: unknown[][];
  rows: number;
  statistics?: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

export interface BridgeQueryResult {
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
  durationMs: number;
}

let sessionSecret: string | undefined;
let cachedBridgeConfig: { host: string; port: number } | null = null;

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function getAuthHeaders(): Record<string, string> {
  if (!sessionSecret) {
    throw new Error(
      "Bridge authentication required. Set your Pondview session secret in Settings before running queries.",
    );
  }

  return {
    "X-API-Key": sessionSecret,
  };
}

function toRowObjects(payload: PondviewJsonCompactResponse): {
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
} {
  const columns = payload.meta.map((column) => ({
    name: column.name,
    type: column.type,
  }));

  const rows = payload.data.map((rowData) => {
    const row: Record<string, unknown> = {};
    for (let index = 0; index < payload.meta.length; index += 1) {
      const key = payload.meta[index]?.name;
      if (key) {
        row[key] = rowData[index];
      }
    }
    return row;
  });

  return { rows, columns };
}

async function parseError(response: Response): Promise<string> {
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

export function setSessionSecret(secret: string): void {
  const trimmed = secret.trim();
  sessionSecret = trimmed.length > 0 ? trimmed : undefined;
}

export function clearSessionSecret(): void {
  sessionSecret = undefined;
}

export function hasSessionSecret(): boolean {
  return Boolean(sessionSecret);
}

export async function getBridgeConfig(): Promise<{ host: string; port: number }> {
  const response = await fetch("/api/duckdb/config", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json()) as {
    host?: string;
    port?: number;
  };

  const host = payload.host?.trim();
  const port = payload.port;

  if (!host || !port) {
    throw new Error("Bridge config is unavailable. Start Pondview first.");
  }

  cachedBridgeConfig = { host, port };
  return cachedBridgeConfig;
}

export async function getBridgeSession(): Promise<PondviewBridgeSession> {
  const config = cachedBridgeConfig ?? (await getBridgeConfig());
  return {
    host: config.host,
    port: config.port,
    secret: sessionSecret,
    hasSecret: Boolean(sessionSecret),
  };
}

export async function pingBridge(signal?: AbortSignal): Promise<boolean> {
  const response = await fetch("/ping", {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    return false;
  }

  const payload = (await response.json().catch(() => ({}))) as { status?: string };
  return payload.status === "ok";
}

export async function runBridgeQuery(sql: string, signal?: AbortSignal): Promise<BridgeQueryResult> {
  const trimmedSql = sql.trim();
  if (!trimmedSql) {
    throw new Error("SQL query is required");
  }

  const startedAt = nowMs();

  const response = await fetch("/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ sql: trimmedSql }),
    signal,
  });

  if (!response.ok) {
    const message = await parseError(response);
    if (response.status === 401) {
      throw new Error(
        `Bridge authentication failed (401). Update your Pondview session secret in Settings. ${message}`,
      );
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as PondviewJsonCompactResponse;
  const converted = toRowObjects(payload);
  const durationMs = Math.max(0, Math.round(nowMs() - startedAt));

  return {
    rows: converted.rows,
    columns: converted.columns,
    durationMs,
  };
}

export async function cancelBridgeQuery(signal?: AbortSignal): Promise<{
  status: string;
  cancelled: boolean;
}> {
  const response = await fetch("/cancel", {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json()) as {
    status?: string;
    cancelled?: boolean;
  };

  return {
    status: payload.status ?? "unknown",
    cancelled: payload.cancelled ?? false,
  };
}
