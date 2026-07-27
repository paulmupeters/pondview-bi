import { describe, expect, test } from "bun:test";
import {
  type DraftSqlQuery,
  deriveDraftSqlQueryName,
  listDraftSqlQueries,
  migrateLegacyDraftSqlQueriesToProject,
  replaceDraftSqlQueries,
} from "./sql-editor-drafts-repo";

describe("deriveDraftSqlQueryName", () => {
  test("uses the first meaningful SQL line for draft names", () => {
    expect(
      deriveDraftSqlQueryName(`
        -- comment
        SELECT * FROM revenue;
      `),
    ).toBe("SELECT * FROM revenue;");
  });

  test("falls back to a dated draft name when the SQL is empty", () => {
    expect(deriveDraftSqlQueryName("", Date.UTC(2026, 3, 23, 8, 5))).toBe(
      "Draft 2026-04-23 08:05",
    );
  });
});

function draft(id: string, projectId?: string | null): DraftSqlQuery {
  return {
    id,
    projectId,
    name: id,
    sql: `select '${id}'`,
    createdAt: 1,
    updatedAt: 1,
  };
}

function createDeps(initial: DraftSqlQuery[]) {
  let stored: unknown = initial;
  return {
    deps: {
      getPreference: async <T>() => stored as T,
      setPreference: async <T>(_key: string, value: T) => {
        stored = value;
      },
      getActiveProjectId: async () => "project-a",
    },
    getStored: () => stored as DraftSqlQuery[],
  };
}

describe("SQL editor draft project scoping", () => {
  test("hides unscoped and other-project drafts", async () => {
    const state = createDeps([
      draft("a", "project-a"),
      draft("b", "project-b"),
      draft("legacy"),
    ]);

    expect(
      (await listDraftSqlQueries(undefined, state.deps)).map((row) => row.id),
    ).toEqual(["a"]);
  });

  test("replacing one project's drafts preserves every other scope", async () => {
    const state = createDeps([
      draft("a", "project-a"),
      draft("b", "project-b"),
      draft("legacy"),
    ]);

    await replaceDraftSqlQueries([draft("next-a")], "project-a", state.deps);

    expect(
      state
        .getStored()
        .map((row) => row.id)
        .sort(),
    ).toEqual(["b", "legacy", "next-a"]);
    expect(
      state.getStored().find((row) => row.id === "next-a")?.projectId,
    ).toBe("project-a");
  });

  test("assigns legacy drafts to the project active before a switch", async () => {
    const state = createDeps([draft("legacy"), draft("b", "project-b")]);

    await migrateLegacyDraftSqlQueriesToProject("project-a", state.deps);

    expect(
      state.getStored().find((row) => row.id === "legacy")?.projectId,
    ).toBe("project-a");
    expect(state.getStored().find((row) => row.id === "b")?.projectId).toBe(
      "project-b",
    );
  });
});
