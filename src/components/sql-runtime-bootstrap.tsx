import { useEffect } from "react";
import { hydrateAndImportOpenProjectFromStore } from "@/lib/project-runtime";
import { refreshBridgeHealth } from "@/lib/sql/sql-runtime";

const RUNTIME_REFRESH_INTERVAL_MS = 15000;

type SqlRuntimeBootstrapDeps = {
  refreshBridgeHealth: typeof refreshBridgeHealth;
  setInterval: typeof window.setInterval;
  clearInterval: typeof window.clearInterval;
};

export function startSqlRuntimeBootstrap(
  deps: SqlRuntimeBootstrapDeps = {
    refreshBridgeHealth,
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
  },
): () => void {
  void deps.refreshBridgeHealth();

  const intervalId = deps.setInterval(() => {
    void deps.refreshBridgeHealth();
  }, RUNTIME_REFRESH_INTERVAL_MS);

  return () => {
    deps.clearInterval(intervalId);
  };
}

export function SqlRuntimeBootstrap() {
  useEffect(() => {
    void refreshBridgeHealth()
      .catch(() => "offline" as const)
      .then(() => hydrateAndImportOpenProjectFromStore())
      .catch((error) => {
        console.error("Failed to hydrate project runtime defaults:", error);
      });
    return startSqlRuntimeBootstrap();
  }, []);

  return null;
}
