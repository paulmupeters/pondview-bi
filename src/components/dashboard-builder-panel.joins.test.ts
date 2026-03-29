import { describe, expect, test } from "bun:test";
import {
  createEmptyJoinDraftGroup,
  extractDetectedJoinTables,
  flattenJoinDraftGroups,
  seedJoinDraftGroups,
} from "@/components/dashboard-builder-panel.joins";

describe("dashboard-builder-panel join helpers", () => {
  test("detects distinct canonical tables from selected visual SQL", () => {
    const detected = extractDetectedJoinTables([
      `SELECT * FROM "main"."orders" o JOIN "analytics"."items" i ON o.id = i.order_id`,
      `SELECT customer_id, SUM(amount) FROM orders GROUP BY customer_id`,
    ]);

    expect(detected).toEqual([
      {
        tableName: "items",
        rawReference: '"analytics"."items"',
        label: '"analytics"."items"',
      },
      {
        tableName: "orders",
        rawReference: '"main"."orders"',
        label: '"main"."orders"',
      },
    ]);
  });

  test("seeds join groups only for detected tables", () => {
    const groups = seedJoinDraftGroups(
      [
        {
          tableName: "customers",
          rawReference: '"customers"',
          label: '"customers"',
        },
        {
          tableName: "orders",
          rawReference: '"orders"',
          label: '"orders"',
        },
      ],
      [
        {
          leftTable: "orders",
          leftColumn: "customer_id",
          rightTable: "customers",
          rightColumn: "id",
          type: "left",
        },
        {
          leftTable: "orders",
          leftColumn: "account_id",
          rightTable: "customers",
          rightColumn: "account_id",
          type: "left",
        },
        {
          leftTable: "orders",
          leftColumn: "product_id",
          rightTable: "products",
          rightColumn: "id",
          type: "left",
        },
      ],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.leftTable).toBe("orders");
    expect(groups[0]?.rightTable).toBe("customers");
    expect(
      groups[0]?.clauses.map((clause) => [
        clause.leftColumn,
        clause.rightColumn,
      ]),
    ).toEqual([
      ["customer_id", "id"],
      ["account_id", "account_id"],
    ]);
  });

  test("flattens repeatable join clauses into join definitions", () => {
    const group = createEmptyJoinDraftGroup({
      leftTable: "orders",
      rightTable: "customers",
      type: "inner",
    });
    group.clauses = [
      {
        id: "clause-1",
        leftColumn: "customer_id",
        rightColumn: "id",
      },
      {
        id: "clause-2",
        leftColumn: "account_id",
        rightColumn: "account_id",
      },
      {
        id: "clause-3",
        leftColumn: "",
        rightColumn: "ignored",
      },
    ];

    expect(flattenJoinDraftGroups([group])).toEqual([
      {
        leftTable: "orders",
        leftColumn: "customer_id",
        rightTable: "customers",
        rightColumn: "id",
        type: "inner",
      },
      {
        leftTable: "orders",
        leftColumn: "account_id",
        rightTable: "customers",
        rightColumn: "account_id",
        type: "inner",
      },
    ]);
  });
});
