import { describe, expect, test } from "bun:test";
import {
  createLocalSourceBindings,
  resolveInitialStartupRuntime,
  resolveQuickStartDatabasePath,
  resolveStartupProjectDisplayPath,
  resolveStartupRuntimeSelection,
  shouldShowQuickStart,
  validateStartupRuntime,
} from "@/components/project-startup-gate";

describe("ProjectStartupGate runtime selection", () => {
  test("defaults to a new DuckDB when no root DuckDB files are detected", () => {
    expect(resolveInitialStartupRuntime({ detectedDuckDbPaths: [] })).toEqual({
      choice: "new-duckdb",
      duckDbPath: "runtime/pondview-runtime.duckdb",
    });
  });

  test("preselects a single detected root DuckDB file", () => {
    expect(
      resolveInitialStartupRuntime({
        detectedDuckDbPaths: ["analytics.duckdb"],
      }),
    ).toEqual({
      choice: "existing-duckdb",
      duckDbPath: "analytics.duckdb",
    });
  });

  test("requires an explicit choice when multiple DuckDB files are detected", () => {
    expect(
      resolveInitialStartupRuntime({
        detectedDuckDbPaths: ["analytics.duckdb", "report.duckdb"],
      }),
    ).toEqual({
      choice: "existing-duckdb",
      duckDbPath: "",
    });
    expect(
      validateStartupRuntime({
        runtimeChoice: "existing-duckdb",
        duckDbPath: "",
      }),
    ).toMatch(/Choose a DuckDB file/);
  });

  test("prefers an explicitly configured bridge database over detection", () => {
    expect(
      resolveInitialStartupRuntime({
        configuredDatabasePath: "/tmp/warehouse.duckdb",
        detectedDuckDbPaths: ["analytics.duckdb"],
      }),
    ).toEqual({
      choice: "existing-duckdb",
      duckDbPath: "/tmp/warehouse.duckdb",
    });
  });

  test("builds local source bindings for the selected bridge file", () => {
    expect(
      JSON.parse(
        createLocalSourceBindings({
          runtimeBackend: "bridge",
          dbIdentifier: "analytics.duckdb",
          catalogContext: "main",
        }),
      ),
    ).toEqual({
      schemaVersion: 1,
      bindings: {
        local: {
          runtimeBackend: "bridge",
          dbIdentifier: "analytics.duckdb",
          catalogContext: "main",
        },
      },
    });
  });

  test("resolves WASM to the browser-local DuckDB identifier", () => {
    expect(
      resolveStartupRuntimeSelection({
        runtimeChoice: "wasm",
        duckDbPath: "",
      }),
    ).toEqual({
      backend: "duckdb-wasm",
      dbIdentifier: "wasm:local",
      catalogContext: null,
    });
  });
});

describe("ProjectStartupGate quick start", () => {
  test("offers quick start when one DuckDB file is detected", () => {
    expect(
      shouldShowQuickStart({
        detectedDuckDbPaths: ["analytics.duckdb"],
      }),
    ).toBe(true);
    expect(
      resolveQuickStartDatabasePath({
        detectedDuckDbPaths: ["analytics.duckdb"],
      }),
    ).toBe("analytics.duckdb");
  });

  test("offers quick start when the bridge database is configured", () => {
    expect(
      shouldShowQuickStart({
        configuredDatabasePath: "/tmp/warehouse.duckdb",
        detectedDuckDbPaths: [],
      }),
    ).toBe(true);
    expect(
      resolveQuickStartDatabasePath({
        configuredDatabasePath: "/tmp/warehouse.duckdb",
        detectedDuckDbPaths: ["analytics.duckdb"],
      }),
    ).toBe("/tmp/warehouse.duckdb");
  });

  test("requires the full setup flow when multiple DuckDB files are detected", () => {
    expect(
      shouldShowQuickStart({
        detectedDuckDbPaths: ["analytics.duckdb", "report.duckdb"],
      }),
    ).toBe(false);
    expect(
      resolveQuickStartDatabasePath({
        detectedDuckDbPaths: ["analytics.duckdb", "report.duckdb"],
      }),
    ).toBeNull();
  });
});

describe("ProjectStartupGate project path display", () => {
  test("hides the bridge package path from the startup intro", () => {
    expect(
      resolveStartupProjectDisplayPath({
        name: "bridge",
        rootPath:
          "/Users/paulpeters/Developer/pondview/pondview-ui/packages/bridge",
      }),
    ).toBeNull();
  });

  test("keeps real project paths visible", () => {
    expect(
      resolveStartupProjectDisplayPath({
        name: "revenue",
        rootPath: "/Users/paulpeters/Projects/revenue",
      }),
    ).toBe("/Users/paulpeters/Projects/revenue");
  });
});
