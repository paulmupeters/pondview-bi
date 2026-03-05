import { useSyncExternalStore } from "react";
import {
  getBridgeHealthStatus,
  getSqlBackendPreference,
  subscribeBridgeHealth,
  subscribeSqlBackendPreference,
  type BridgeHealthStatus,
  type SqlBackendPreference,
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
