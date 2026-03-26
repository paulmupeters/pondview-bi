import { describe, expect, test } from "bun:test";
import { createDuckdbReplAutocompleteAction } from "@/components/duckdb-shell/repl";
import type { ConnectedTable } from "@/lib/connected-tables";

describe("createDuckdbReplAutocompleteAction", () => {
  test("delegates to the shared autocomplete action when no external source is attached", async () => {
    const calls: Array<{
      dbIdentifier?: string;
      catalogContext?: string | null;
    }> = [];
    const delegatedResult = {
      suggestion: "SELECT ",
      suggestionStart: 0,
    };
    const autocompleteAction = createDuckdbReplAutocompleteAction(
      {
        effectiveSqlBackend: "duckdb-wasm",
        selectedDb: "wasm:local",
        catalogContext: "warehouse",
      },
      {
        createSharedAutocompleteAction: (options) => {
          calls.push({
            dbIdentifier: options.dbIdentifier,
            catalogContext: options.catalogContext,
          });
          return async () => delegatedResult;
        },
      },
    );

    await expect(
      autocompleteAction({
        sql: "SEL",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(delegatedResult);

    expect(calls).toEqual([
      {
        dbIdentifier: "wasm:local",
        catalogContext: "warehouse",
      },
    ]);
  });

  test("runs attached-source autocomplete through the attach and detach lifecycle", async () => {
    const statements: string[] = [];
    const connectedEntry: ConnectedTable = {
      type: "postgres",
      databasePath: "postgres://warehouse",
      table: "orders",
      attachAs: "warehouse",
      duckdbExtension: "postgres",
    };

    const autocompleteAction = createDuckdbReplAutocompleteAction(
      {
        connectedEntry,
        effectiveSqlBackend: "bridge",
      },
      {
        runBridgeSql: async (sql) => {
          statements.push(sql);
          if (sql.includes("current_catalog()")) {
            return {
              rows: [{ current_catalog: "duckdb" }],
              columns: [],
              durationMs: 0,
            };
          }

          if (sql.includes("sql_auto_complete")) {
            return {
              rows: [{ suggestion: "SELECT ", suggestion_start: 0 }],
              columns: [],
              durationMs: 0,
            };
          }

          return {
            rows: [],
            columns: [],
            durationMs: 0,
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

    expect(statements).toEqual([
      "INSTALL postgres;",
      "LOAD postgres;",
      `ATTACH 'postgres://warehouse' AS "warehouse" (TYPE postgres);`,
      "LOAD autocomplete;",
      "SELECT current_catalog() AS current_catalog;",
      'USE "warehouse";',
      "SELECT suggestion, suggestion_start FROM sql_auto_complete('SEL') LIMIT 1;",
      'USE "duckdb";',
      'DETACH DATABASE IF EXISTS "warehouse";',
    ]);
  });

  test("disables further retries after an attached-source autocomplete failure", async () => {
    const statements: string[] = [];
    const autocompleteAction = createDuckdbReplAutocompleteAction(
      {
        connectedEntry: {
          type: "postgres",
          databasePath: "postgres://warehouse",
          table: "orders",
          attachAs: "warehouse",
        },
        effectiveSqlBackend: "bridge",
      },
      {
        runBridgeSql: async (sql) => {
          statements.push(sql);
          throw new Error("bridge offline");
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

    expect(statements).toEqual([
      "INSTALL postgres;",
      'DETACH DATABASE IF EXISTS "warehouse";',
    ]);
  });
});
