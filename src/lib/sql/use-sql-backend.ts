import { useSyncExternalStore } from "react";
import {
  getDuckDbHttpConfigFromStorage,
  getDuckDbHttpHealthStatus,
  type StoredDuckDbHttpConfig,
  subscribeDuckDbHttpConfig,
  subscribeDuckDbHttpHealth,
} from "@/lib/duckdb/duckdb-http-browser";
import {
  type BridgeHealthStatus,
  type DuckDbHttpHealthStatus,
  getBridgeHealthStatus,
  getSqlBackendPreference,
  type SqlBackendPreference,
  subscribeBridgeHealth,
  subscribeSqlBackendPreference,
} from "@/lib/sql/sql-runtime";

export function useSqlBackendPreference(): SqlBackendPreference {
  return useSyncExternalStore(
    subscribeSqlBackendPreference,
    getSqlBackendPreference,
    getSqlBackendPreference,
  );
}

export function useBridgeHealthStatus(): BridgeHealthStatus {
  return useSyncExternalStore(
    subscribeBridgeHealth,
    getBridgeHealthStatus,
    getBridgeHealthStatus,
  );
}

export function useDuckDbHttpHealthStatus(): DuckDbHttpHealthStatus {
  return useSyncExternalStore(
    subscribeDuckDbHttpHealth,
    getDuckDbHttpHealthStatus,
    getDuckDbHttpHealthStatus,
  );
}

export function useDuckDbHttpConfig(): StoredDuckDbHttpConfig | null {
  return useSyncExternalStore(
    subscribeDuckDbHttpConfig,
    getDuckDbHttpConfigFromStorage,
    getDuckDbHttpConfigFromStorage,
  );
}
