import { describe, expect, test } from "bun:test";
import {
  applySqlAutocompleteSuggestion,
  createSqlCodeEditorKeyBindings,
  resolveSqlAutocompleteSuggestion,
  shouldRequestSqlAutocomplete,
} from "@/components/sql-code-editor";

describe("createSqlCodeEditorKeyBindings", () => {
  test("uses Shift+Enter to run queries", () => {
    const bindings = createSqlCodeEditorKeyBindings({
      onRunQuery: () => {},
    });

    expect(bindings.map((binding) => binding.key)).toContain("Tab");
    expect(bindings.map((binding) => binding.key)).toContain("Shift-Enter");
    expect(bindings.map((binding) => binding.key)).not.toContain("Enter");
  });

  test("keeps navigation and escape bindings when handlers are present", () => {
    const bindings = createSqlCodeEditorKeyBindings({
      onCancel: () => {},
      onHistoryPrev: () => {},
      onHistoryNext: () => {},
    });

    expect(bindings.map((binding) => binding.key)).toEqual([
      "Tab",
      "Escape",
      "ArrowUp",
      "ArrowDown",
    ]);
  });
});

describe("sql autocomplete helpers", () => {
  test("only requests autocomplete at the end of the buffer", () => {
    expect(
      shouldRequestSqlAutocomplete({
        sql: "SEL",
        selectionFrom: 3,
        selectionTo: 3,
        docLength: 3,
      }),
    ).toBe(true);

    expect(
      shouldRequestSqlAutocomplete({
        sql: "SEL",
        selectionFrom: 2,
        selectionTo: 2,
        docLength: 3,
      }),
    ).toBe(false);
  });

  test("does not request autocomplete for empty SQL or active selections", () => {
    expect(
      shouldRequestSqlAutocomplete({
        sql: "   ",
        selectionFrom: 0,
        selectionTo: 0,
        docLength: 3,
      }),
    ).toBe(false);

    expect(
      shouldRequestSqlAutocomplete({
        sql: "SELECT",
        selectionFrom: 1,
        selectionTo: 3,
        docLength: 6,
      }),
    ).toBe(false);
  });

  test("resolves a ghost suffix from DuckDB autocomplete output", () => {
    expect(
      resolveSqlAutocompleteSuggestion({
        sql: "SEL",
        suggestion: {
          suggestion: "SELECT ",
          suggestionStart: 0,
        },
      }),
    ).toEqual({
      suggestion: "SELECT ",
      suggestionStart: 0,
      from: 3,
      to: 3,
      suffix: "ECT ",
    });
  });

  test("rejects suggestions that do not extend the current tail", () => {
    expect(
      resolveSqlAutocompleteSuggestion({
        sql: "SEL",
        suggestion: {
          suggestion: "FROM ",
          suggestionStart: 0,
        },
      }),
    ).toBeNull();
  });

  test("rejects empty autocomplete suffixes", () => {
    expect(
      resolveSqlAutocompleteSuggestion({
        sql: "SELECT ",
        suggestion: {
          suggestion: "SELECT ",
          suggestionStart: 0,
        },
      }),
    ).toBeNull();
  });

  test("applies the accepted autocomplete suggestion to the end of the buffer", () => {
    const suggestion = resolveSqlAutocompleteSuggestion({
      sql: "SEL",
      suggestion: {
        suggestion: "SELECT ",
        suggestionStart: 0,
      },
    });

    expect(
      applySqlAutocompleteSuggestion({
        sql: "SEL",
        suggestion,
      }),
    ).toEqual({
      value: "SELECT ",
      selectionStart: 7,
      selectionEnd: 7,
    });
  });

  test("replaces from suggestion_start through the document end when accepting", () => {
    const suggestion = resolveSqlAutocompleteSuggestion({
      sql: "SELECT * FR",
      suggestion: {
        suggestion: "FROM ",
        suggestionStart: 9,
      },
    });

    expect(
      applySqlAutocompleteSuggestion({
        sql: "SELECT * FR",
        suggestion,
      }),
    ).toEqual({
      value: "SELECT * FROM ",
      selectionStart: 14,
      selectionEnd: 14,
    });
  });
});
