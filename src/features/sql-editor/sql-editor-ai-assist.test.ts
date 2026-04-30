import { describe, expect, test } from "bun:test";
import {
  buildSqlEditorAssistPrompt,
  buildSqlEditorResultContext,
  extractSqlSuggestion,
  isReadOnlySelectSql,
} from "@/features/sql-editor/sql-editor-ai-assist";

describe("SQL editor AI assist helpers", () => {
  test("builds a bounded result context from the current result", () => {
    const context = buildSqlEditorResultContext(
      {
        sql: "select * from orders",
        columns: [{ name: "id", type: "INTEGER" }],
        rows: Array.from({ length: 25 }, (_, index) => ({ id: index + 1 })),
        durationMs: 12,
        backend: "duckdb-wasm",
        dbIdentifier: "wasm:local",
        catalogContext: "main",
      },
      3,
    );

    expect(context).toEqual({
      sql: "select * from orders",
      columns: [{ name: "id", type: "INTEGER" }],
      rowCount: 25,
      durationMs: 12,
      sampleRows: [{ id: 1 }, { id: 2 }, { id: 3 }],
      omittedRowCount: 22,
      backend: "duckdb-wasm",
      dbIdentifier: "wasm:local",
      catalogContext: "main",
    });
  });

  test("includes latest error and read-only safety instructions in fix prompts", () => {
    const prompt = buildSqlEditorAssistPrompt({
      action: "fix",
      customPrompt: "make it work",
      currentSql: "select missing from orders",
      selectedDb: "warehouse",
      selectedCatalogContext: "analytics",
      queryNotice: {
        kind: "error",
        message: "Referenced column missing not found",
      },
      resultContext: null,
    });

    expect(prompt).toContain("Action: fix");
    expect(prompt).toContain("Only suggest read-only SELECT SQL");
    expect(prompt).toContain("Referenced column missing not found");
    expect(prompt).toContain("```sql\nselect missing from orders\n```");
  });

  test("extracts read-only SQL suggestions from fenced assistant output", () => {
    expect(
      extractSqlSuggestion(
        "Try this:\n```sql\nSELECT id, total FROM orders LIMIT 20;\n```\nThen run it.",
      ),
    ).toBe("SELECT id, total FROM orders LIMIT 20;");
  });

  test("rejects mutating SQL suggestions", () => {
    expect(isReadOnlySelectSql("CREATE TABLE x AS SELECT 1")).toBe(false);
    expect(extractSqlSuggestion("```sql\nDROP TABLE orders;\n```")).toBeNull();
  });

  test("allows common read-only query shapes", () => {
    expect(isReadOnlySelectSql("-- report\nSELECT * FROM orders")).toBe(true);
    expect(
      isReadOnlySelectSql(
        "WITH recent AS (SELECT * FROM orders) SELECT * FROM recent",
      ),
    ).toBe(true);
  });
});
