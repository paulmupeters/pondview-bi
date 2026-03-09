import { useEffect, useState } from "react";
import { listMaterializedTablesForBackend } from "@/lib/dashboard/browser-filter-engine";
import { subscribeDuckDbHttpHealth } from "@/lib/duckdb/duckdb-http-browser";
import {
  isMaterializedTablesCacheFresh,
  readMaterializedTablesCache,
  writeMaterializedTablesCache,
} from "@/lib/materialized-tables-cache";
import {
  getDefaultSqlRuntimeFingerprint,
  resolveSqlRuntimeFingerprint,
} from "@/lib/sql/runtime-fingerprint";
import {
  getSqlBackendPreference,
  resolveSqlBackend,
  type SqlBackend,
  subscribeBridgeHealth,
  subscribeSqlBackendPreference,
} from "@/lib/sql/sql-runtime";

function resolveActiveBackend(): SqlBackend {
  return resolveSqlBackend({
    backendPreference: getSqlBackendPreference(),
  });
}

export function useMaterializedTables() {
  const [backend, setBackend] = useState<SqlBackend>(() =>
    resolveActiveBackend(),
  );
  const [runtimeFingerprint, setRuntimeFingerprint] = useState<string | null>(
    () => getDefaultSqlRuntimeFingerprint(resolveActiveBackend()),
  );
  const [tables, setTables] = useState<string[]>(() => {
    const initialBackend = resolveActiveBackend();
    const initialFingerprint = getDefaultSqlRuntimeFingerprint(initialBackend);
    const cache = initialFingerprint
      ? readMaterializedTablesCache(initialBackend, initialFingerprint)
      : null;
    return isMaterializedTablesCacheFresh(cache) && cache ? cache.tables : [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    const initialBackend = resolveActiveBackend();
    const initialFingerprint = getDefaultSqlRuntimeFingerprint(initialBackend);
    const cache = initialFingerprint
      ? readMaterializedTablesCache(initialBackend, initialFingerprint)
      : null;
    return !isMaterializedTablesCacheFresh(cache);
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const updateBackend = () => {
      const nextBackend = resolveActiveBackend();
      setBackend((current) =>
        current === nextBackend ? current : nextBackend,
      );
    };

    const unsubscribeBackendPreference =
      subscribeSqlBackendPreference(updateBackend);
    const unsubscribeBridgeHealth = subscribeBridgeHealth(updateBackend);
    const unsubscribeDuckDbHttpHealth =
      subscribeDuckDbHttpHealth(updateBackend);

    return () => {
      unsubscribeBackendPreference();
      unsubscribeBridgeHealth();
      unsubscribeDuckDbHttpHealth();
    };
  }, []);

  useEffect(() => {
    const defaultFingerprint = getDefaultSqlRuntimeFingerprint(backend);
    setRuntimeFingerprint(defaultFingerprint);

    let cancelled = false;
    (async () => {
      const nextFingerprint = await resolveSqlRuntimeFingerprint(backend);
      if (!cancelled) {
        setRuntimeFingerprint(nextFingerprint);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [backend]);

  useEffect(() => {
    if (!runtimeFingerprint) {
      setTables([]);
      setIsLoading(true);
      setError(null);
      return;
    }

    let cancelled = false;

    const cache = readMaterializedTablesCache(backend, runtimeFingerprint);
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
        writeMaterializedTablesCache(backend, runtimeFingerprint, nextTables);
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
  }, [backend, runtimeFingerprint]);

  return { tables, isLoading, error };
}
