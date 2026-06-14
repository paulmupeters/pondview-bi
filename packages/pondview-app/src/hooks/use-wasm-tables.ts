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
  columns?: { name: string; type?: string }[];
};

const LIST_WASM_TABLES_SQL = `
  SELECT table_catalog, table_schema, table_name, table_type
  FROM information_schema.tables
  WHERE table_schema NOT IN (${RUNTIME_SCHEMA_EXCLUSION_SQL})
  ORDER BY table_catalog, table_schema, table_name
`;

const LIST_WASM_COLUMNS_SQL = `
  SELECT table_catalog, table_schema, table_name, column_name, data_type, ordinal_position
  FROM information_schema.columns
  WHERE table_schema NOT IN (${RUNTIME_SCHEMA_EXCLUSION_SQL})
  ORDER BY table_catalog, table_schema, table_name, ordinal_position
`;

const WASM_TABLE_DEBUG_STORAGE_KEY = "pondview:debug:wasmTables";

function isWasmTableDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(WASM_TABLE_DEBUG_STORAGE_KEY) === "1";
}

function debugWasmTables(label: string, payload: unknown): void {
  if (!isWasmTableDebugEnabled()) {
    return;
  }
  console.debug(`[useWasmTables] ${label}`, payload);
}

function tableKey(entry: {
  catalog?: string;
  schema: string;
  name: string;
}): string {
  return `${entry.catalog ?? ""}.${entry.schema}.${entry.name}`;
}

function mergeWasmTables(
  primary: WasmTableEntry[],
  fallback: WasmTableEntry[],
): WasmTableEntry[] {
  const merged = new Map<string, WasmTableEntry>();

  for (const table of fallback) {
    merged.set(tableKey(table), table);
  }
  for (const table of primary) {
    merged.set(tableKey(table), table);
  }

  return [...merged.values()].sort(
    (a, b) =>
      (a.catalog ?? "").localeCompare(b.catalog ?? "") ||
      a.schema.localeCompare(b.schema) ||
      a.name.localeCompare(b.name),
  );
}

function attachWasmColumnMetadata(
  tables: WasmTableEntry[],
  rows: Record<string, unknown>[],
): WasmTableEntry[] {
  const columnsByTable = new Map<
    string,
    { name: string; type?: string; ordinal: number }[]
  >();

  for (const row of rows) {
    const schema = String(row.table_schema ?? "").trim();
    const name = String(row.table_name ?? "").trim();
    const columnName = String(row.column_name ?? "").trim();

    if (
      schema.length === 0 ||
      name.length === 0 ||
      columnName.length === 0 ||
      isHiddenRuntimeSchema(schema)
    ) {
      continue;
    }

    const catalog = String(row.table_catalog ?? "").trim();
    const key = tableKey({ catalog, schema, name });
    const existing = columnsByTable.get(key) ?? [];
    existing.push({
      name: columnName,
      type: String(row.data_type ?? row.column_type ?? "").trim() || undefined,
      ordinal:
        typeof row.ordinal_position === "number"
          ? row.ordinal_position
          : Number(row.ordinal_position ?? existing.length + 1),
    });
    columnsByTable.set(key, existing);
  }

  return tables.map((table) => {
    const columns = columnsByTable
      .get(tableKey(table))
      ?.sort((a, b) => a.ordinal - b.ordinal)
      .map(({ name, type }) => ({ name, type }));

    return columns ? { ...table, columns } : table;
  });
}

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

export function parseShowAllWasmTables(
  rows: Record<string, unknown>[],
): WasmTableEntry[] {
  return rows
    .filter((row) => !isHiddenRuntimeSchema(String(row.schema ?? "")))
    .map((row) => ({
      catalog: String(row.database ?? row.catalog ?? row.table_catalog ?? ""),
      schema: String(row.schema ?? ""),
      name: String(row.name ?? ""),
      type: String(row.type ?? row.table_type ?? "BASE TABLE") || "BASE TABLE",
      columns: Array.isArray(row.column_names)
        ? row.column_names.map((name, index) => ({
            name: String(name),
            type: Array.isArray(row.column_types)
              ? String(row.column_types[index] ?? "")
              : undefined,
          }))
        : undefined,
    }))
    .filter((entry) => entry.schema.length > 0 && entry.name.length > 0);
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
      let tables = parseWasmTables(result.rows);
      debugWasmTables("information_schema.tables", {
        rowCount: result.rows.length,
        rows: result.rows,
        parsed: tables,
      });

      try {
        const fallback = await executeWasmSql("SHOW ALL TABLES;");
        const fallbackTables = parseShowAllWasmTables(fallback.rows);
        debugWasmTables("SHOW ALL TABLES", {
          rowCount: fallback.rows.length,
          rows: fallback.rows,
          parsed: fallbackTables,
        });
        tables = mergeWasmTables(tables, fallbackTables);
      } catch (error) {
        console.warn("[useWasmTables] Failed to load SHOW ALL TABLES:", error);
      }
      debugWasmTables("merged tables", tables);

      if (tables.length > 0) {
        try {
          const columnsResult = await executeWasmSql(LIST_WASM_COLUMNS_SQL);
          tables = attachWasmColumnMetadata(tables, columnsResult.rows);
          debugWasmTables("information_schema.columns", {
            rowCount: columnsResult.rows.length,
            rows: columnsResult.rows,
            tables,
          });
        } catch (error) {
          console.warn("[useWasmTables] Failed to load columns:", error);
        }
      }

      if (!isMountedRef.current) {
        return;
      }

      setTables(tables);
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
