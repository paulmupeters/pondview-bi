import { describe, expect, test } from "bun:test";
import { getInitialSqlEditorDb } from "@/app/sql-editor/page";

describe("getInitialSqlEditorDb", () => {
  test("keeps the SQL editor on local DuckDB when no source has been explicitly selected", () => {
    const selectedDb = getInitialSqlEditorDb(undefined, [
      {
        type: "postgres",
        connectionId: "postgres://warehouse",
        databasePath: "postgres://warehouse",
        attachAs: "warehouse",
      },
    ]);

    expect(selectedDb).toBeUndefined();
  });

  test("preserves an explicit database selection", () => {
    const selectedDb = getInitialSqlEditorDb("postgres://warehouse", [
      {
        type: "postgres",
        connectionId: "postgres://warehouse",
        databasePath: "postgres://warehouse",
        attachAs: "warehouse",
      },
    ]);

    expect(selectedDb).toBe("postgres://warehouse");
  });
});
