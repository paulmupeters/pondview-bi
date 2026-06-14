import { describe, expect, test } from "bun:test";
import { rewriteSqlForAttachedDatabase } from "@/lib/duckdb/rewrite-sql";

describe("rewriteSqlForAttachedDatabase", () => {
  test("uses alias.table for unqualified refs", () => {
    expect(
      rewriteSqlForAttachedDatabase("SELECT * FROM unicorns", "motherduck"),
    ).toBe("SELECT * FROM motherduck.unicorns");
  });

  test("uses alias.table for default-schema refs", () => {
    expect(
      rewriteSqlForAttachedDatabase(
        "SELECT * FROM main.unicorns",
        "motherduck",
      ),
    ).toBe("SELECT * FROM motherduck.unicorns");
  });

  test("leaves alias-qualified refs untouched", () => {
    expect(
      rewriteSqlForAttachedDatabase(
        "SELECT * FROM motherduck.unicorns",
        "motherduck",
      ),
    ).toBe("SELECT * FROM motherduck.unicorns");
  });
});
