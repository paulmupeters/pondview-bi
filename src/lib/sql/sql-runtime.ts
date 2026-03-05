import { hasSessionSecret } from "@/lib/bridge/pondview-bridge";

export type SqlBackend = "bridge" | "duckdb-wasm";
export type SqlBackendPreference = "auto" | SqlBackend;

export const DEFAULT_WASM_DB_IDENTIFIER = "wasm:local";
const LEGACY_WASM_COMPAT_IDENTIFIER = "md:my_db";
const SQL_BACKEND_PREFERENCE_KEY = "bi.sql.backend.preference";

type ResolveSqlBackendOptions = {
  backendPreference?: SqlBackendPreference;
  dbIdentifier?: string;
};

type RuntimeDeps = {
  hasBridgeSecret: () => boolean;
};

const defaultDeps: RuntimeDeps = {
  hasBridgeSecret: hasSessionSecret,
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeIdentifier(dbIdentifier?: string): string {
  return (dbIdentifier ?? "").trim();
}

export function getSqlBackendPreferenceFromStorage(): SqlBackendPreference {
  if (!isBrowser()) {
    return "auto";
  }

  const raw = window.localStorage.getItem(SQL_BACKEND_PREFERENCE_KEY);
  if (raw === "bridge" || raw === "duckdb-wasm" || raw === "auto") {
    return raw;
  }
  return "auto";
}

export function setSqlBackendPreferenceInStorage(
  backendPreference: SqlBackendPreference,
): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(SQL_BACKEND_PREFERENCE_KEY, backendPreference);
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

export function isRemoteDbIdentifierForWasm(dbIdentifier?: string): boolean {
  const normalized = normalizeIdentifier(dbIdentifier).toLowerCase();

  if (!normalized || isWasmLocalIdentifier(normalized)) {
    return false;
  }

  return (
    normalized.startsWith("postgres://") ||
    normalized.startsWith("postgresql://") ||
    normalized.startsWith("pg:") ||
    normalized.startsWith("mysql://") ||
    normalized.startsWith("mysql:") ||
    normalized.startsWith("sqlite:") ||
    normalized.startsWith("duckdb:md:") ||
    normalized.startsWith("md:")
  );
}

export function assertWasmCompatibleDbIdentifier(dbIdentifier?: string): void {
  if (!isRemoteDbIdentifierForWasm(dbIdentifier)) {
    return;
  }

  const identifier = normalizeIdentifier(dbIdentifier);
  throw new Error(
    `DuckDB WASM fallback only supports local browser data. Configure bridge authentication to query external identifier \`${identifier}\`.`,
  );
}

export function resolveSqlBackend(
  options: ResolveSqlBackendOptions,
  deps: RuntimeDeps = defaultDeps,
): SqlBackend {
  const preference =
    options.backendPreference === undefined || options.backendPreference === "auto"
      ? getSqlBackendPreferenceFromStorage()
      : options.backendPreference;

  if (preference !== "auto") {
    if (preference === "bridge" && !deps.hasBridgeSecret()) {
      return "duckdb-wasm";
    }
    return preference;
  }

  return deps.hasBridgeSecret() ? "bridge" : "duckdb-wasm";
}
