import { describe, expect, test } from "bun:test";
import {
  filterQueryRows,
  formatQueryCell,
  nextQuerySort,
  parseQueryResultPayload,
  sortQueryRows,
} from "./query-results-model";

const columns = [
  { name: "city", type: "VARCHAR" },
  { name: "revenue", type: "DOUBLE" },
];
const rows = [
  { city: "Utrecht", revenue: 12 },
  { city: "Amsterdam", revenue: 30 },
  { city: "Rotterdam", revenue: null },
];

describe("MCP App query result model", () => {
  test("parses a valid structured query result", () => {
    expect(
      parseQueryResultPayload({
        columns,
        rows,
        rowCount: 12,
        rowsChanged: 0,
        sql: "SELECT city, revenue FROM sales",
      }),
    ).toEqual({
      ok: true,
      value: {
        columns,
        rows,
        rowCount: 12,
        rowsChanged: 0,
        sql: "SELECT city, revenue FROM sales",
      },
    });
  });

  test("uses the returned row length when rowCount is absent", () => {
    expect(parseQueryResultPayload({ columns, rows })).toMatchObject({
      ok: true,
      value: { rowCount: 3 },
    });
  });

  test("rejects malformed structured results", () => {
    expect(parseQueryResultPayload(null)).toMatchObject({ ok: false });
    expect(parseQueryResultPayload({ columns: [], rows: ["bad"] })).toEqual({
      ok: false,
      error: "The query returned an invalid row.",
    });
  });

  test("filters across visible columns", () => {
    expect(filterQueryRows(rows, columns, "dam")).toEqual([
      { city: "Amsterdam", revenue: 30 },
      { city: "Rotterdam", revenue: null },
    ]);
    expect(filterQueryRows(rows, columns, "30")).toEqual([
      { city: "Amsterdam", revenue: 30 },
    ]);
  });

  test("sorts values stably in both directions", () => {
    expect(
      sortQueryRows(rows, {
        column: "revenue",
        direction: "ascending",
      }).map((row) => row.city),
    ).toEqual(["Utrecht", "Amsterdam", "Rotterdam"]);
    expect(
      sortQueryRows(rows, {
        column: "city",
        direction: "descending",
      }).map((row) => row.city),
    ).toEqual(["Utrecht", "Rotterdam", "Amsterdam"]);
  });

  test("cycles a column through ascending, descending, and unsorted", () => {
    const ascending = nextQuerySort(null, "city");
    const descending = nextQuerySort(ascending, "city");

    expect(ascending).toEqual({ column: "city", direction: "ascending" });
    expect(descending).toEqual({ column: "city", direction: "descending" });
    expect(nextQuerySort(descending, "city")).toBeNull();
    expect(nextQuerySort(descending, "revenue")).toEqual({
      column: "revenue",
      direction: "ascending",
    });
  });

  test("formats null and structured values safely", () => {
    expect(formatQueryCell(null)).toBe("—");
    expect(formatQueryCell({ active: true })).toBe('{"active":true}');
  });
});
