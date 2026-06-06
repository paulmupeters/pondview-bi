import { describe, expect, test } from "bun:test";
import type { ParsedProjectArtifacts } from "@/lib/project-artifacts/parse";
import {
  getProjectRuntimeDefaultDbIdentifierForSelection,
  hydrateProjectRuntimeFromParsedArtifacts,
  resolveProjectRuntimeSelection,
} from "@/lib/project-runtime";

function createParsedArtifacts(
  overrides: Partial<ParsedProjectArtifacts>,
): ParsedProjectArtifacts {
  return {
    projectManifest: null,
    sourceRegistry: null,
    localSourceBindings: null,
    dashboards: [],
    sharedQueries: [],
    publishedNotebooks: [],
    ...overrides,
  };
}

describe("project runtime hydration", () => {
  test("resolves the bound default project source into a runtime selection", () => {
    const selection = resolveProjectRuntimeSelection({
      projectId: "browser-project-revenue",
      parsed: createParsedArtifacts({
        projectManifest: {
          schemaVersion: 1,
          name: "Revenue",
          defaultSourceRef: "analytics",
        },
        localSourceBindings: {
          schemaVersion: 1,
          bindings: {
            analytics: {
              runtimeBackend: "bridge",
              dbIdentifier: "postgres://warehouse/app",
              catalogContext: "public",
            },
          },
        },
      }),
    });

    expect(selection).toEqual({
      projectId: "browser-project-revenue",
      sourceRef: "analytics",
      runtimeBackend: "bridge",
      dbIdentifier: "postgres://warehouse/app",
      catalogContext: "public",
      setupSql: null,
    });
  });

  test("resolves SQL-backed custom default sources without a db identifier", () => {
    const setupSql = "CREATE OR REPLACE VIEW sheet_sales AS SELECT 1 AS value;";
    const selection = resolveProjectRuntimeSelection({
      projectId: "browser-project-revenue",
      parsed: createParsedArtifacts({
        projectManifest: {
          schemaVersion: 1,
          name: "Revenue",
          defaultSourceRef: "google-sheet",
        },
        localSourceBindings: {
          schemaVersion: 1,
          bindings: {
            "google-sheet": {
              runtimeBackend: "bridge",
              dbIdentifier: "ignored",
              catalogContext: null,
              connection: {
                type: "custom",
                setupSql,
              },
            },
          },
        },
      }),
    });

    expect(selection).toEqual({
      projectId: "browser-project-revenue",
      sourceRef: "google-sheet",
      runtimeBackend: "bridge",
      dbIdentifier: null,
      catalogContext: null,
      setupSql,
    });
  });

  test("does not resolve a runtime selection when the default source has no local binding", () => {
    const selection = resolveProjectRuntimeSelection({
      projectId: "browser-project-revenue",
      parsed: createParsedArtifacts({
        projectManifest: {
          schemaVersion: 1,
          name: "Revenue",
          defaultSourceRef: "analytics",
        },
      }),
    });

    expect(selection).toBeNull();
  });

  test("hydrates project runtime defaults and updates project defaultSourceRef", async () => {
    const setProjectCalls: Array<{ defaultSourceRef?: string | null }> = [];
    const persistedSelections: unknown[] = [];
    const backendSelections: string[] = [];

    const selection = await hydrateProjectRuntimeFromParsedArtifacts(
      {
        project: {
          id: "browser-project-revenue",
          name: "Revenue",
          backingKind: "browser-indexeddb",
          openedAt: 1,
          updatedAt: 1,
          defaultSourceRef: null,
        },
        parsed: createParsedArtifacts({
          projectManifest: {
            schemaVersion: 1,
            name: "Revenue",
            defaultSourceRef: "analytics",
          },
          localSourceBindings: {
            schemaVersion: 1,
            bindings: {
              analytics: {
                runtimeBackend: "bridge",
                dbIdentifier: null,
                catalogContext: "main",
              },
            },
          },
        }),
      },
      {
        setOpenProject: async (project) => {
          if (project) {
            setProjectCalls.push(project);
          }
        },
        persistSelection: (persisted) => {
          persistedSelections.push(persisted);
        },
        setSqlBackendPreference: (backend) => {
          backendSelections.push(backend);
        },
      },
    );

    expect(selection).toEqual({
      projectId: "browser-project-revenue",
      sourceRef: "analytics",
      runtimeBackend: "bridge",
      dbIdentifier: null,
      catalogContext: "main",
      setupSql: null,
    });
    expect(setProjectCalls).toHaveLength(1);
    expect(setProjectCalls[0]?.defaultSourceRef).toBe("analytics");
    expect(persistedSelections).toEqual([selection]);
    expect(backendSelections).toEqual(["bridge"]);
  });

  test("maps duckdb-wasm project defaults to the local wasm identifier", () => {
    expect(
      getProjectRuntimeDefaultDbIdentifierForSelection({
        projectId: "browser-project-revenue",
        sourceRef: "local",
        runtimeBackend: "duckdb-wasm",
        dbIdentifier: null,
        catalogContext: null,
        setupSql: null,
      }),
    ).toBe("wasm:local");
  });
});
