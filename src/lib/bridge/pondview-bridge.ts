export interface PondviewBridgeConfig {
  host: string;
  port: number;
  requiresAuth: boolean;
}

export interface PondviewBridgeSession {
  host: string;
  port: number;
  requiresAuth: boolean;
  secret?: string;
  hasSecret: boolean;
  isQueryReady: boolean;
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

const BRIDGE_SESSION_SECRET_KEY = "bi.bridge.session-secret";
const BRIDGE_CONFIG_EVENT = "bi:bridge-config-change";
const BRIDGE_SESSION_SECRET_EVENT = "bi:bridge-session-secret-change";

let cachedBridgeConfig: PondviewBridgeConfig | null = null;

function nowMs(): number {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  return Date.now();
}

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.sessionStorage !== "undefined"
  );
}

function notifyBridgeConfigChange(): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(BRIDGE_CONFIG_EVENT));
}

function notifyBridgeSessionSecretChange(): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(BRIDGE_SESSION_SECRET_EVENT));
}

function getSessionSecret(): string | undefined {
  if (!isBrowser()) {
    return undefined;
  }

  const value = window.sessionStorage.getItem(BRIDGE_SESSION_SECRET_KEY);
  return value?.trim().length ? value : undefined;
}

function getAuthHeaders(): Record<string, string> {
  const sessionSecret = getSessionSecret();
  if (!sessionSecret) {
    return {};
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
  const nextSecret = trimmed.length > 0 ? trimmed : undefined;
  const previousSecret = getSessionSecret();

  if (!isBrowser()) {
    return;
  }

  if (nextSecret) {
    window.sessionStorage.setItem(BRIDGE_SESSION_SECRET_KEY, nextSecret);
  } else {
    window.sessionStorage.removeItem(BRIDGE_SESSION_SECRET_KEY);
  }

  if (previousSecret !== nextSecret) {
    notifyBridgeSessionSecretChange();
  }
}

export function clearSessionSecret(): void {
  const previousSecret = getSessionSecret();
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.removeItem(BRIDGE_SESSION_SECRET_KEY);
  if (previousSecret !== undefined) {
    notifyBridgeSessionSecretChange();
  }
}

export function hasSessionSecret(): boolean {
  return Boolean(getSessionSecret());
}

function parseBridgeConfig(payload: unknown): PondviewBridgeConfig | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    host?: unknown;
    port?: unknown;
    requires_auth?: unknown;
  };
  const host = typeof candidate.host === "string" ? candidate.host.trim() : "";
  const port =
    typeof candidate.port === "number"
      ? candidate.port
      : typeof candidate.port === "string"
        ? Number.parseInt(candidate.port, 10)
        : Number.NaN;
  const requiresAuth = candidate.requires_auth === true;

  if (!host || !Number.isFinite(port) || port < 1 || port > 65535) {
    return null;
  }

  return {
    host,
    port,
    requiresAuth,
  };
}

function bridgeConfigChanged(
  previousConfig: PondviewBridgeConfig | null,
  nextConfig: PondviewBridgeConfig | null,
): boolean {
  return (
    previousConfig?.host !== nextConfig?.host ||
    previousConfig?.port !== nextConfig?.port ||
    previousConfig?.requiresAuth !== nextConfig?.requiresAuth
  );
}

export function getBridgeConfigFromCache(): PondviewBridgeConfig | null {
  return cachedBridgeConfig;
}

export function clearBridgeConfigCache(): void {
  const previousConfig = cachedBridgeConfig;
  cachedBridgeConfig = null;

  if (bridgeConfigChanged(previousConfig, cachedBridgeConfig)) {
    notifyBridgeConfigChange();
  }
}

export async function refreshBridgeConfig(
  signal?: AbortSignal,
): Promise<PondviewBridgeConfig> {
  const response = await fetch("/api/duckdb/config", {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const nextConfig = parseBridgeConfig(payload);
  if (!nextConfig) {
    throw new Error("Bridge config response is invalid.");
  }

  const previousConfig = cachedBridgeConfig;
  cachedBridgeConfig = nextConfig;
  if (bridgeConfigChanged(previousConfig, cachedBridgeConfig)) {
    notifyBridgeConfigChange();
  }

  return nextConfig;
}

export function subscribeBridgeConfig(listener: () => void): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  window.addEventListener(BRIDGE_CONFIG_EVENT, listener);
  return () => {
    window.removeEventListener(BRIDGE_CONFIG_EVENT, listener);
  };
}

export function subscribeBridgeSessionSecret(listener: () => void): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  window.addEventListener(BRIDGE_SESSION_SECRET_EVENT, listener);
  return () => {
    window.removeEventListener(BRIDGE_SESSION_SECRET_EVENT, listener);
  };
}

export async function getBridgeConfig(): Promise<PondviewBridgeConfig> {
  if (cachedBridgeConfig) {
    return cachedBridgeConfig;
  }

  if (!isBrowser()) {
    throw new Error("Bridge config is unavailable outside the browser.");
  }

  return refreshBridgeConfig();
}

export async function getBridgeSession(): Promise<PondviewBridgeSession> {
  const config = cachedBridgeConfig ?? (await getBridgeConfig());
  const secret = getSessionSecret();
  const hasSecret = Boolean(secret);
  return {
    host: config.host,
    port: config.port,
    requiresAuth: config.requiresAuth,
    secret,
    hasSecret,
    isQueryReady: !config.requiresAuth || hasSecret,
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

  const payload = (await response.json().catch(() => ({}))) as {
    status?: string;
  };
  return payload.status === "ok";
}

export async function runBridgeQuery(
  sql: string,
  signal?: AbortSignal,
): Promise<BridgeQueryResult> {
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
