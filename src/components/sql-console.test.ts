import { describe, expect, test } from "bun:test";
import {
  buildSqlAutocompleteQuery,
  createSqlAutocompleteAction,
  parseSqlAutocompleteSuggestion,
} from "@/components/sql-console";

describe("sql autocomplete query helpers", () => {
  test("builds the sql_auto_complete query with escaped input", () => {
    expect(buildSqlAutocompleteQuery("SEL'O")).toBe(
      "SELECT suggestion, suggestion_start FROM sql_auto_complete('SEL''O') LIMIT 1;",
    );
  });

  test("parses the first autocomplete row", () => {
    expect(
      parseSqlAutocompleteSuggestion({
        suggestion: "SELECT ",
        suggestion_start: "0",
      }),
    ).toEqual({
      suggestion: "SELECT ",
      suggestionStart: 0,
    });
  });

  test("returns null for invalid autocomplete rows", () => {
    expect(
      parseSqlAutocompleteSuggestion({
        suggestion: 42,
        suggestion_start: "bad",
      }),
    ).toBeNull();
  });
});

describe("createSqlAutocompleteAction", () => {
  test("loads the extension and returns the first suggestion", async () => {
    const calls: string[] = [];
    const autocompleteAction = createSqlAutocompleteAction(
      {
        dbIdentifier: "wasm:local",
        catalogContext: "warehouse",
      },
      {
        runSqlQuery: async ({ sql }) => {
          calls.push(sql);
          if (sql === "LOAD autocomplete;") {
            return {
              rows: [],
              columns: [],
              durationMs: 0,
              backend: "duckdb-wasm",
            };
          }

          return {
            rows: [{ suggestion: "SELECT ", suggestion_start: 0 }],
            columns: [],
            durationMs: 0,
            backend: "duckdb-wasm",
          };
        },
      },
    );

    await expect(
      autocompleteAction({
        sql: "SEL",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      suggestion: "SELECT ",
      suggestionStart: 0,
    });

    expect(calls).toEqual([
      "LOAD autocomplete;",
      "SELECT suggestion, suggestion_start FROM sql_auto_complete('SEL') LIMIT 1;",
    ]);
  });

  test("returns null when no autocomplete row is returned", async () => {
    const autocompleteAction = createSqlAutocompleteAction(
      {},
      {
        runSqlQuery: async ({ sql }) => ({
          rows: sql === "LOAD autocomplete;" ? [] : [],
          columns: [],
          durationMs: 0,
          backend: "duckdb-wasm",
        }),
      },
    );

    await expect(
      autocompleteAction({
        sql: "SEL",
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();
  });

  test("swallows errors and disables further attempts after the first failure", async () => {
    const calls: string[] = [];
    const autocompleteAction = createSqlAutocompleteAction(
      {},
      {
        runSqlQuery: async ({ sql }) => {
          calls.push(sql);
          throw new Error("autocomplete unavailable");
        },
      },
    );

    await expect(
      autocompleteAction({
        sql: "SEL",
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();

    await expect(
      autocompleteAction({
        sql: "SELE",
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();

    expect(calls).toEqual(["LOAD autocomplete;"]);
  });
});
