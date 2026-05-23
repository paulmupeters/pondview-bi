import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  getBridgeConfigFromCache,
  hasSessionSecret,
  type PondviewBridgeConfig,
  subscribeBridgeConfig,
  subscribeBridgeSessionSecret,
} from "@/lib/bridge/pondview-bridge";
import {
  type BridgeHealthStatus,
  type BridgeRuntimeState,
  getBridgeHealthStatus,
  getSqlBackendPreference,
  type ResolveSqlBackendOptions,
  type RuntimeDeps,
  resolveSelectedSqlBackend,
  resolveSqlBackend,
  type SqlBackend,
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

export function useBridgeConfig(): PondviewBridgeConfig | null {
  return useSyncExternalStore(
    subscribeBridgeConfig,
    getBridgeConfigFromCache,
    getBridgeConfigFromCache,
  );
}

function getHasBridgeSessionSecret(): boolean {
  return hasSessionSecret();
}

export function useHasBridgeSessionSecret(): boolean {
  return useSyncExternalStore(
    subscribeBridgeSessionSecret,
    getHasBridgeSessionSecret,
    getHasBridgeSessionSecret,
  );
}

export function useBridgeRuntimeState(): BridgeRuntimeState {
  const healthStatus = useBridgeHealthStatus();
  const config = useBridgeConfig();
  const hasSessionSecret = useHasBridgeSessionSecret();

  return useMemo(() => {
    const isDiscoverable = healthStatus === "online" && config !== null;
    return {
      healthStatus,
      config,
      hasSessionSecret,
      isDiscoverable,
      isQueryReady:
        isDiscoverable && (!config.requiresAuth || hasSessionSecret),
    };
  }, [config, hasSessionSecret, healthStatus]);
}

function useRuntimeDeps(): RuntimeDeps {
  const bridgeRuntimeState = useBridgeRuntimeState();

  return useMemo(
    () => ({
      hasBridgeSecret: () => bridgeRuntimeState.hasSessionSecret,
      getBridgeHealthStatus: () => bridgeRuntimeState.healthStatus,
      getBridgeConfig: () => bridgeRuntimeState.config,
    }),
    [bridgeRuntimeState],
  );
}

export function useResolvedSqlBackend(
  options: ResolveSqlBackendOptions = {},
): SqlBackend {
  const resolveBackend = useResolveSqlBackend();
  return resolveBackend(options);
}

export function useSelectedSqlBackend(
  options: ResolveSqlBackendOptions = {},
): SqlBackend {
  const runtimeDeps = useRuntimeDeps();
  return resolveSelectedSqlBackend(options, runtimeDeps);
}

export function useResolveSqlBackend(): (
  options: ResolveSqlBackendOptions,
) => SqlBackend {
  const runtimeDeps = useRuntimeDeps();

  return useCallback(
    (options: ResolveSqlBackendOptions) =>
      resolveSqlBackend(options, runtimeDeps),
    [runtimeDeps],
  );
}
