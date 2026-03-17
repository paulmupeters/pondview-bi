import { describe, expect, test } from "bun:test";
import { buildAttachmentPlan } from "@/lib/duckdb/duckdb-attachments";

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
