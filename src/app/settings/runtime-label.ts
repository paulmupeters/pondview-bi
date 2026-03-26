import type { DuckDbHttpHealthStatus, SqlBackend } from "@/lib/sql/sql-runtime";

type RuntimeLabelOptions = {
  selectedSqlBackend: SqlBackend;
  effectiveSqlBackend: SqlBackend;
  isBridgeDiscoverable: boolean;
  isBridgeQueryReady: boolean;
  isDuckDbHttpConfigured: boolean;
  duckDbHttpHealthStatus: DuckDbHttpHealthStatus;
};

export function getActiveRuntimeLabel({
  selectedSqlBackend,
  effectiveSqlBackend,
  isBridgeDiscoverable,
  isBridgeQueryReady,
  isDuckDbHttpConfigured,
  duckDbHttpHealthStatus,
}: RuntimeLabelOptions): string {
  if (selectedSqlBackend === "duckdb-wasm") {
    return "DuckDB WASM";
  }

  if (selectedSqlBackend === "bridge") {
    if (effectiveSqlBackend === "bridge") {
      return "Bridge";
    }

    if (!isBridgeDiscoverable) {
      return "Bridge (unavailable, using DuckDB WASM)";
    }

    if (!isBridgeQueryReady) {
      return "Bridge (waiting for auth, using DuckDB WASM)";
    }

    return "Bridge (using DuckDB WASM)";
  }

  if (effectiveSqlBackend === "duckdb-http") {
    return "DuckDB over HTTP";
  }

  if (!isDuckDbHttpConfigured) {
    return "DuckDB over HTTP (not configured, using DuckDB WASM)";
  }

  if (duckDbHttpHealthStatus === "offline") {
    return "DuckDB over HTTP (unavailable, using DuckDB WASM)";
  }

  return "DuckDB over HTTP (pending, using DuckDB WASM)";
}
