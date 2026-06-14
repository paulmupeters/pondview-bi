import { describe, expect, test } from "bun:test";
import { applyFiltersToSql } from "@/lib/filters/apply-filters";
import type { JoinDefinition } from "@/lib/joins/graph";
import type { Filter } from "@/lib/types/filters";

describe("applyFiltersToSql", () => {
  test("applies same-table filters via materialized CTE", () => {
    const sql =
      "SELECT Country, COUNT(*) AS count FROM unicorns GROUP BY Country";
    const filters: Filter[] = [
      {
        field: "unicorns.Industry",
        op: "eq",
        values: ["Fintech"],
      },
    ];

    const result = applyFiltersToSql(sql, filters, []);

    expect(result.appliedFilters).toBe(1);
    expect(result.skippedFilters.length).toBe(0);
    expect(result.sql).toContain('WITH "__filtered_base" AS (');
    expect(result.sql).toContain('FROM "mat"."unicorns" AS b');
    expect(result.sql).toContain(`WHERE b."Industry" = 'Fintech'`);
    expect(result.sql).toContain('FROM "__filtered_base"');
  });

  test("applies cross-table filters using join paths", () => {
    const sql =
      "SELECT customer_id, SUM(amount) FROM orders GROUP BY customer_id";
    const filters: Filter[] = [
      {
        field: "customers.segment",
        op: "eq",
        values: ["Enterprise"],
      },
    ];
    const joins: JoinDefinition[] = [
      {
        leftTable: "orders",
        leftColumn: "customer_id",
        rightTable: "customers",
        rightColumn: "id",
        type: "left",
      },
    ];

    const result = applyFiltersToSql(sql, filters, joins);

    expect(result.appliedFilters).toBe(1);
    expect(result.skippedFilters.length).toBe(0);
    expect(result.sql).toContain('LEFT JOIN "mat"."customers" AS j1');
    expect(result.sql).toContain('ON b."customer_id" = j1."id"');
    expect(result.sql).toContain(`WHERE j1."segment" = 'Enterprise'`);
  });

  test("uses injected table references when provided", () => {
    const sql =
      "SELECT Country, COUNT(*) AS count FROM unicorns GROUP BY Country";
    const filters: Filter[] = [
      {
        field: "unicorns.Industry",
        op: "eq",
        values: ["Fintech"],
      },
    ];

    const result = applyFiltersToSql(sql, filters, [], {
      tableReferences: {
        unicorns: '"main"."unicorns"',
      },
    });

    expect(result.appliedFilters).toBe(1);
    expect(result.sql).toContain('FROM "main"."unicorns" AS b');
    expect(result.sql).not.toContain('FROM "mat"."unicorns" AS b');
  });

  test("reports skipped filters when no join path exists", () => {
    const sql = "SELECT country, COUNT(*) FROM orders GROUP BY country";
    const filters: Filter[] = [
      {
        field: "accounts.tier",
        op: "eq",
        values: ["pro"],
      },
    ];

    const result = applyFiltersToSql(sql, filters, []);

    expect(result.appliedFilters).toBe(0);
    expect(result.skippedFilters.length).toBe(1);
    expect(result.sql).toBe(sql);
  });
});
