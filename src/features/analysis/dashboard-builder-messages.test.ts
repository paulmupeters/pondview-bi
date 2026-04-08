import { describe, expect, test } from "bun:test";
import { buildDashboardBuilderMessages } from "@/features/analysis/dashboard-builder-messages";

describe("buildDashboardBuilderMessages", () => {
  test("includes synthetic execute-sql messages for sql cell result payloads", () => {
    const messages = buildDashboardBuilderMessages({
      cells: [
        {
          id: "ai-cell",
          notebookId: "notebook-1",
          position: 0,
          kind: "ai",
          aiEnabled: true,
          sqlEnabled: false,
          promptText: "show me revenue",
          sqlDraft: null,
          selectedDbIdentifier: null,
          selectedCatalogContext: null,
          status: "complete",
          resultPayloadJson: null,
          createdAt: 10,
          updatedAt: 20,
          lastRunAt: null,
        },
        {
          id: "sql-cell",
          notebookId: "notebook-1",
          position: 1,
          kind: "sql",
          aiEnabled: false,
          sqlEnabled: true,
          promptText: "",
          sqlDraft: "select count(*) as total from orders",
          selectedDbIdentifier: "warehouse",
          selectedCatalogContext: "sales",
          status: "complete",
          resultPayloadJson: JSON.stringify({
            stage: "complete",
            progress: 1,
            query: "select count(*) as total from orders",
            dbIdentifier: "warehouse",
            rowCount: 1,
            executionTime: 12,
            columns: [{ name: "total", type: "INTEGER" }],
            rows: [{ total: 42 }],
            visualType: "card",
            summary: {
              totalRows: 1,
              executionTimeMs: 12,
              insights: [],
            },
          }),
          createdAt: 30,
          updatedAt: 40,
          lastRunAt: 50,
        },
      ],
      cellEntriesByCellId: new Map([
        [
          "ai-cell",
          [
            {
              id: "entry-1",
              notebookId: "notebook-1",
              cellId: "ai-cell",
              order: 0,
              role: "assistant",
              partsJson: JSON.stringify([
                {
                  type: "text",
                  text: "Here is your analysis",
                },
              ]),
              createdAt: 25,
            },
          ],
        ],
      ]),
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "entry-1",
      role: "assistant",
    });
    expect(messages[1]).toMatchObject({
      id: "sql-result-sql-cell",
      role: "assistant",
      parts: [
        {
          type: "data-execute-sql",
          data: {
            id: "sql-result-sql-cell",
            type: "execute-sql",
            status: "complete",
            version: 1,
            createdAt: 50,
            updatedAt: 40,
            payload: {
              query: "select count(*) as total from orders",
              dbIdentifier: "warehouse",
              visualType: "card",
            },
          },
        },
      ],
    });
  });

  test("skips sql cells with invalid payload json", () => {
    const messages = buildDashboardBuilderMessages({
      cells: [
        {
          id: "sql-cell",
          notebookId: "notebook-1",
          position: 0,
          kind: "sql",
          aiEnabled: false,
          sqlEnabled: true,
          promptText: "",
          sqlDraft: "select 1",
          selectedDbIdentifier: null,
          selectedCatalogContext: null,
          status: "error",
          resultPayloadJson: "{not valid json}",
          createdAt: 10,
          updatedAt: 20,
          lastRunAt: null,
        },
      ],
      cellEntriesByCellId: new Map(),
    });

    expect(messages).toEqual([]);
  });
});
