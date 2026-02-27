import { useEffect, useRef, useState } from "react";
import {
  isMaterializedTablesCacheFresh,
  readMaterializedTablesCache,
  writeMaterializedTablesCache,
} from "@/lib/materialized-tables-cache";

export function useMaterializedTables() {
  const cacheRef = useRef(readMaterializedTablesCache());
  const hasFreshCache =
    cacheRef.current !== null &&
    isMaterializedTablesCacheFresh(cacheRef.current);

  const [tables, setTables] = useState<string[]>(
    hasFreshCache && cacheRef.current ? cacheRef.current.tables : []
  );
  const [isLoading, setIsLoading] = useState(!hasFreshCache);
  const [error, setError] = useState<string | null>(null);

  const skipInitialLoadingRef = useRef(hasFreshCache);

  useEffect(() => {
    let cancelled = false;

    async function fetchTables() {
      try {
        if (!skipInitialLoadingRef.current) {
          setIsLoading(true);
        }
        setError(null);

        const response = await fetch("/api/semantic-layer/materialized-tables");
        if (!response.ok) {
          throw new Error(
            `Failed to fetch materialized tables: ${response.statusText}`
          );
        }

        const data = (await response.json()) as { tables: string[] };
        if (!cancelled) {
          const nextTables = Array.isArray(data.tables) ? data.tables : [];
          setTables(nextTables);
          writeMaterializedTablesCache(nextTables);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : String(err ?? "");
          setError(message);
          console.error("[useMaterializedTables] Error:", message);
          setTables((current) => (current.length > 0 ? current : []));
        }
      } finally {
        skipInitialLoadingRef.current = false;
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

  return { tables, isLoading, error };
}