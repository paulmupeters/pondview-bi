import { useCallback, useEffect, useRef, useState } from "react";
import type { DuckdbTableEntry } from "@/lib/api/types/duckdb";
import { getBridgeSession, runBridgeQuery } from "@/lib/bridge/pondview-bridge";
import { resolveCurrentCatalog } from "@/lib/duckdb/catalog-context";
import {
  getDuckDbHttpConfigFromStorage,
  runDuckDbHttpQuery,
} from "@/lib/duckdb/duckdb-http-browser";
import { sanitizeSqlErrorMessage } from "@/lib/sql/error-sanitizer";
import {
  isHiddenRuntimeSchema,
  RUNTIME_SCHEMA_EXCLUSION_SQL,
} from "@/lib/sql/runtime-table-schemas";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import { useDuckDbHttpConfig } from "@/lib/sql/use-sql-backend";

export interface DuckdbHttpConnectionInfo {
  host: string;
  port: number;
}

const LIST_TABLES_SQL = `
  SELECT table_catalog, table_schema, table_name, table_type
  FROM information_schema.tables
  WHERE table_schema NOT IN (${RUNTIME_SCHEMA_EXCLUSION_SQL})
  ORDER BY table_catalog, table_schema, table_name
`;

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

export function useDuckdbHttpTables(
  backend: SqlBackend,
  refreshToken?: number,
) {
  const [tables, setTables] = useState<DuckdbTableEntry[]>([]);
  const [currentCatalog, setCurrentCatalog] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [connectionInfo, setConnectionInfo] =
    useState<DuckdbHttpConnectionInfo | null>(null);
  const isMountedRef = useRef(true);
  const refreshRequestIdRef = useRef(0);
  const duckDbHttpConfig = useDuckDbHttpConfig();
  const _duckDbHttpConfigKey = duckDbHttpConfig
    ? `${duckDbHttpConfig.host}:${duckDbHttpConfig.port}`
    : "";

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

      if (backend === "bridge") {
        const session = await getBridgeSession().catch(() => null);
        const runBridgeSql = (sql: string) => runBridgeQuery(sql);

        if (!isStale()) {
          setIsConfigured(true);
          setConnectionInfo(
            session ? { host: session.host, port: session.port } : null,
          );
        }

        try {
          const [result, nextCurrentCatalog] = await Promise.all([
            runBridgeSql(LIST_TABLES_SQL),
            resolveCurrentCatalog(runBridgeSql),
          ]);
          if (!isStale()) {
            setTables(mapInformationSchemaRows(result.rows));
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

        return;
      }

      const config = getDuckDbHttpConfigFromStorage();
      if (!config) {
        if (!isStale()) {
          setTables([]);
          setCurrentCatalog(null);
          setError(null);
          setIsConfigured(false);
          setConnectionInfo(null);
        }
        return;
      }

      if (!isStale()) {
        setIsConfigured(true);
        setConnectionInfo({ host: config.host, port: config.port });
      }

      const runDuckDbHttpSql = (sql: string) => runDuckDbHttpQuery(sql);

      try {
        const [result, nextCurrentCatalog] = await Promise.all([
          runDuckDbHttpSql(LIST_TABLES_SQL),
          resolveCurrentCatalog(runDuckDbHttpSql),
        ]);
        if (!isStale()) {
          setTables(mapInformationSchemaRows(result.rows));
          setCurrentCatalog(nextCurrentCatalog);
        }
      } catch {
        const [fallback, nextCurrentCatalog] = await Promise.all([
          runDuckDbHttpSql("SHOW ALL TABLES;"),
          resolveCurrentCatalog(runDuckDbHttpSql),
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
        console.error("[useDuckdbHttpTables] Error:", message);
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
