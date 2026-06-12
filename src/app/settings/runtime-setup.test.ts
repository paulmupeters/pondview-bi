import { describe, expect, test } from "bun:test";
import { resolveBridgeProjectDatabaseSetup } from "./runtime-setup";

describe("resolveBridgeProjectDatabaseSetup", () => {
  test("uses a configured bridge database path", () => {
    expect(
      resolveBridgeProjectDatabaseSetup({
        configuredDatabasePath: " /tmp/analytics.duckdb ",
        detectedDuckDbPaths: [],
        bridgeConfig: null,
      }),
    ).toEqual({
      choice: "existing-duckdb",
      duckDbPath: "/tmp/analytics.duckdb",
    });
  });

  test("uses the bridge runtime file database when project setup is not configured", () => {
    expect(
      resolveBridgeProjectDatabaseSetup({
        detectedDuckDbPaths: [],
        bridgeConfig: {
          host: "127.0.0.1",
          port: 17817,
          requiresAuth: false,
          database: {
            mode: "file",
            id: "database-id",
            name: "analytics.duckdb",
          },
        },
      }),
    ).toEqual({
      choice: "existing-duckdb",
      duckDbPath: "analytics.duckdb",
    });
  });

  test("keeps no local database for an in-memory bridge runtime", () => {
    expect(
      resolveBridgeProjectDatabaseSetup({
        detectedDuckDbPaths: [],
        bridgeConfig: {
          host: "127.0.0.1",
          port: 17817,
          requiresAuth: false,
          database: {
            mode: "memory",
            id: "memory",
          },
        },
      }),
    ).toEqual({
      choice: "none",
      duckDbPath: null,
    });
  });
});
