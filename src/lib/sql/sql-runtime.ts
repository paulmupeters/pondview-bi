import {
  clearBridgeConfigCache,
  getBridgeConfigFromCache,
  hasSessionSecret,
  type PondviewBridgeConfig,
  pingBridge,
  refreshBridgeConfig,
} from "@/lib/bridge/pondview-bridge";
import {
  type DuckDbHttpHealthStatus,
  getDuckDbHttpHealthStatus,
  hasDuckDbHttpConfig,
} from "@/lib/duckdb/duckdb-http-browser";

export type SqlBackend = "bridge" | "duckdb-http" | "duckdb-wasm";
export type SqlBackendPreference = "auto" | SqlBackend;
export type BridgeHealthStatus = "unknown" | "online" | "offline";
export type { DuckDbHttpHealthStatus };
export type DbIdentifierKind = "local-wasm" | "bridge-remote" | "unknown";
export type BridgeRuntimeState = {
  healthStatus: BridgeHealthStatus;
  config: PondviewBridgeConfig | null;
  hasSessionSecret: boolean;
  isDiscoverable: boolean;
  isQueryReady: boolean;
};

export const DEFAULT_WASM_DB_IDENTIFIER = "wasm:local";
const LEGACY_WASM_COMPAT_IDENTIFIER = "md:my_db";
const SQL_BACKEND_PREFERENCE_KEY = "bi.sql.backend.preference";
const SQL_BACKEND_EVENT = "bi:sql-backend-preference-change";
const BRIDGE_HEALTH_EVENT = "bi:bridge-health-change";

let bridgeHealthCache: BridgeHealthStatus = "unknown";

const REMOTE_IDENTIFIER_PREFIXES = [
  "postgres://",
  "postgresql://",
  "pg:",
  "mysql://",
  "mysql:",
  "sqlite:",
  "duckdb:md:",
  "md:",
] as const;

export type ResolveSqlBackendOptions = {
  backendPreference?: SqlBackendPreference;
  dbIdentifier?: string;
};

export type RuntimeDeps = {
  hasBridgeSecret: () => boolean;
  getBridgeHealthStatus: () => BridgeHealthStatus;
  getBridgeConfig: () => PondviewBridgeConfig | null;
  hasDuckDbHttpConfig: () => boolean;
  getDuckDbHttpHealthStatus: () => DuckDbHttpHealthStatus;
};

const defaultDeps: RuntimeDeps = {
  hasBridgeSecret: hasSessionSecret,
  getBridgeHealthStatus: getBridgeHealthStatus,
  getBridgeConfig: getBridgeConfigFromCache,
  hasDuckDbHttpConfig,
  getDuckDbHttpHealthStatus,
};

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function notifyPreferenceChange(): void {
  if (!isBrowser()) {
    return;
  }
  window.dispatchEvent(new Event(SQL_BACKEND_EVENT));
}

function notifyBridgeHealthChange(): void {
  if (!isBrowser()) {
    return;
  }
  window.dispatchEvent(new Event(BRIDGE_HEALTH_EVENT));
}

function normalizeIdentifier(dbIdentifier?: string): string {
  return (dbIdentifier ?? "").trim();
}

function isKeyValueRemoteIdentifier(dbIdentifier?: string): boolean {
  const normalized = normalizeIdentifier(dbIdentifier).toLowerCase();
  if (!normalized) {
    return false;
  }

  const remoteKeys = ["host=", "port=", "user=", "password=", "dbname="];
  return remoteKeys.some((key) => normalized.includes(key));
}

export function isRuntimeDefaultDbIdentifier(dbIdentifier?: string): boolean {
  const normalized = normalizeIdentifier(dbIdentifier).toLowerCase();
  return normalized.length === 0 || normalized === DEFAULT_WASM_DB_IDENTIFIER;
}

function parseSqlBackendPreference(raw: string | null): SqlBackendPreference {
  if (
    raw === "bridge" ||
    raw === "duckdb-http" ||
    raw === "duckdb-wasm" ||
    raw === "auto"
  ) {
    return raw;
  }
  return "auto";
}

export function getSqlBackendPreferenceFromStorage(): SqlBackendPreference {
  if (!isBrowser()) {
    return "auto";
  }

  const raw = window.localStorage.getItem(SQL_BACKEND_PREFERENCE_KEY);
  return parseSqlBackendPreference(raw);
}

export function getSqlBackendPreference(): SqlBackendPreference {
  return getSqlBackendPreferenceFromStorage();
}

export function setSqlBackendPreferenceInStorage(
  backendPreference: SqlBackendPreference,
): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(SQL_BACKEND_PREFERENCE_KEY, backendPreference);
  notifyPreferenceChange();
}

export function subscribeSqlBackendPreference(
  listener: () => void,
): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== SQL_BACKEND_PREFERENCE_KEY) {
      return;
    }
    listener();
  };

  const onPreferenceChange = () => {
    listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(SQL_BACKEND_EVENT, onPreferenceChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SQL_BACKEND_EVENT, onPreferenceChange);
  };
}

export function getBridgeHealthStatus(): BridgeHealthStatus {
  return bridgeHealthCache;
}

export function getBridgeRuntimeState(): BridgeRuntimeState {
  const config = getBridgeConfigFromCache();
  const hasSecret = hasSessionSecret();
  const isDiscoverable = bridgeHealthCache === "online" && config !== null;

  return {
    healthStatus: bridgeHealthCache,
    config,
    hasSessionSecret: hasSecret,
    isDiscoverable,
    isQueryReady: isDiscoverable && (!config.requiresAuth || hasSecret),
  };
}

export async function refreshBridgeHealth(
  signal?: AbortSignal,
): Promise<BridgeHealthStatus> {
  const isOnline = await pingBridge(signal).catch(() => false);
  const nextStatus: BridgeHealthStatus = isOnline ? "online" : "offline";

  if (isOnline) {
    try {
      await refreshBridgeConfig(signal);
    } catch {
      clearBridgeConfigCache();
    }
  } else {
    clearBridgeConfigCache();
  }

  if (bridgeHealthCache !== nextStatus) {
    bridgeHealthCache = nextStatus;
    notifyBridgeHealthChange();
  }

  return bridgeHealthCache;
}

export function subscribeBridgeHealth(listener: () => void): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const onBridgeHealthChange = () => {
    listener();
  };

  window.addEventListener(BRIDGE_HEALTH_EVENT, onBridgeHealthChange);
  return () => {
    window.removeEventListener(BRIDGE_HEALTH_EVENT, onBridgeHealthChange);
  };
}

function isBridgeQueryReady(deps: RuntimeDeps): boolean {
  const config = deps.getBridgeConfig();
  return (
    deps.getBridgeHealthStatus() === "online" &&
    config !== null &&
    (!config.requiresAuth || deps.hasBridgeSecret())
  );
}

export function isLegacyWasmCompatIdentifier(dbIdentifier?: string): boolean {
  const normalized = normalizeIdentifier(dbIdentifier).toLowerCase();
  return normalized === LEGACY_WASM_COMPAT_IDENTIFIER;
}

export function isWasmLocalIdentifier(dbIdentifier?: string): boolean {
  const normalized = normalizeIdentifier(dbIdentifier).toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === DEFAULT_WASM_DB_IDENTIFIER ||
    isLegacyWasmCompatIdentifier(normalized)
  );
}

export function classifyDbIdentifier(dbIdentifier?: string): DbIdentifierKind {
  const normalized = normalizeIdentifier(dbIdentifier).toLowerCase();

  if (!normalized || isWasmLocalIdentifier(normalized)) {
    return "local-wasm";
  }

  if (
    REMOTE_IDENTIFIER_PREFIXES.some((prefix) =>
      normalized.startsWith(prefix),
    ) ||
    normalized.includes("://") ||
    isKeyValueRemoteIdentifier(normalized)
  ) {
    return "bridge-remote";
  }

  return "unknown";
}

export function isRemoteDbIdentifierForWasm(dbIdentifier?: string): boolean {
  return classifyDbIdentifier(dbIdentifier) === "bridge-remote";
}

export function assertWasmCompatibleDbIdentifier(dbIdentifier?: string): void {
  const identifierKind = classifyDbIdentifier(dbIdentifier);
  if (identifierKind === "local-wasm") {
    return;
  }

  if (identifierKind === "bridge-remote") {
    throw new Error(
      "DuckDB WASM only supports local browser data. Switch runtime to Bridge to query external data sources.",
    );
  }

  throw new Error(
    `DuckDB WASM cannot resolve this database identifier. Select a local WASM source (\`${DEFAULT_WASM_DB_IDENTIFIER}\`) or switch runtime to Bridge.`,
  );
}

function isBridgeAvailable(deps: RuntimeDeps): boolean {
  return isBridgeQueryReady(deps);
}

function isDuckDbHttpAvailable(deps: RuntimeDeps): boolean {
  return (
    deps.hasDuckDbHttpConfig() && deps.getDuckDbHttpHealthStatus() !== "offline"
  );
}

function resolvePreference(
  backendPreference: SqlBackendPreference | undefined,
): SqlBackendPreference {
  return backendPreference === undefined || backendPreference === "auto"
    ? getSqlBackendPreference()
    : backendPreference;
}

function getBackendFallbackOrder(
  preference: SqlBackendPreference,
): SqlBackend[] {
  if (preference === "bridge") {
    return ["bridge", "duckdb-http", "duckdb-wasm"];
  }

  if (preference === "duckdb-http") {
    return ["duckdb-http", "bridge", "duckdb-wasm"];
  }

  if (preference === "duckdb-wasm") {
    return ["duckdb-wasm", "bridge", "duckdb-http"];
  }

  return ["bridge", "duckdb-http", "duckdb-wasm"];
}

function isBackendAvailable(backend: SqlBackend, deps: RuntimeDeps): boolean {
  if (backend === "bridge") {
    return isBridgeAvailable(deps);
  }

  if (backend === "duckdb-http") {
    return isDuckDbHttpAvailable(deps);
  }

  return true;
}

export function resolveDbIdentifierForSqlBackend(
  dbIdentifier: string | null | undefined,
  backend: SqlBackend,
): string | undefined {
  const normalized = normalizeIdentifier(dbIdentifier ?? undefined);

  if (isRuntimeDefaultDbIdentifier(normalized)) {
    return backend === "duckdb-wasm" ? DEFAULT_WASM_DB_IDENTIFIER : undefined;
  }

  return normalized.length > 0 ? normalized : undefined;
}

export function resolveSelectedSqlBackend(
  options: ResolveSqlBackendOptions,
  deps: RuntimeDeps = defaultDeps,
): SqlBackend {
  const preference = resolvePreference(options.backendPreference);
  if (preference !== "auto") {
    return preference;
  }

  return getBackendFallbackOrder("auto").find((backend) =>
    isBackendAvailable(backend, deps),
  )!;
}

export function resolveSqlBackend(
  options: ResolveSqlBackendOptions,
  deps: RuntimeDeps = defaultDeps,
): SqlBackend {
  const preference = resolvePreference(options.backendPreference);
  return getBackendFallbackOrder(preference).find((backend) =>
    isBackendAvailable(backend, deps),
  )!;
}
