import { hasSessionSecret, pingBridge } from "@/lib/bridge/pondview-bridge";

export type SqlBackend = "bridge" | "duckdb-wasm";
export type SqlBackendPreference = "auto" | SqlBackend;
export type BridgeHealthStatus = "unknown" | "online" | "offline";
export type DbIdentifierKind = "local-wasm" | "bridge-remote" | "unknown";

export const DEFAULT_WASM_DB_IDENTIFIER = "wasm:local";
const LEGACY_WASM_COMPAT_IDENTIFIER = "md:my_db";
const SQL_BACKEND_PREFERENCE_KEY = "bi.sql.backend.preference";
const SQL_BACKEND_EVENT = "bi:sql-backend-preference-change";
const BRIDGE_HEALTH_EVENT = "bi:bridge-health-change";

let backendPreferenceCache: SqlBackendPreference | null = null;
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

type ResolveSqlBackendOptions = {
  backendPreference?: SqlBackendPreference;
  dbIdentifier?: string;
};

type RuntimeDeps = {
  hasBridgeSecret: () => boolean;
  getBridgeHealthStatus: () => BridgeHealthStatus;
};

const defaultDeps: RuntimeDeps = {
  hasBridgeSecret: hasSessionSecret,
  getBridgeHealthStatus: getBridgeHealthStatus,
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
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

function parseSqlBackendPreference(raw: string | null): SqlBackendPreference {
  if (raw === "bridge" || raw === "duckdb-wasm" || raw === "auto") {
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
  const preference = getSqlBackendPreferenceFromStorage();
  backendPreferenceCache = preference;
  return preference;
}

export function setSqlBackendPreferenceInStorage(
  backendPreference: SqlBackendPreference,
): void {
  backendPreferenceCache = backendPreference;

  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(SQL_BACKEND_PREFERENCE_KEY, backendPreference);
  notifyPreferenceChange();
}

export function subscribeSqlBackendPreference(listener: () => void): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== SQL_BACKEND_PREFERENCE_KEY) {
      return;
    }
    backendPreferenceCache = parseSqlBackendPreference(event.newValue);
    listener();
  };

  const onPreferenceChange = () => {
    backendPreferenceCache = getSqlBackendPreferenceFromStorage();
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

export async function refreshBridgeHealth(signal?: AbortSignal): Promise<BridgeHealthStatus> {
  if (!hasSessionSecret()) {
    if (bridgeHealthCache !== "offline") {
      bridgeHealthCache = "offline";
      notifyBridgeHealthChange();
    }
    return bridgeHealthCache;
  }

  const isOnline = await pingBridge(signal).catch(() => false);
  const nextStatus: BridgeHealthStatus = isOnline ? "online" : "offline";

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
    REMOTE_IDENTIFIER_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    normalized.includes("://")
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

  const identifier = normalizeIdentifier(dbIdentifier);
  if (identifierKind === "bridge-remote") {
    throw new Error(
      `DuckDB WASM only supports local browser data. Switch runtime to Bridge to query external identifier \`${identifier}\`.`,
    );
  }

  throw new Error(
    `DuckDB WASM cannot resolve database identifier \`${identifier}\`. Select a local WASM source (\`${DEFAULT_WASM_DB_IDENTIFIER}\`) or switch runtime to Bridge.`,
  );
}

function isBridgeAvailable(deps: RuntimeDeps): boolean {
  return deps.hasBridgeSecret() && deps.getBridgeHealthStatus() === "online";
}

export function resolveSqlBackend(
  options: ResolveSqlBackendOptions,
  deps: RuntimeDeps = defaultDeps,
): SqlBackend {
  const preference =
    options.backendPreference === undefined || options.backendPreference === "auto"
      ? getSqlBackendPreference()
      : options.backendPreference;

  if (preference !== "auto") {
    if (preference === "bridge" && !isBridgeAvailable(deps)) {
      return "duckdb-wasm";
    }
    return preference;
  }

  return isBridgeAvailable(deps) ? "bridge" : "duckdb-wasm";
}
