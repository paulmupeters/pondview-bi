import { describe, expect, test } from "bun:test";
import { normalizeFilterPayload } from "@/lib/filters/normalize-filters";
import { extractTableNamesFromSql, findBaseTableReference } from "@/lib/filters/parse-tables";

describe("normalizeFilterPayload", () => {
  test("normalizes legacy operators and field formats", () => {
    const input = [
      {
        field: "orders.region",
        op: "equals",
        values: ["EMEA"],
      },
      {
        field: "country",
        op: "not_equals",
        values: "NL",
      },
    ];

    const output = normalizeFilterPayload(input, { defaultTable: "unicorns" });

    expect(output).toEqual([
      {
        field: "orders.region",
        op: "eq",
        values: ["EMEA"],
      },
      {
        field: "unicorns.country",
        op: "neq",
        values: ["NL"],
      },
    ]);
  });
});

describe("parse-tables", () => {
  test("extracts table names from FROM and JOIN clauses", () => {
    const sql =
      'SELECT * FROM "main"."orders" o JOIN customers c ON o.customer_id = c.id';
    const tables = extractTableNamesFromSql(sql);
    expect(tables).toEqual(["orders", "customers"]);
  });

  test("finds base table reference", () => {
    const sql = "SELECT * FROM orders o WHERE o.amount > 100";
    const base = findBaseTableReference(sql);
    expect(base?.tableName).toBe("orders");
    expect(base?.alias).toBe("o");
  });
});
