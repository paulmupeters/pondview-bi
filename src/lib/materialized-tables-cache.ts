const MATERIALIZED_TABLES_CACHE_KEY = "materializedTablesCache";

export const MATERIALIZED_TABLES_CACHE_TTL_MS = 5 * 60 * 1000;

const isClient = typeof window !== "undefined";

export type MaterializedTablesCacheEntry = {
  tables: string[];
  timestamp: number;
};

export function readMaterializedTablesCache():
  | MaterializedTablesCacheEntry
  | null {
  if (!isClient) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(MATERIALIZED_TABLES_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<MaterializedTablesCacheEntry>;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.timestamp !== "number" ||
      !Array.isArray(parsed.tables) ||
      !parsed.tables.every((value) => typeof value === "string")
    ) {
      return null;
    }

    return {
      tables: parsed.tables,
      timestamp: parsed.timestamp,
    };
  } catch (error) {
    console.error(
      "[materializedTablesCache] Failed to read cache from storage",
      error
    );
    return null;
  }
}

export function isMaterializedTablesCacheFresh(
  cache: MaterializedTablesCacheEntry | null,
  ttlMs: number = MATERIALIZED_TABLES_CACHE_TTL_MS
): boolean {
  if (!cache) {
    return false;
  }
  return Date.now() - cache.timestamp <= ttlMs;
}

export function writeMaterializedTablesCache(tables: string[]): void {
  if (!isClient) {
    return;
  }

  try {
    const payload: MaterializedTablesCacheEntry = {
      tables,
      timestamp: Date.now(),
    };
    window.localStorage.setItem(
      MATERIALIZED_TABLES_CACHE_KEY,
      JSON.stringify(payload)
    );
  } catch (error) {
    console.error(
      "[materializedTablesCache] Failed to write cache to storage",
      error
    );
  }
}

export function clearMaterializedTablesCache(): void {
  if (!isClient) {
    return;
  }

  try {
    window.localStorage.removeItem(MATERIALIZED_TABLES_CACHE_KEY);
  } catch (error) {
    console.error(
      "[materializedTablesCache] Failed to clear cache in storage",
      error
    );
  }
}

