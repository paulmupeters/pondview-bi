"use client";

import { useEffect, useState } from "react";
import type {
  DuckdbTableEntry,
  DuckdbTablesResponse,
} from "@/lib/api/types/duckdb";

export interface DuckdbHttpConnectionInfo {
  host: string;
  port: number;
}

export function useDuckdbHttpTables() {
  const [tables, setTables] = useState<DuckdbTableEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [connectionInfo, setConnectionInfo] =
    useState<DuckdbHttpConnectionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTables() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/duckdb/tables");

        const data = (await response.json()) as DuckdbTablesResponse;

        if (!cancelled) {
          setIsConfigured(!!data.configured);

          if (data.host && data.port) {
            setConnectionInfo({ host: data.host, port: data.port });
          }

          const nextTables = Array.isArray(data.tables) ? data.tables : [];
          setTables(nextTables);

          if (data.error) {
            setError(data.error);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : String(err ?? "");
          setError(message);
          console.error("[useDuckdbHttpTables] Error:", message);
          setTables([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchTables();

    return () => {
      cancelled = true;
    };
  }, []);

  return { tables, isLoading, error, isConfigured, connectionInfo };
}
