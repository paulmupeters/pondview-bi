import { describe, expect, test } from "bun:test";
import {
  createProjectManifest,
  hasStartupProjectArtifacts,
  resolveInitialStartupRuntime,
  resolveQuickStartDatabasePath,
  resolveStartupProjectDisplayPath,
  resolveStartupRuntimeSelection,
  shouldAdoptBridgeFilesystemProject,
  shouldHideStartupGateForBrowserProject,
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

  test("builds a project manifest with the selected bridge file", () => {
    expect(
      JSON.parse(
        createProjectManifest("Example", {
          runtimeBackend: "bridge",
          dbIdentifier: "analytics.duckdb",
          catalogContext: "main",
        }),
      ),
    ).toEqual({
      schemaVersion: 1,
      name: "Example",
      defaultSourceRef: "local",
      sourceBindings: {
        local: {
          runtimeBackend: "bridge",
          dbIdentifier: "analytics.duckdb",
          catalogContext: "main",
        },
      },
    });
  });

  test("builds a project manifest without a default source", () => {
    expect(JSON.parse(createProjectManifest("Example"))).toEqual({
      schemaVersion: 1,
      name: "Example",
    });
  });

  test("keeps legacy local source bindings serializable", async () => {
    const { createLocalSourceBindings } = await import(
      "@/components/project-startup-gate"
    );
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

describe("ProjectStartupGate browser project mode", () => {
  test("does not hide stale browser project mode when a DuckDB file is detected", () => {
    expect(
      shouldHideStartupGateForBrowserProject({
        projectStoreMode: "browser-indexeddb",
        hasProjectArtifacts: false,
        detectedDuckDbPaths: ["analytics.duckdb"],
      }),
    ).toBe(false);
  });

  test("does not hide stale browser project mode when project files exist", () => {
    expect(
      shouldHideStartupGateForBrowserProject({
        projectStoreMode: "browser-indexeddb",
        hasProjectArtifacts: true,
        detectedDuckDbPaths: [],
      }),
    ).toBe(false);
  });

  test("hides browser project mode for an empty folder with no runtime choice", () => {
    expect(
      shouldHideStartupGateForBrowserProject({
        projectStoreMode: "browser-indexeddb",
        hasProjectArtifacts: false,
        detectedDuckDbPaths: [],
      }),
    ).toBe(true);
  });

  test("adopts bridge filesystem mode when project artifacts already exist", () => {
    expect(
      shouldAdoptBridgeFilesystemProject({
        projectStoreMode: "browser-indexeddb",
        hasProjectArtifacts: true,
      }),
    ).toBe(true);
    expect(
      shouldAdoptBridgeFilesystemProject({
        projectStoreMode: "bridge-filesystem",
        hasProjectArtifacts: true,
      }),
    ).toBe(false);
    expect(
      shouldAdoptBridgeFilesystemProject({
        projectStoreMode: null,
        hasProjectArtifacts: false,
      }),
    ).toBe(false);
  });
});

describe("ProjectStartupGate project artifact detection", () => {
  test("does not treat a standalone gitignore as initialized project artifacts", () => {
    expect(hasStartupProjectArtifacts([{ path: ".gitignore" }])).toBe(false);
  });

  test("treats Pondview project files as initialized project artifacts", () => {
    expect(
      hasStartupProjectArtifacts([
        { path: ".gitignore" },
        { path: "pondview/project.json" },
      ]),
    ).toBe(true);
  });

  test("treats legacy local source bindings as initialized project artifacts", () => {
    expect(
      hasStartupProjectArtifacts([{ path: "pondview.sources.local.json" }]),
    ).toBe(true);
  });
});

describe("ProjectStartupGate project path display", () => {
  test("hides internal CLI package paths from the startup intro", () => {
    for (const packagePath of [
      "/Users/paulpeters/Developer/pondview/pondview-ui/packages/cli",
      "/Users/paulpeters/Developer/pondview/pondview-ui/packages/bridge",
    ]) {
      expect(
        resolveStartupProjectDisplayPath({
          name: "cli",
          rootPath: packagePath,
        }),
      ).toBeNull();
    }
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
