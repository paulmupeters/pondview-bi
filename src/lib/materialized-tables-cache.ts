import type { SqlBackend } from "@/lib/sql/sql-runtime";

const MATERIALIZED_TABLES_CACHE_KEY = "materializedTablesCache";

export const MATERIALIZED_TABLES_CACHE_TTL_MS = 5 * 60 * 1000;

const isClient = typeof window !== "undefined";

export type MaterializedTablesCacheEntry = {
  backend: SqlBackend;
  runtimeFingerprint: string;
  tables: string[];
  timestamp: number;
};

type MaterializedTablesCachePayload = {
  version: 3;
  entries: Partial<
    Record<
      SqlBackend,
      {
        runtimeFingerprint: string;
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
      parsed?.version !== 3 ||
      typeof parsed.entries !== "object" ||
      parsed.entries === null
    ) {
      return null;
    }

    const normalizedEntries: MaterializedTablesCachePayload["entries"] = {};

    for (const [backend, entry] of Object.entries(parsed.entries)) {
      if (
        !isValidBackend(backend) ||
        typeof entry !== "object" ||
        entry === null
      ) {
        continue;
      }

      const candidate = entry as Partial<MaterializedTablesCacheEntry>;
      if (
        typeof candidate.runtimeFingerprint !== "string" ||
        candidate.runtimeFingerprint.length === 0 ||
        typeof candidate.timestamp !== "number" ||
        !Array.isArray(candidate.tables) ||
        !candidate.tables.every((value) => typeof value === "string")
      ) {
        continue;
      }

      normalizedEntries[backend] = {
        runtimeFingerprint: candidate.runtimeFingerprint,
        tables: candidate.tables,
        timestamp: candidate.timestamp,
      };
    }

    return {
      version: 3,
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
  runtimeFingerprint: string,
): MaterializedTablesCacheEntry | null {
  const payload = readCachePayload();
  const entry = payload?.entries[backend];
  if (!entry) {
    return null;
  }
  if (entry.runtimeFingerprint !== runtimeFingerprint) {
    return null;
  }

  return {
    backend,
    runtimeFingerprint,
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
  runtimeFingerprint: string,
  tables: string[],
): void {
  const payload = readCachePayload() ?? {
    version: 3,
    entries: {},
  };

  payload.entries[backend] = {
    runtimeFingerprint,
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
