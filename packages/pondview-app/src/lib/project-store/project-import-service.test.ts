import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import type { ProjectArtifactTextFile } from "@/lib/project-artifacts/export";
import {
  importInspectedPortableProject,
  inspectPortableProjectBytes,
  type ProjectImportDeps,
  sanitizePortableProjectFiles,
} from "@/lib/project-store/project-import-service";
import { createBrowserProjectArchive } from "@/lib/project-store/project-transfer";

function jsonFile(path: string, value: unknown): ProjectArtifactTextFile {
  return {
    path,
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}

function projectFiles(): ProjectArtifactTextFile[] {
  return [
    jsonFile("pondview/project.json", {
      schemaVersion: 1,
      name: "Portable Revenue",
      defaultSourceRef: "analytics",
      sourceBindings: {
        analytics: {
          runtimeBackend: "bridge",
          dbIdentifier: "postgres://user:password@example.com/analytics",
          connection: {
            type: "custom",
            setupSql: "CREATE VIEW revenue AS SELECT 1",
          },
        },
      },
    }),
    jsonFile("pondview/dashboards/revenue/dashboard.json", {
      schemaVersion: 1,
      id: "revenue",
      title: "Revenue",
      sourceRef: "analytics",
      measures: [],
      visuals: [],
    }),
  ];
}

function archive(snapshot = true): Uint8Array {
  return createBrowserProjectArchive({
    project: {
      id: "portable-revenue",
      name: "Portable Revenue",
      backingKind: "browser-indexeddb",
      openedAt: 1,
      updatedAt: 2,
      defaultSourceRef: "analytics",
    },
    files: projectFiles(),
    entryDashboardId: "revenue",
    runtimeSnapshot: snapshot
      ? { bytes: new Uint8Array([1, 2, 3, 4]) }
      : undefined,
  });
}

describe("portable project import", () => {
  test("inspects dashboards, snapshots, and unsafe source bindings", () => {
    const inspection = inspectPortableProjectBytes({
      fileName: "revenue.pondview",
      bytes: archive(),
    });

    expect(inspection.dashboardCount).toBe(1);
    expect(inspection.entryDashboardId).toBe("revenue");
    expect(inspection.runtimeSnapshotBytes).not.toBeNull();
    expect(inspection.warnings.map((warning) => warning.code)).toEqual([
      "embedded-credential",
      "custom-setup-sql",
      "bridge-source",
      "external-source",
    ]);
  });

  test("marks artifact-only packages as needing data", () => {
    const inspection = inspectPortableProjectBytes({
      fileName: "revenue.pondview",
      bytes: archive(false),
    });

    expect(inspection.warnings.at(-1)?.code).toBe("missing-snapshot");
  });

  test("sanitizes project source bindings for the browser runtime", () => {
    const inspection = inspectPortableProjectBytes({
      fileName: "revenue.pondview",
      bytes: archive(),
    });
    const sanitized = sanitizePortableProjectFiles(
      inspection.bundle.files,
      inspection.parsedArtifacts,
    );
    const projectManifest = JSON.parse(
      sanitized.find((file) => file.path === "pondview/project.json")
        ?.content ?? "{}",
    ) as {
      sourceBindings?: Record<
        string,
        {
          runtimeBackend?: string;
          dbIdentifier?: string;
          catalogContext?: string | null;
          connection?: unknown;
        }
      >;
    };

    expect(projectManifest.sourceBindings?.analytics).toEqual({
      runtimeBackend: "duckdb-wasm",
      dbIdentifier: "wasm:local",
      catalogContext: null,
    });
  });

  test("restores the snapshot before importing artifacts", async () => {
    const inspection = inspectPortableProjectBytes({
      fileName: "revenue.pondview",
      bytes: archive(),
    });
    const calls: string[] = [];
    const deps: ProjectImportDeps = {
      restoreBundle: async (bundle) => {
        calls.push("restore-project");
        expect(bundle.files[0]?.content).not.toContain("setupSql");
        return {
          id: bundle.project.id,
          name: bundle.project.name,
          backingKind: "browser-indexeddb",
          openedAt: 1,
          updatedAt: 2,
          defaultSourceRef: bundle.project.defaultSourceRef,
        };
      },
      importSnapshot: async (bytes) => {
        calls.push("restore-snapshot");
        expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
      },
      hydrateRuntime: async () => {
        calls.push("hydrate-runtime");
        return null;
      },
      importArtifacts: async (_parsed, options) => {
        calls.push("import-artifacts");
        expect(options?.fallbackSqlBackend).toBe("duckdb-wasm");
        return {
          dashboards: [{ id: "imported-revenue" }],
          sharedQueries: [],
          publishedNotebooks: [],
          reconciliation: {
            deletedDashboardIds: [],
            deletedSavedQueryIds: [],
            deletedNotebookIds: [],
          },
        };
      },
      setSqlBackendPreference: (backend) => {
        calls.push(`backend:${backend}`);
      },
      estimateStorage: async () => ({
        quota: 10_000,
        usage: 0,
      }),
    };

    const result = await importInspectedPortableProject(inspection, deps);

    expect(result).toMatchObject({
      dashboardId: "imported-revenue",
      restoredSnapshot: true,
    });
    expect(calls).toEqual([
      "restore-project",
      "backend:duckdb-wasm",
      "restore-snapshot",
      "hydrate-runtime",
      "backend:duckdb-wasm",
      "import-artifacts",
    ]);
  });

  test("rejects a path traversal entry", () => {
    const unsafe = zipSync({
      ".pondview/project.json": strToU8(
        JSON.stringify({
          schemaVersion: 1,
          exportedAt: "2026-07-27T00:00:00.000Z",
          project: {
            id: "portable-revenue",
            name: "Portable Revenue",
            backingKind: "browser-indexeddb",
          },
        }),
      ),
      "../outside.sql": strToU8("select 1"),
    });

    expect(() =>
      inspectPortableProjectBytes({
        fileName: "unsafe.pondview",
        bytes: unsafe,
      }),
    ).toThrow("unsafe path");
  });

  test("rejects an absolute archive path", () => {
    const unsafe = zipSync({
      "/pondview/project.json": strToU8("{}"),
    });

    expect(() =>
      inspectPortableProjectBytes({
        fileName: "unsafe.pondview",
        bytes: unsafe,
      }),
    ).toThrow("unsafe path");
  });
});
