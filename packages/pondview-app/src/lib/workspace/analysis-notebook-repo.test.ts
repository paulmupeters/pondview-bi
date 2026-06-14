import { describe, expect, test } from "bun:test";
import { migrateLegacyChatsToNotebooks } from "@/lib/workspace/analysis-notebook-repo";
import { validateWorkspaceImport } from "@/lib/workspace/export-import";
import type {
  WorkspaceChat,
  WorkspaceExportV2,
  WorkspaceMessage,
} from "@/lib/workspace/workspace-db";

function buildSqlArtifactPart(input: {
  query: string;
  createdAt: number;
  updatedAt: number;
  dbIdentifier?: string;
  catalogContext?: string | null;
}) {
  return {
    type: "tool-execute_sql",
    toolCallId: `tool-${input.createdAt}`,
    state: "output-available",
    output: {
      parts: [
        {
          type: "data-execute-sql",
          data: {
            id: `artifact-${input.createdAt}`,
            version: 1,
            status: "complete",
            createdAt: input.createdAt,
            updatedAt: input.updatedAt,
            payload: {
              query: input.query,
              dbIdentifier: input.dbIdentifier,
              catalogContext: input.catalogContext,
              visualType: "table",
              rows: [{ value: 1 }],
              summary: {
                totalRows: 1,
                executionTimeMs: 12,
                insights: ["ok"],
                queryType: "SELECT",
              },
            },
          },
        },
      ],
    },
  };
}

describe("analysis notebook migration", () => {
  test("migrates legacy chats into notebooks, ordered cells, and transcript entries", () => {
    const chats: WorkspaceChat[] = [
      {
        id: "chat-1",
        title: "Revenue analysis",
        userId: null,
        createdAt: 10,
        updatedAt: 40,
      },
    ];

    const messages: WorkspaceMessage[] = [
      {
        id: "user-1",
        chatId: "chat-1",
        role: "user",
        content: "Show me revenue by month",
        parts: null,
        createdAt: 11,
      },
      {
        id: "assistant-1",
        chatId: "chat-1",
        role: "assistant",
        content: "Running SQL",
        parts: JSON.stringify([
          { type: "text", text: "Running SQL" },
          buildSqlArtifactPart({
            query: "select month, revenue from monthly_revenue",
            dbIdentifier: "analytics.duckdb",
            catalogContext: "main",
            createdAt: 12,
            updatedAt: 14,
          }),
        ]),
        createdAt: 12,
      },
      {
        id: "user-2",
        chatId: "chat-1",
        role: "user",
        content: "Now break it down by region",
        parts: null,
        createdAt: 30,
      },
      {
        id: "assistant-2",
        chatId: "chat-1",
        role: "assistant",
        content: "That failed",
        parts: JSON.stringify([
          { type: "text", text: "That failed" },
          {
            type: "tool-execute_sql",
            toolCallId: "tool-2",
            state: "output-error",
            errorText: "Binder error",
          },
        ]),
        createdAt: 31,
      },
    ];

    const migrated = migrateLegacyChatsToNotebooks({ chats, messages });

    expect(migrated.notebooks).toEqual([
      {
        id: "chat-1",
        title: "Revenue analysis",
        createdAt: 10,
        updatedAt: 40,
      },
    ]);
    expect(migrated.analysisCells).toHaveLength(2);
    expect(migrated.analysisCells[0]).toMatchObject({
      id: "user-1",
      notebookId: "chat-1",
      position: 0,
      promptText: "Show me revenue by month",
      sqlDraft: "select month, revenue from monthly_revenue",
      selectedDbIdentifier: "analytics.duckdb",
      selectedCatalogContext: "main",
      status: "complete",
      lastRunAt: 14,
    });
    expect(
      JSON.parse(migrated.analysisCells[0].resultPayloadJson ?? "{}"),
    ).toMatchObject({
      query: "select month, revenue from monthly_revenue",
    });
    expect(migrated.analysisCells[1]).toMatchObject({
      id: "user-2",
      notebookId: "chat-1",
      position: 1,
      promptText: "Now break it down by region",
      status: "error",
    });
    expect(migrated.analysisCellEntries).toHaveLength(2);
    expect(migrated.analysisCellEntries.map((entry) => entry.cellId)).toEqual([
      "user-1",
      "user-2",
    ]);
  });

  test("creates a synthetic first cell when a legacy thread starts with assistant content", () => {
    const chats: WorkspaceChat[] = [
      {
        id: "chat-2",
        title: null,
        userId: null,
        createdAt: 1,
        updatedAt: 3,
      },
    ];
    const messages: WorkspaceMessage[] = [
      {
        id: "assistant-boot",
        chatId: "chat-2",
        role: "assistant",
        content: "Welcome",
        parts: JSON.stringify([{ type: "text", text: "Welcome" }]),
        createdAt: 2,
      },
      {
        id: "user-later",
        chatId: "chat-2",
        role: "user",
        content: "Actual first prompt",
        parts: null,
        createdAt: 3,
      },
    ];

    const migrated = migrateLegacyChatsToNotebooks({ chats, messages });

    expect(migrated.analysisCells).toHaveLength(2);
    expect(migrated.analysisCells[0]).toMatchObject({
      id: "chat-2::cell:0",
      notebookId: "chat-2",
      position: 0,
      promptText: "",
    });
    expect(migrated.analysisCells[1]).toMatchObject({
      id: "user-later",
      notebookId: "chat-2",
      position: 1,
      promptText: "Actual first prompt",
    });
    expect(migrated.analysisCellEntries[0]).toMatchObject({
      id: "assistant-boot",
      cellId: "chat-2::cell:0",
      role: "assistant",
    });
  });

  test("normalizes v2 exports to v3 notebook-aware payloads", () => {
    const payload: WorkspaceExportV2 = {
      version: 2,
      exportedAt: "2026-03-31T10:00:00.000Z",
      chats: [],
      messages: [],
      dashboards: [],
      charts: [],
      dashboardMeasures: [],
      dashboardSlicers: [],
      chartSlicers: [],
      preferences: [],
    };

    expect(validateWorkspaceImport(payload)).toEqual({
      ...payload,
      version: 3,
      notebooks: [],
      analysisCells: [],
      analysisCellEntries: [],
    });
  });
});
