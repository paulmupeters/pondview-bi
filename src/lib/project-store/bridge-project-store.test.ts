import { describe, expect, test } from "bun:test";
import type {
  BridgeCapabilitiesResponse,
  BridgeProject,
} from "@pondview/bridge-protocol";
import type { ProjectArtifactTextFile } from "@/lib/project-artifacts/export";
import {
  BridgeProjectStore,
  isBridgeProjectStoreAvailable,
} from "@/lib/project-store";

describe("BridgeProjectStore", () => {
  test("reads and mutates project files through bridge project endpoints", async () => {
    let project: BridgeProject = {
      id: "bridge-project-root",
      name: "Revenue",
      backingKind: "bridge-filesystem",
      openedAt: 1,
      updatedAt: 2,
      defaultSourceRef: null,
      rootPath: "/work/revenue",
    };
    let files: ProjectArtifactTextFile[] = [
      { path: "pondview/queries/shared/revenue.sql", content: "old" },
    ];
    const store = new BridgeProjectStore({
      getProject: async () => ({ project }),
      updateProject: async (input) => {
        project = {
          ...project,
          name: input.name ?? project.name,
          defaultSourceRef:
            input.defaultSourceRef === undefined
              ? project.defaultSourceRef
              : input.defaultSourceRef,
        };
        return { project };
      },
      listFiles: async () => ({ files }),
      saveFiles: async (input) => {
        files = [...files, ...input.files];
        return { files };
      },
      replaceFiles: async (input) => {
        const scope = input.scopePath?.replace(/\/$/, "") ?? "";
        files = [
          ...files.filter(
            (file) => scope && !file.path.startsWith(`${scope}/`),
          ),
          ...input.files,
        ];
        return { files };
      },
      deleteFiles: async (input) => {
        const paths = new Set(input.paths);
        files = files.filter((file) => !paths.has(file.path));
        return { files };
      },
    });

    await store.setOpenProject({
      ...project,
      name: "Revenue 2026",
      defaultSourceRef: "analytics",
    });
    await store.saveProjectFiles(project.id, [
      { path: "pondview/queries/shared/orders.sql", content: "select 1;" },
    ]);
    await store.replaceProjectFiles(project.id, "pondview/queries/shared", [
      { path: "pondview/queries/shared/orders.sql", content: "select 2;" },
    ]);
    await store.deleteProjectFiles(project.id, [
      "pondview/queries/shared/orders.sql",
    ]);

    expect(await store.getOpenProject()).toMatchObject({
      name: "Revenue 2026",
      backingKind: "bridge-filesystem",
      rootPath: "/work/revenue",
      defaultSourceRef: "analytics",
    });
    expect(await store.listProjectFiles(project.id)).toEqual([]);
  });

  test("active store reports bridge availability from capabilities", async () => {
    let capabilities: BridgeCapabilitiesResponse = {
      runtimeBackend: "bridge",
      query: true,
      catalog: true,
      attachDuckDb: true,
      importFiles: false,
      projects: true,
      readonly: false,
    };

    const deps = {
      getSession: async () => ({
        host: "127.0.0.1",
        port: 17817,
        requiresAuth: false,
        hasSecret: false,
        isQueryReady: true,
      }),
      getCapabilities: async () => capabilities,
    };

    expect(await isBridgeProjectStoreAvailable(deps)).toBe(true);

    capabilities = { ...capabilities, projects: false };
    expect(await isBridgeProjectStoreAvailable(deps)).toBe(false);
  });
});
