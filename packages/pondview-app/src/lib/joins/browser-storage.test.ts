import { describe, expect, test } from "bun:test";
import { parseJoinDefsPayload } from "@/lib/joins/browser-storage";

describe("parseJoinDefsPayload", () => {
  test("accepts valid join definitions and deduplicates duplicates", () => {
    const parsed = parseJoinDefsPayload([
      {
        leftTable: "orders",
        leftColumn: "customer_id",
        rightTable: "customers",
        rightColumn: "id",
        type: "inner",
      },
      {
        left_table: "orders",
        left_column: "customer_id",
        right_table: "customers",
        right_column: "id",
        type: "inner",
      },
      {
        leftTable: "orders",
        leftColumn: "region_id",
        rightTable: "regions",
        rightColumn: "id",
      },
      {
        leftTable: "",
        leftColumn: "x",
        rightTable: "invalid",
        rightColumn: "y",
      },
    ]);

    expect(parsed).toEqual([
      {
        leftTable: "orders",
        leftColumn: "customer_id",
        rightTable: "customers",
        rightColumn: "id",
        type: "inner",
      },
      {
        leftTable: "orders",
        leftColumn: "region_id",
        rightTable: "regions",
        rightColumn: "id",
        type: "left",
      },
    ]);
  });

  test("rejects non-array payloads", () => {
    expect(() => parseJoinDefsPayload({ joins: [] })).toThrow(
      "Join definitions must be a JSON array.",
    );
  });
});
