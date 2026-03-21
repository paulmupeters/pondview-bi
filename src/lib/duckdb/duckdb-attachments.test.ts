import { describe, expect, test } from "bun:test";
import {
  buildAttachmentPlan,
  resolveAttachmentAlias,
} from "@/lib/duckdb/duckdb-attachments";

describe("resolveAttachmentAlias", () => {
  test("rewrites reserved aliases like main", () => {
    expect(
      resolveAttachmentAlias({
        alias: "main",
        identifier: "host=127.0.0.1 dbname=main",
      }),
    ).toBe("main_db");
  });

  test("rewrites reserved aliases like system", () => {
    expect(
      resolveAttachmentAlias({
        alias: "system",
        identifier: "host=127.0.0.1 dbname=system",
      }),
    ).toBe("system_db");
  });

  test("preserves ordinary aliases", () => {
    expect(
      resolveAttachmentAlias({
        alias: "motherduck",
        identifier: "md:my_db",
      }),
    ).toBe("motherduck");
  });
});

describe("buildAttachmentPlan", () => {
  test("builds MotherDuck attachment statements", () => {
    const plan = buildAttachmentPlan({
      type: "motherduck",
      identifier: "md:my_db",
      alias: "motherduck",
      readOnly: false,
      duckdbExtension: "motherduck",
    });

    expect(plan.alias).toBe("motherduck");
    expect(plan.statements).toEqual([
      "INSTALL motherduck;",
      "LOAD motherduck;",
      `ATTACH 'md:my_db' AS "motherduck";`,
    ]);
  });
});
