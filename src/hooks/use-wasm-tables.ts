import { useCallback, useEffect, useRef, useState } from "react";
import { resolveCurrentCatalog } from "@/lib/duckdb/catalog-context";
import { runQuery } from "@/lib/sql/run-query";
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
  WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
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
    .filter((entry) => entry.schema.length > 0 && entry.name.length > 0);
}

export function useWasmTables() {
  const [tables, setTables] = useState<WasmTableEntry[]>([]);
  const [currentCatalog, setCurrentCatalog] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const refresh = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void refresh();

    return () => {
      isMountedRef.current = false;
    };
  }, [refresh]);

  return { tables, currentCatalog, isLoading, error, refresh };
}
