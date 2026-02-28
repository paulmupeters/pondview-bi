import { useCallback, useEffect, useState } from "react";

export type MaterializedTableColumnDetail = {
  name: string;
  type: string;
};

export type MaterializedTableDetail = {
  tableName: string;
  sourceName?: string;
  targetTable?: string;
  sourceHash?: string;
  rowCount?: number;
  updatedAt?: string;
  columns: MaterializedTableColumnDetail[];
  columnCount: number;
  introspectionError?: string;
};

type MaterializedTablesDetailsResponse = {
  tables: string[];
  details?: MaterializedTableDetail[];
  error?: string;
};

export function useMaterializedTableDetails(enabled: boolean) {
  const [details, setDetails] = useState<MaterializedTableDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/semantic-layer/materialized-tables?details=1",
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch materialized table details: ${response.statusText}`,
        );
      }
      const data = (await response.json()) as MaterializedTablesDetailsResponse;
      const nextDetails = Array.isArray(data.details) ? data.details : [];
      setDetails(nextDetails);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      setError(message);
      console.error("[useMaterializedTableDetails] Error:", message);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void fetchDetails();
  }, [enabled, fetchDetails]);

  return {
    details,
    isLoading,
    error,
    refresh: fetchDetails,
  };
}
