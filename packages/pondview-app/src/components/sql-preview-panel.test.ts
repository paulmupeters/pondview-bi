import { describe, expect, test } from "bun:test";
import { insertSqlTextAtSelection } from "@/components/sql-preview-panel";

describe("insertSqlTextAtSelection", () => {
  test("inserts text into an empty query", () => {
    expect(
      insertSqlTextAtSelection({
        value: "",
        text: "orders",
        selectionStart: 0,
        selectionEnd: 0,
      }),
    ).toEqual({
      value: "orders",
      selectionStart: 6,
      selectionEnd: 6,
    });
  });

  test("appends with a single separating space when needed", () => {
    expect(
      insertSqlTextAtSelection({
        value: "SELECT * FROM",
        text: "orders",
      }),
    ).toEqual({
      value: "SELECT * FROM orders",
      selectionStart: 20,
      selectionEnd: 20,
    });
  });

  test("replaces the current selection", () => {
    expect(
      insertSqlTextAtSelection({
        value: "SELECT * FROM temp_table",
        text: "orders",
        selectionStart: 14,
        selectionEnd: 24,
      }),
    ).toEqual({
      value: "SELECT * FROM orders",
      selectionStart: 20,
      selectionEnd: 20,
    });
  });

  test("returns the caret immediately after the inserted text", () => {
    const result = insertSqlTextAtSelection({
      value: "SELECT  FROM orders",
      text: "count(*)",
      selectionStart: 7,
      selectionEnd: 7,
    });

    expect(result.value).toBe("SELECT count(*) FROM orders");
    expect(result.selectionStart).toBe(15);
    expect(result.selectionEnd).toBe(15);
  });
});
