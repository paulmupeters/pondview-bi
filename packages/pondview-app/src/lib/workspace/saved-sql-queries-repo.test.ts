import { describe, expect, test } from "bun:test";
import type { ProjectArtifactTextFile } from "@/lib/project-artifacts/export";
import {
  deleteSavedSqlQuery,
  listSavedSqlQueries,
  type SavedSqlQuery,
  saveSqlQuery,
} from "./saved-sql-queries-repo";

function createDeps(input: {
  activeProjectId: () => string | null;
  files?: ProjectArtifactTextFile[];
  initial: SavedSqlQuery[];
}) {
  let stored: unknown = input.initial;
  const deletedArtifacts: string[] = [];
  const syncedArtifacts: string[] = [];
  return {
    deps: {
      getPreference: async <T>() => stored as T,
      setPreference: async <T>(_key: string, value: T) => {
        stored = value;
      },
      getActiveProjectId: async () => input.activeProjectId(),
      getActiveProjectFiles: async () => input.files ?? [],
      syncProjectArtifact: async (queryId: string) => {
        syncedArtifacts.push(queryId);
      },
      deleteProjectArtifact: async (query: Pick<SavedSqlQuery, "name">) => {
        deletedArtifacts.push(query.name);
      },
    },
    getStored: () => stored as SavedSqlQuery[],
    deletedArtifacts,
    syncedArtifacts,
  };
}

function query(
  input: Partial<SavedSqlQuery> & Pick<SavedSqlQuery, "id" | "name">,
) {
  return {
    sql: `select '${input.name}'`,
    createdAt: 1,
    updatedAt: 1,
    ...input,
  } satisfies SavedSqlQuery;
}

describe("saved SQL query project scoping", () => {
  test("shows only active-project rows and claims matching legacy artifacts", async () => {
    const legacySql = "select * from revenue";
    const state = createDeps({
      activeProjectId: () => "project-a",
      initial: [
        query({ id: "a", name: "A", projectId: "project-a" }),
        query({ id: "b", name: "B", projectId: "project-b" }),
        query({ id: "legacy-match", name: "Revenue", sql: legacySql }),
        query({ id: "legacy-other", name: "Other" }),
      ],
      files: [
        {
          path: "pondview/queries/shared/revenue.query.json",
          content: JSON.stringify({ name: "Revenue" }),
        },
        {
          path: "pondview/queries/shared/revenue.sql",
          content: legacySql,
        },
      ],
    });

    const rows = await listSavedSqlQueries(undefined, state.deps);

    expect(rows.map((row) => row.id)).toEqual(["a", "legacy-match"]);
    expect(
      state.getStored().find((row) => row.id === "legacy-match"),
    ).toMatchObject({
      projectId: "project-a",
      projectPath: "pondview/queries/shared/revenue.query.json",
    });
    expect(
      state.getStored().find((row) => row.id === "legacy-other")?.projectId,
    ).toBeNull();
  });

  test("saving and deleting preserve rows owned by other projects", async () => {
    let activeProjectId = "project-a";
    const state = createDeps({
      activeProjectId: () => activeProjectId,
      initial: [
        query({ id: "a", name: "A", projectId: "project-a" }),
        query({ id: "b", name: "B", projectId: "project-b" }),
      ],
    });

    const projectARows = await saveSqlQuery(
      { name: "New A", sql: "select 42" },
      state.deps,
    );
    expect(projectARows.map((row) => row.name)).toEqual(["New A", "A"]);
    expect(projectARows[0]?.projectPath).toBe(
      "pondview/queries/shared/new-a.query.json",
    );
    expect(
      state.getStored().filter((row) => row.projectId === "project-b"),
    ).toHaveLength(1);

    activeProjectId = "project-b";
    const projectBRows = await deleteSavedSqlQuery("b", state.deps);
    expect(projectBRows).toEqual([]);
    expect(
      state.getStored().filter((row) => row.projectId === "project-a"),
    ).toHaveLength(2);
    expect(state.deletedArtifacts).toEqual(["B"]);
    expect(state.syncedArtifacts).toHaveLength(1);
  });
});
