import { useEffect, useState } from "react";
import type { DuckdbTableEntry } from "@/lib/api/types/duckdb";
import { getBridgeSession, runBridgeQuery } from "@/lib/bridge/pondview-bridge";
import {
  getDuckDbHttpConfigFromStorage,
  runDuckDbHttpQuery,
} from "@/lib/duckdb/duckdb-http-browser";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import { useDuckDbHttpConfig } from "@/lib/sql/use-sql-backend";

export interface DuckdbHttpConnectionInfo {
  host: string;
  port: number;
}

const LIST_TABLES_SQL = `
  SELECT table_catalog, table_schema, table_name, table_type
  FROM information_schema.tables
  WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
  ORDER BY table_catalog, table_schema, table_name
`;

function mapInformationSchemaRows(
  rows: Record<string, unknown>[],
): DuckdbTableEntry[] {
  return rows.map((row) => ({
    catalog: String(row.table_catalog ?? ""),
    schema: String(row.table_schema ?? ""),
    name: String(row.table_name ?? ""),
    type: String(row.table_type ?? ""),
  }));
}

function mapShowAllTablesRows(
  rows: Record<string, unknown>[],
): DuckdbTableEntry[] {
  return rows
    .filter(
      (row) =>
        String(row.schema ?? "") !== "information_schema" &&
        String(row.schema ?? "") !== "pg_catalog",
    )
    .map((row) => ({
      catalog: String(row.database ?? row.catalog ?? row.table_catalog ?? ""),
      schema: String(row.schema ?? ""),
      name: String(row.name ?? ""),
      type: "BASE TABLE",
    }));
}

export function useDuckdbHttpTables(
  backend: SqlBackend,
  refreshToken?: number,
) {
  const [tables, setTables] = useState<DuckdbTableEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [connectionInfo, setConnectionInfo] =
    useState<DuckdbHttpConnectionInfo | null>(null);
  const duckDbHttpConfig = useDuckDbHttpConfig();
  const _duckDbHttpConfigKey = duckDbHttpConfig
    ? `${duckDbHttpConfig.host}:${duckDbHttpConfig.port}`
    : "";

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken is intentionally used to trigger re-fetches without being read
  useEffect(() => {
    let cancelled = false;

    async function fetchTables() {
      if (backend === "duckdb-wasm") {
        setTables([]);
        setError(null);
        setIsConfigured(false);
        setConnectionInfo(null);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        if (backend === "bridge") {
          const session = await getBridgeSession().catch(() => null);

          if (!cancelled) {
            setIsConfigured(true);
            setConnectionInfo(
              session ? { host: session.host, port: session.port } : null,
            );
          }

          try {
            const result = await runBridgeQuery(LIST_TABLES_SQL);
            if (!cancelled) {
              setTables(mapInformationSchemaRows(result.rows));
            }
          } catch {
            const fallback = await runBridgeQuery("SHOW ALL TABLES;");
            if (!cancelled) {
              setTables(mapShowAllTablesRows(fallback.rows));
            }
          }

          return;
        }

        const config = getDuckDbHttpConfigFromStorage();
        if (!config) {
          if (!cancelled) {
            setTables([]);
            setError(null);
            setIsConfigured(false);
            setConnectionInfo(null);
          }
          return;
        }

        if (!cancelled) {
          setIsConfigured(true);
          setConnectionInfo({ host: config.host, port: config.port });
        }

        try {
          const result = await runDuckDbHttpQuery(LIST_TABLES_SQL);
          if (!cancelled) {
            setTables(mapInformationSchemaRows(result.rows));
          }
        } catch {
          const fallback = await runDuckDbHttpQuery("SHOW ALL TABLES;");
          if (!cancelled) {
            setTables(mapShowAllTablesRows(fallback.rows));
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : String(err ?? "");
          setError(message);
          setTables([]);
          console.error("[useDuckdbHttpTables] Error:", message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchTables();

    return () => {
      cancelled = true;
    };
  }, [backend, refreshToken]);

  return { tables, isLoading, error, isConfigured, connectionInfo };
}
