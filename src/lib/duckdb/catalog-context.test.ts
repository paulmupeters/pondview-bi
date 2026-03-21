import { describe, expect, test } from "bun:test";
import {
  buildUseCatalogStatement,
  resolveCurrentCatalog,
  runWithCatalogContext,
} from "@/lib/duckdb/catalog-context";

describe("buildUseCatalogStatement", () => {
  test("quotes the selected catalog", () => {
    expect(buildUseCatalogStatement('mother"duck')).toBe('USE "mother""duck";');
  });
});

describe("resolveCurrentCatalog", () => {
  test("falls back from current_catalog to current_database", async () => {
    const receivedSql: string[] = [];
    const currentCatalog = await resolveCurrentCatalog(async (sql) => {
      receivedSql.push(sql);
      if (sql.includes("current_catalog()")) {
        throw new Error("not supported");
      }
      return {
        rows: [{ current_catalog: "duck" }],
        columns: [],
        durationMs: 0,
        backend: "duckdb-http" as const,
      };
    });

    expect(currentCatalog).toBe("duck");
    expect(receivedSql).toEqual([
      "SELECT current_catalog() AS current_catalog;",
      "SELECT current_database() AS current_catalog;",
    ]);
  });
});

describe("runWithCatalogContext", () => {
  test("wraps the query with USE and restores the previous catalog", async () => {
    const receivedSql: string[] = [];

    const result = await runWithCatalogContext({
      sql: "SELECT * FROM main.unicorns;",
      selectedCatalog: "motherduck",
      currentCatalog: "duck",
      runQuery: async (sql) => {
        receivedSql.push(sql);
        return {
          rows: sql.startsWith("SELECT") ? [{ company: "Stripe" }] : [],
          columns: [],
          durationMs: 0,
          backend: "duckdb-http" as const,
        };
      },
    });

    expect(receivedSql).toEqual([
      'USE "motherduck";',
      "SELECT * FROM main.unicorns;",
      'USE "duck";',
    ]);
    expect(result.rows).toEqual([{ company: "Stripe" }]);
  });

  test("runs the query as-is when there is no current catalog to restore", async () => {
    const receivedSql: string[] = [];

    await runWithCatalogContext({
      sql: "SELECT * FROM main.unicorns;",
      selectedCatalog: "motherduck",
      currentCatalog: null,
      runQuery: async (sql) => {
        receivedSql.push(sql);
        return {
          rows: [],
          columns: [],
          durationMs: 0,
          backend: "duckdb-http" as const,
        };
      },
    });

    expect(receivedSql).toEqual(["SELECT * FROM main.unicorns;"]);
  });
});
