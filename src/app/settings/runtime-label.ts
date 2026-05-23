import type { SqlBackend } from "@/lib/sql/sql-runtime";

type RuntimeLabelOptions = {
  selectedSqlBackend: SqlBackend;
  effectiveSqlBackend: SqlBackend;
  isBridgeDiscoverable: boolean;
  isBridgeQueryReady: boolean;
};

export function getActiveRuntimeLabel({
  selectedSqlBackend,
  effectiveSqlBackend,
  isBridgeDiscoverable,
  isBridgeQueryReady,
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
  return "DuckDB WASM";
}
