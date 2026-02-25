import { describe, expect, test } from "bun:test";
import { normalizeFilterPayload } from "@/lib/filters/normalize-filters";
import {
  extractTableNamesFromSql,
  findBaseTableReference,
} from "@/lib/filters/parse-tables";

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

  test("does not treat EXTRACT(... FROM ...) as base FROM clause", () => {
    const sql = `
      SELECT
        EXTRACT(YEAR FROM "Date Joined") AS year,
        COUNT(*) AS unicorn_count
      FROM unicorns
      WHERE Country = 'China'
      GROUP BY EXTRACT(YEAR FROM "Date Joined")
    `;

    const base = findBaseTableReference(sql);
    expect(base?.tableName).toBe("unicorns");
  });

  test("finds outer FROM when query uses CTE and subquery", () => {
    const sql = `
      WITH yearly AS (
        SELECT u."Country", EXTRACT(YEAR FROM u."Date Joined") AS joined_year
        FROM unicorns u
      )
      SELECT joined_year, COUNT(*)
      FROM yearly
      GROUP BY joined_year
    `;

    const base = findBaseTableReference(sql);
    expect(base?.tableName).toBe("yearly");
  });

  test("extracts table names from nested subqueries without function false positives", () => {
    const sql = `
      SELECT *
      FROM (
        SELECT EXTRACT(YEAR FROM o.created_at) AS yr, o.customer_id
        FROM "main"."orders" o
      ) sq
      JOIN customers c ON c.id = sq.customer_id
    `;

    const tables = extractTableNamesFromSql(sql);
    expect(tables).toEqual(["orders", "customers"]);
  });
});
