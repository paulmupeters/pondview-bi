import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBridgeSession,
  type PondviewBridgeDatabaseInfo,
  runBridgeQuery,
} from "@/lib/bridge/pondview-bridge";
import { resolveCurrentCatalog } from "@/lib/duckdb/catalog-context";
import { sanitizeSqlErrorMessage } from "@/lib/sql/error-sanitizer";
import {
  isHiddenRuntimeSchema,
  RUNTIME_SCHEMA_EXCLUSION_SQL,
} from "@/lib/sql/runtime-table-schemas";
import type { SqlBackend } from "@/lib/sql/sql-runtime";

export interface DuckdbTableEntry {
  catalog?: string;
  schema: string;
  name: string;
  type: string;
  columns?: { name: string; type?: string }[];
}

export interface RemoteRuntimeConnectionInfo {
  host: string;
  port: number;
  database?: PondviewBridgeDatabaseInfo;
}

const LIST_TABLES_SQL = `
  SELECT table_catalog, table_schema, table_name, table_type
  FROM information_schema.tables
  WHERE table_schema NOT IN (${RUNTIME_SCHEMA_EXCLUSION_SQL})
  ORDER BY table_catalog, table_schema, table_name
`;

const LIST_COLUMNS_SQL = `
  SELECT table_catalog, table_schema, table_name, column_name, data_type, ordinal_position
  FROM information_schema.columns
  WHERE table_schema NOT IN (${RUNTIME_SCHEMA_EXCLUSION_SQL})
  ORDER BY table_catalog, table_schema, table_name, ordinal_position
`;

function tableKey(entry: {
  catalog?: string;
  schema: string;
  name: string;
}): string {
  return `${entry.catalog ?? ""}.${entry.schema}.${entry.name}`;
}

export function attachColumnMetadata(
  tables: DuckdbTableEntry[],
  rows: Record<string, unknown>[],
): DuckdbTableEntry[] {
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

export function mapInformationSchemaRows(
  rows: Record<string, unknown>[],
): DuckdbTableEntry[] {
  return rows
    .map((row) => ({
      catalog: String(row.table_catalog ?? ""),
      schema: String(row.table_schema ?? ""),
      name: String(row.table_name ?? ""),
      type: String(row.table_type ?? ""),
    }))
    .filter(
      (row) =>
        row.schema.length > 0 &&
        row.name.length > 0 &&
        !isHiddenRuntimeSchema(row.schema),
    );
}

export function mapShowAllTablesRows(
  rows: Record<string, unknown>[],
): DuckdbTableEntry[] {
  return rows
    .filter((row) => !isHiddenRuntimeSchema(String(row.schema ?? "")))
    .map((row) => ({
      catalog: String(row.database ?? row.catalog ?? row.table_catalog ?? ""),
      schema: String(row.schema ?? ""),
      name: String(row.name ?? ""),
      type: "BASE TABLE",
    }))
    .filter((row) => row.schema.length > 0 && row.name.length > 0);
}

export function useRemoteRuntimeTables(
  backend: SqlBackend,
  refreshToken?: number,
) {
  const [tables, setTables] = useState<DuckdbTableEntry[]>([]);
  const [currentCatalog, setCurrentCatalog] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [connectionInfo, setConnectionInfo] =
    useState<RemoteRuntimeConnectionInfo | null>(null);
  const isMountedRef = useRef(true);
  const refreshRequestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    const isStale = () =>
      !isMountedRef.current || refreshRequestIdRef.current !== requestId;

    if (backend === "duckdb-wasm") {
      if (!isStale()) {
        setTables([]);
        setCurrentCatalog(null);
        setError(null);
        setIsConfigured(false);
        setConnectionInfo(null);
        setIsLoading(false);
      }
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const session = await getBridgeSession().catch(() => null);
      const runBridgeSql = (sql: string) => runBridgeQuery(sql);

      if (!isStale()) {
        setIsConfigured(true);
        setConnectionInfo(
          session
            ? {
                host: session.host,
                port: session.port,
                database: session.database,
              }
            : null,
        );
      }
      try {
        const [result, nextCurrentCatalog] = await Promise.all([
          runBridgeSql(LIST_TABLES_SQL),
          resolveCurrentCatalog(runBridgeSql),
        ]);
        let tables = mapInformationSchemaRows(result.rows);
        try {
          const columns = await runBridgeSql(LIST_COLUMNS_SQL);
          tables = attachColumnMetadata(tables, columns.rows);
        } catch (error) {
          console.warn(
            "[useRemoteRuntimeTables] Failed to load columns:",
            error,
          );
        }
        if (!isStale()) {
          setTables(tables);
          setCurrentCatalog(nextCurrentCatalog);
        }
      } catch {
        const [fallback, nextCurrentCatalog] = await Promise.all([
          runBridgeSql("SHOW ALL TABLES;"),
          resolveCurrentCatalog(runBridgeSql),
        ]);
        if (!isStale()) {
          setTables(mapShowAllTablesRows(fallback.rows));
          setCurrentCatalog(nextCurrentCatalog);
        }
      }
    } catch (err) {
      if (!isStale()) {
        const message = sanitizeSqlErrorMessage(
          err instanceof Error ? err.message : String(err ?? ""),
        );
        setError(message);
        setTables([]);
        setCurrentCatalog(null);
        console.error("[useRemoteRuntimeTables] Error:", message);
      }
    } finally {
      if (!isStale()) {
        setIsLoading(false);
      }
    }
  }, [backend]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken is intentionally used to trigger re-fetches without being read
  useEffect(() => {
    isMountedRef.current = true;
    void refresh();

    return () => {
      isMountedRef.current = false;
    };
  }, [refresh, refreshToken]);

  return {
    tables,
    currentCatalog,
    isLoading,
    error,
    isConfigured,
    connectionInfo,
    refresh,
  };
}
