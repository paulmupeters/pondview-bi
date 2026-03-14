import { describe, expect, test } from "bun:test";
import { buildAttachmentPlan } from "@/lib/duckdb/duckdb-attachments";

describe("buildAttachmentPlan", () => {
  test("strips MotherDuck query params before ATTACH", () => {
    const plan = buildAttachmentPlan({
      type: "motherduck",
      identifier:
        "md:my_db?motherduck_token=abc123&attach_mode=single&saas_mode=true",
    });

    expect(plan.alias).toBe("my_db");
    expect(plan.statements).toEqual([
      "INSTALL motherduck;",
      "LOAD motherduck;",
      `ATTACH 'md:my_db' AS "my_db";`,
    ]);
  });
});
