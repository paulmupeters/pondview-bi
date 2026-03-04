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

    setIsLoading(false);
    setDetails([]);
    setError("Materialized semantic table details are deferred in browser mode.");
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
