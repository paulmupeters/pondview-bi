import type { SqlBackend } from "@/lib/sql/sql-runtime";

const MATERIALIZED_TABLES_CACHE_KEY = "materializedTablesCache";

export const MATERIALIZED_TABLES_CACHE_TTL_MS = 5 * 60 * 1000;

const isClient = typeof window !== "undefined";

export type MaterializedTablesCacheEntry = {
  backend: SqlBackend;
  tables: string[];
  timestamp: number;
};

type MaterializedTablesCachePayload = {
  version: 2;
  entries: Partial<
    Record<
      SqlBackend,
      {
        tables: string[];
        timestamp: number;
      }
    >
  >;
};

const BACKENDS: SqlBackend[] = ["bridge", "duckdb-http", "duckdb-wasm"];

function isValidBackend(value: unknown): value is SqlBackend {
  return typeof value === "string" && BACKENDS.includes(value as SqlBackend);
}

function readCachePayload(): MaterializedTablesCachePayload | null {
  if (!isClient) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(MATERIALIZED_TABLES_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<MaterializedTablesCachePayload>;
    if (
      parsed?.version !== 2 ||
      typeof parsed.entries !== "object" ||
      parsed.entries === null
    ) {
      return null;
    }

    const normalizedEntries: MaterializedTablesCachePayload["entries"] = {};

    for (const [backend, entry] of Object.entries(parsed.entries)) {
      if (!isValidBackend(backend) || typeof entry !== "object" || entry === null) {
        continue;
      }

      const candidate = entry as Partial<MaterializedTablesCacheEntry>;
      if (
        typeof candidate.timestamp !== "number" ||
        !Array.isArray(candidate.tables) ||
        !candidate.tables.every((value) => typeof value === "string")
      ) {
        continue;
      }

      normalizedEntries[backend] = {
        tables: candidate.tables,
        timestamp: candidate.timestamp,
      };
    }

    return {
      version: 2,
      entries: normalizedEntries,
    };
  } catch (error) {
    console.error(
      "[materializedTablesCache] Failed to read cache from storage",
      error,
    );
    return null;
  }
}

function writeCachePayload(payload: MaterializedTablesCachePayload): void {
  if (!isClient) {
    return;
  }

  try {
    window.localStorage.setItem(
      MATERIALIZED_TABLES_CACHE_KEY,
      JSON.stringify(payload),
    );
  } catch (error) {
    console.error(
      "[materializedTablesCache] Failed to write cache to storage",
      error,
    );
  }
}

export function readMaterializedTablesCache(
  backend: SqlBackend,
): MaterializedTablesCacheEntry | null {
  const payload = readCachePayload();
  const entry = payload?.entries[backend];
  if (!entry) {
    return null;
  }

  return {
    backend,
    tables: entry.tables,
    timestamp: entry.timestamp,
  };
}

export function isMaterializedTablesCacheFresh(
  cache: MaterializedTablesCacheEntry | null,
  ttlMs: number = MATERIALIZED_TABLES_CACHE_TTL_MS,
): boolean {
  if (!cache) {
    return false;
  }
  return Date.now() - cache.timestamp <= ttlMs;
}

export function writeMaterializedTablesCache(
  backend: SqlBackend,
  tables: string[],
): void {
  const payload = readCachePayload() ?? {
    version: 2,
    entries: {},
  };

  payload.entries[backend] = {
    tables,
    timestamp: Date.now(),
  };

  writeCachePayload(payload);
}

export function clearMaterializedTablesCache(backend?: SqlBackend): void {
  if (!isClient) {
    return;
  }

  if (!backend) {
    try {
      window.localStorage.removeItem(MATERIALIZED_TABLES_CACHE_KEY);
    } catch (error) {
      console.error(
        "[materializedTablesCache] Failed to clear cache in storage",
        error,
      );
    }
    return;
  }

  const payload = readCachePayload();
  if (!payload) {
    return;
  }

  delete payload.entries[backend];
  if (Object.keys(payload.entries).length === 0) {
    try {
      window.localStorage.removeItem(MATERIALIZED_TABLES_CACHE_KEY);
    } catch (error) {
      console.error(
        "[materializedTablesCache] Failed to clear cache in storage",
        error,
      );
    }
    return;
  }

  writeCachePayload(payload);
}
