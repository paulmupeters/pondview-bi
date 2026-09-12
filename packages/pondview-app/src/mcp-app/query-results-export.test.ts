import { describe, expect, test } from "bun:test";
import {
  createQueryExport,
  serializeQueryCsv,
  serializeQueryJson,
} from "./query-results-export";

const columns = [{ name: "city" }, { name: "note" }, { name: "revenue" }];
const rows = [
  { city: "Amsterdam", note: 'North, "priority"', revenue: 30 },
  { city: "Utrecht", note: "=SUM(A1:A2)", revenue: null },
];

describe("MCP App query exports", () => {
  test("serializes RFC-style CSV and neutralizes spreadsheet formulas", () => {
    expect(serializeQueryCsv(columns, rows)).toBe(
      'city,note,revenue\r\nAmsterdam,"North, ""priority""",30\r\nUtrecht,\'=SUM(A1:A2),\r\n',
    );
  });

  test("serializes only the selected columns to JSON", () => {
    expect(serializeQueryJson(columns, rows)).toBe(
      JSON.stringify(rows, null, 2),
    );
  });

  test("provides stable filenames and MIME types", () => {
    expect(createQueryExport("csv", columns, rows)).toMatchObject({
      filename: "pondview-query-results.csv",
      mimeType: "text/csv;charset=utf-8",
    });
    expect(createQueryExport("json", columns, rows)).toMatchObject({
      filename: "pondview-query-results.json",
      mimeType: "application/json",
    });
  });
});
