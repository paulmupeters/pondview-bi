import type { HttpDuckDbConfig } from "@/lib/api/types/duckdb";
import {
  type DuckDbHttpQueryResult,
  executeDuckDbHttpQuery,
  pingDuckDbHttp,
  type ResolvedHttpDuckDbConfig,
  resolveHttpDuckDbConfigValues,
} from "@/lib/duckdb/duckdb-http-client";

export type DuckDbHttpHealthStatus = "unknown" | "online" | "offline";

export interface StoredDuckDbHttpConfig {
  host: string;
  port: number;
}

const DUCKDB_HTTP_CONFIG_KEY = "bi.duckdb.http.config";
const DUCKDB_HTTP_CONFIG_EVENT = "bi:duckdb-http-config-change";
const DUCKDB_HTTP_HEALTH_EVENT = "bi:duckdb-http-health-change";

let duckDbHttpConfigCache: StoredDuckDbHttpConfig | null = null;
let duckDbHttpHealthCache: DuckDbHttpHealthStatus = "unknown";
let sessionAuth: string | undefined;

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function notifyConfigChange(): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(DUCKDB_HTTP_CONFIG_EVENT));
}

function notifyHealthChange(): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(DUCKDB_HTTP_HEALTH_EVENT));
}

function parseStoredConfig(raw: string | null): StoredDuckDbHttpConfig | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      host?: string;
      port?: number;
    };

    const host = parsed.host?.trim();
    const port = parsed.port;

    if (!host || !port || !Number.isFinite(port) || port < 1 || port > 65535) {
      return null;
    }

    return {
      host,
      port,
    };
  } catch {
    return null;
  }
}

function getStoredConfigFromBrowser(): StoredDuckDbHttpConfig | null {
  if (!isBrowser()) {
    return null;
  }

  return parseStoredConfig(window.localStorage.getItem(DUCKDB_HTTP_CONFIG_KEY));
}

export function getDuckDbHttpConfigFromStorage(): StoredDuckDbHttpConfig | null {
  if (duckDbHttpConfigCache) {
    return duckDbHttpConfigCache;
  }

  const config = getStoredConfigFromBrowser();
  duckDbHttpConfigCache = config;
  return duckDbHttpConfigCache;
}

export function setDuckDbHttpConfigInStorage(
  config: StoredDuckDbHttpConfig,
): void {
  duckDbHttpConfigCache = {
    host: config.host.trim(),
    port: config.port,
  };

  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(
    DUCKDB_HTTP_CONFIG_KEY,
    JSON.stringify(duckDbHttpConfigCache),
  );
  notifyConfigChange();
}

export function clearDuckDbHttpConfigInStorage(): void {
  duckDbHttpConfigCache = null;
  duckDbHttpHealthCache = "offline";

  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(DUCKDB_HTTP_CONFIG_KEY);
  notifyConfigChange();
  notifyHealthChange();
}

export function subscribeDuckDbHttpConfig(listener: () => void): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== DUCKDB_HTTP_CONFIG_KEY) {
      return;
    }

    duckDbHttpConfigCache = parseStoredConfig(event.newValue);
    listener();
  };

  const onConfigChange = () => {
    duckDbHttpConfigCache = getStoredConfigFromBrowser();
    listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(DUCKDB_HTTP_CONFIG_EVENT, onConfigChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(DUCKDB_HTTP_CONFIG_EVENT, onConfigChange);
  };
}

export function hasDuckDbHttpConfig(): boolean {
  return Boolean(getDuckDbHttpConfigFromStorage());
}

export function getDuckDbHttpHealthStatus(): DuckDbHttpHealthStatus {
  return duckDbHttpHealthCache;
}

export function subscribeDuckDbHttpHealth(listener: () => void): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  window.addEventListener(DUCKDB_HTTP_HEALTH_EVENT, listener);
  return () => {
    window.removeEventListener(DUCKDB_HTTP_HEALTH_EVENT, listener);
  };
}

export function setDuckDbHttpSessionAuth(auth: string): void {
  const trimmed = auth.trim();
  sessionAuth = trimmed.length > 0 ? trimmed : undefined;
}

export function clearDuckDbHttpSessionAuth(): void {
  sessionAuth = undefined;
}

export function hasDuckDbHttpSessionAuth(): boolean {
  return Boolean(sessionAuth);
}

export function getDuckDbHttpSessionAuth(): string | undefined {
  return sessionAuth;
}

export function resolveBrowserDuckDbHttpConfig(
  config?: HttpDuckDbConfig,
): ResolvedHttpDuckDbConfig {
  const stored = getDuckDbHttpConfigFromStorage();
  return resolveHttpDuckDbConfigValues({
    host: config?.host ?? stored?.host,
    port: config?.port ?? stored?.port,
    auth: config?.auth ?? sessionAuth,
  });
}

export async function refreshDuckDbHttpHealth(
  signal?: AbortSignal,
  config?: HttpDuckDbConfig,
): Promise<DuckDbHttpHealthStatus> {
  let resolvedConfig: ResolvedHttpDuckDbConfig;

  try {
    resolvedConfig = resolveBrowserDuckDbHttpConfig(config);
  } catch {
    if (duckDbHttpHealthCache !== "offline") {
      duckDbHttpHealthCache = "offline";
      notifyHealthChange();
    }

    return duckDbHttpHealthCache;
  }

  const isOnline = await pingDuckDbHttp(resolvedConfig, signal).catch(
    () => false,
  );
  const nextStatus: DuckDbHttpHealthStatus = isOnline ? "online" : "offline";

  if (duckDbHttpHealthCache !== nextStatus) {
    duckDbHttpHealthCache = nextStatus;
    notifyHealthChange();
  }

  return duckDbHttpHealthCache;
}

export async function runDuckDbHttpQuery(
  sql: string,
  signal?: AbortSignal,
  config?: HttpDuckDbConfig,
): Promise<DuckDbHttpQueryResult> {
  const resolvedConfig = resolveBrowserDuckDbHttpConfig(config);
  return executeDuckDbHttpQuery(resolvedConfig, sql, signal);
}
