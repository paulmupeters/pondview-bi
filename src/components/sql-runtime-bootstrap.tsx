import { useEffect } from "react";
import { refreshDuckDbHttpHealth } from "@/lib/duckdb/duckdb-http-browser";
import {
  refreshBridgeHealth,
  resolveSelectedSqlBackend,
} from "@/lib/sql/sql-runtime";

const RUNTIME_REFRESH_INTERVAL_MS = 15000;

type SqlRuntimeBootstrapDeps = {
  refreshBridgeHealth: typeof refreshBridgeHealth;
  refreshDuckDbHttpHealth: typeof refreshDuckDbHttpHealth;
  getSelectedSqlBackend: typeof resolveSelectedSqlBackend;
  setInterval: typeof window.setInterval;
  clearInterval: typeof window.clearInterval;
};

export function startSqlRuntimeBootstrap(
  deps: SqlRuntimeBootstrapDeps = {
    refreshBridgeHealth,
    refreshDuckDbHttpHealth,
    getSelectedSqlBackend: resolveSelectedSqlBackend,
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
  },
): () => void {
  void deps.refreshBridgeHealth();
  if (deps.getSelectedSqlBackend({}) === "duckdb-http") {
    void deps.refreshDuckDbHttpHealth();
  }

  const intervalId = deps.setInterval(() => {
    void deps.refreshBridgeHealth();
    if (deps.getSelectedSqlBackend({}) === "duckdb-http") {
      void deps.refreshDuckDbHttpHealth();
    }
  }, RUNTIME_REFRESH_INTERVAL_MS);

  return () => {
    deps.clearInterval(intervalId);
  };
}

export function SqlRuntimeBootstrap() {
  useEffect(() => {
    return startSqlRuntimeBootstrap();
  }, []);

  return null;
}
