import { useEffect, useState } from "react";
import { subscribeDuckDbHttpHealth } from "@/lib/duckdb/duckdb-http-browser";
import { listMaterializedTablesForBackend } from "@/lib/dashboard/browser-filter-engine";
import {
  isMaterializedTablesCacheFresh,
  readMaterializedTablesCache,
  writeMaterializedTablesCache,
} from "@/lib/materialized-tables-cache";
import {
  getSqlBackendPreference,
  resolveSqlBackend,
  subscribeBridgeHealth,
  subscribeSqlBackendPreference,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";

function resolveActiveBackend(): SqlBackend {
  return resolveSqlBackend({
    backendPreference: getSqlBackendPreference(),
  });
}

export function useMaterializedTables() {
  const [backend, setBackend] = useState<SqlBackend>(() => resolveActiveBackend());
  const [tables, setTables] = useState<string[]>(() => {
    const initialBackend = resolveActiveBackend();
    const cache = readMaterializedTablesCache(initialBackend);
    return isMaterializedTablesCacheFresh(cache) && cache ? cache.tables : [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    const initialBackend = resolveActiveBackend();
    return !isMaterializedTablesCacheFresh(readMaterializedTablesCache(initialBackend));
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const updateBackend = () => {
      const nextBackend = resolveActiveBackend();
      setBackend((current) => (current === nextBackend ? current : nextBackend));
    };

    const unsubscribeBackendPreference = subscribeSqlBackendPreference(updateBackend);
    const unsubscribeBridgeHealth = subscribeBridgeHealth(updateBackend);
    const unsubscribeDuckDbHttpHealth = subscribeDuckDbHttpHealth(updateBackend);

    return () => {
      unsubscribeBackendPreference();
      unsubscribeBridgeHealth();
      unsubscribeDuckDbHttpHealth();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const cache = readMaterializedTablesCache(backend);
    const hasFreshCache = isMaterializedTablesCacheFresh(cache);

    if (hasFreshCache && cache) {
      setTables(cache.tables);
      setIsLoading(false);
      setError(null);
    } else {
      setTables([]);
      setIsLoading(true);
      setError(null);
    }

    (async () => {
      try {
        const nextTables = await listMaterializedTablesForBackend(backend);
        if (cancelled) {
          return;
        }

        setTables(nextTables);
        setError(null);
        writeMaterializedTablesCache(backend, nextTables);
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [backend]);

  return { tables, isLoading, error };
}
