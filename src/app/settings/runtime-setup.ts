import type { PondviewBridgeConfig } from "@/lib/bridge/pondview-bridge";

export type BridgeProjectDatabaseSetup = {
  choice: "none" | "existing-duckdb";
  duckDbPath: string | null;
};

export function resolveBridgeProjectDatabaseSetup(input: {
  configuredDatabasePath?: string;
  detectedDuckDbPaths: string[];
  bridgeConfig: PondviewBridgeConfig | null;
}): BridgeProjectDatabaseSetup {
  if (input.configuredDatabasePath?.trim()) {
    return {
      choice: "existing-duckdb",
      duckDbPath: input.configuredDatabasePath.trim(),
    };
  }

  if (input.detectedDuckDbPaths.length === 1) {
    return {
      choice: "existing-duckdb",
      duckDbPath: input.detectedDuckDbPaths[0] ?? null,
    };
  }

  if (input.bridgeConfig?.database?.mode === "file") {
    return {
      choice: "existing-duckdb",
      duckDbPath: input.bridgeConfig.database.name ?? null,
    };
  }

  return {
    choice: "none",
    duckDbPath: null,
  };
}
