import { useEffect, useRef, useState } from "react";
import {
  isMaterializedTablesCacheFresh,
  readMaterializedTablesCache,
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
    if (!skipInitialLoadingRef.current) {
      setIsLoading(false);
    }
    setError("Materialized semantic tables are deferred in browser mode.");
    setTables((current) => (current.length > 0 ? current : []));
    skipInitialLoadingRef.current = false;
  }, []);

  return { tables, isLoading, error };
}
