import { useCallback, useEffect, useRef, useState } from "react";
import { resolveCurrentCatalog } from "@/lib/duckdb/catalog-context";
import { runQuery } from "@/lib/sql/run-query";
import {
  isHiddenRuntimeSchema,
  RUNTIME_SCHEMA_EXCLUSION_SQL,
} from "@/lib/sql/runtime-table-schemas";
import { DEFAULT_WASM_DB_IDENTIFIER } from "@/lib/sql/sql-runtime";

export type WasmTableEntry = {
  catalog?: string;
  schema: string;
  name: string;
  type: string;
};

const LIST_WASM_TABLES_SQL = `
  SELECT table_catalog, table_schema, table_name, table_type
  FROM information_schema.tables
  WHERE table_schema NOT IN (${RUNTIME_SCHEMA_EXCLUSION_SQL})
  ORDER BY table_catalog, table_schema, table_name
`;

export function parseWasmTables(
  rows: Record<string, unknown>[],
): WasmTableEntry[] {
  return rows
    .map((row) => ({
      catalog: String(row.table_catalog ?? "").trim(),
      schema: String(row.table_schema ?? "").trim(),
      name: String(row.table_name ?? "").trim(),
      type: String(row.table_type ?? "").trim(),
    }))
    .filter(
      (entry) =>
        entry.schema.length > 0 &&
        entry.name.length > 0 &&
        !isHiddenRuntimeSchema(entry.schema),
    );
}

export function useWasmTables(
  refreshToken?: number,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const [tables, setTables] = useState<WasmTableEntry[]>([]);
  const [currentCatalog, setCurrentCatalog] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setTables([]);
      setCurrentCatalog(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const executeWasmSql = (sql: string) =>
        runQuery({
          sql,
          backendPreference: "duckdb-wasm",
          dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
        });
      const [result, nextCurrentCatalog] = await Promise.all([
        executeWasmSql(LIST_WASM_TABLES_SQL),
        resolveCurrentCatalog(executeWasmSql),
      ]);

      if (!isMountedRef.current) {
        return;
      }

      setTables(parseWasmTables(result.rows));
      setCurrentCatalog(nextCurrentCatalog);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }

      setTables([]);
      setCurrentCatalog(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [enabled]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken is intentionally used to trigger re-fetches without being read
  useEffect(() => {
    isMountedRef.current = true;
    void refresh();

    return () => {
      isMountedRef.current = false;
    };
  }, [refresh, refreshToken]);

  return { tables, currentCatalog, isLoading, error, refresh };
}
