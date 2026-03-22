import { useEffect } from "react";
import { refreshBridgeHealth } from "@/lib/sql/sql-runtime";

const BRIDGE_REFRESH_INTERVAL_MS = 15000;

export function SqlRuntimeBootstrap() {
  useEffect(() => {
    void refreshBridgeHealth();

    const intervalId = window.setInterval(() => {
      void refreshBridgeHealth();
    }, BRIDGE_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
