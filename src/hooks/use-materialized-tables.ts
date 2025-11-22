"use client";

import { useEffect, useState } from "react";

export function useMaterializedTables() {
  const [tables, setTables] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTables() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/semantic-layer/materialized-tables");
        if (!response.ok) {
          throw new Error(`Failed to fetch materialized tables: ${response.statusText}`);
        }

        const data = (await response.json()) as { tables: string[] };
        if (!cancelled) {
          setTables(data.tables || []);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err ?? "");
          setError(message);
          console.error("[useMaterializedTables] Error:", message);
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

  return { tables, isLoading, error };
}

