import { describe, expect, test } from "bun:test";
import { deriveDraftSqlQueryName } from "@/lib/workspace/sql-editor-drafts-repo";

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
