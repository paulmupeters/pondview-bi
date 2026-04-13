import { describe, expect, test } from "bun:test";
import type { UIMessage } from "@ai-sdk/react";
import {
  buildAiCellPrompt,
  buildAiCellUpdatePatch,
  buildTranscriptMessageBlocks,
  getLatestAssistantText,
  getMessageText,
} from "@/features/analysis/ai-cell-message-utils";

describe("ai cell message utils", () => {
  test("builds a raw prompt when the cell has no existing sql context", () => {
    expect(
      buildAiCellPrompt({
        prompt: "Show weekly revenue",
      }),
    ).toBe("Show weekly revenue");
  });

  test("injects current cell context into the submitted AI prompt", () => {
    expect(
      buildAiCellPrompt({
        prompt: "Turn this into a chart",
        sqlDraft: "select week, revenue from metrics",
        selectedDbIdentifier: "warehouse",
        selectedCatalogContext: "finance",
        resultPayload: {
          visualType: "table",
          rowCount: 10,
        },
      }),
    ).toContain("Current cell SQL");
  });

  test("updates the shared cell payload from a final sql artifact", () => {
    const patch = buildAiCellUpdatePatch({
      message: {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-execute_final_sql",
            output: {
              parts: [
                {
                  type: "data-execute-sql",
                  data: {
                    status: "complete",
                    payload: {
                      query: "select 1",
                      visualType: "card",
                      dbIdentifier: "warehouse",
                    },
                  },
                },
              ],
            },
          },
        ],
      } as unknown as UIMessage,
      createdAt: 42,
      selectedDbIdentifier: "fallback-db",
      selectedCatalogContext: "finance",
    });

    expect(patch).toMatchObject({
      status: "complete",
      sqlDraft: "select 1",
      resultPayloadJson: JSON.stringify({
        query: "select 1",
        visualType: "card",
        dbIdentifier: "warehouse",
      }),
      lastRunAt: 42,
      selectedDbIdentifier: "warehouse",
      selectedCatalogContext: "finance",
    });
  });

  test("updates the sql draft from the latest exploratory result", () => {
    const patch = buildAiCellUpdatePatch({
      message: {
        id: "assistant-2",
        role: "assistant",
        parts: [
          {
            type: "tool-execute_exploratory_sql",
            output: {
              sql: "select * from orders limit 10",
              dbIdentifier: "warehouse",
              catalogContext: "sales",
            },
          },
        ],
      } as unknown as UIMessage,
      createdAt: 42,
      selectedDbIdentifier: "fallback-db",
      selectedCatalogContext: "finance",
    });

    expect(patch).toMatchObject({
      status: "idle",
      sqlDraft: "select * from orders limit 10",
      selectedDbIdentifier: "warehouse",
      selectedCatalogContext: "sales",
    });
  });

  test("marks the cell as error when the assistant returns a tool error", () => {
    const patch = buildAiCellUpdatePatch({
      message: {
        id: "assistant-3",
        role: "assistant",
        parts: [
          {
            type: "tool-execute_final_sql",
            errorText: "relation does not exist",
          },
        ],
      } as unknown as UIMessage,
      createdAt: 42,
    });

    expect(patch).toMatchObject({
      status: "error",
    });
  });

  test("returns the latest assistant text from the cell messages", () => {
    const text = getLatestAssistantText([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "first" }],
      } as unknown as UIMessage,
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Older answer" }],
      } as unknown as UIMessage,
      {
        id: "assistant-2",
        role: "assistant",
        parts: [{ type: "text", text: "Latest answer" }],
      } as unknown as UIMessage,
    ]);

    expect(text).toBe("Latest answer");
  });

  test("extracts text content from a message with multiple text parts", () => {
    const text = getMessageText({
      id: "assistant-4",
      role: "assistant",
      parts: [
        { type: "text", text: "First line" },
        { type: "text", text: "Second line" },
      ],
    } as unknown as UIMessage);

    expect(text).toBe("First line\n\nSecond line");
  });

  test("builds transcript blocks with tool calls and sql results", () => {
    const blocks = buildTranscriptMessageBlocks(
      {
        id: "assistant-5",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "I ran the query.",
          },
          {
            type: "tool-execute_final_sql",
            input: {
              sql: "select 1",
            },
            output: {
              text: "Executed SELECT query successfully.",
              parts: [
                {
                  type: "data-execute-sql",
                  data: {
                    status: "complete",
                    payload: {
                      query: "select 1",
                      visualType: "table",
                      rows: [{ value: 1 }],
                      columns: [{ name: "value" }],
                      rowCount: 1,
                      summary: {
                        totalRows: 1,
                        insights: ["Returned one row"],
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      } as unknown as UIMessage,
      {
        showToolCalls: true,
        showExecuteSqlRawOutput: false,
      },
    );

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      kind: "text",
      text: "I ran the query.",
    });
    expect(blocks[1]).toMatchObject({
      kind: "tool-call",
      toolName: "execute_final_sql",
      sql: "select 1",
      summaryText: "Executed SELECT query successfully.",
      rawOutputJson: null,
    });
    expect(blocks[2]).toMatchObject({
      kind: "sql-result",
      data: {
        query: "select 1",
        visualType: "table",
      },
    });
  });

  test("keeps sql transcript results visible when tool cards are hidden", () => {
    const blocks = buildTranscriptMessageBlocks(
      {
        id: "assistant-6",
        role: "assistant",
        parts: [
          {
            type: "tool-execute_exploratory_sql",
            output: {
              text: "Validated SELECT draft successfully.",
              sql: "select * from orders limit 5",
              rowCount: 5,
              columns: [{ name: "order_id" }],
              rows: [{ order_id: 1 }],
              summary: {
                totalRows: 5,
                executionTimeMs: 12,
                queryType: "SELECT",
              },
            },
          },
        ],
      } as unknown as UIMessage,
      {
        showToolCalls: false,
        showExecuteSqlRawOutput: true,
      },
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "sql-result",
      data: {
        query: "select * from orders limit 5",
        visualType: "table",
      },
    });
  });

  test("includes raw sql tool output json only when enabled", () => {
    const message = {
      id: "assistant-7",
      role: "assistant",
      parts: [
        {
          type: "tool-execute_exploratory_sql",
          output: {
            text: "Validated SELECT draft successfully.",
            sql: "select * from orders limit 5",
            rowCount: 5,
          },
        },
      ],
    } as unknown as UIMessage;

    const withoutRawOutput = buildTranscriptMessageBlocks(message, {
      showToolCalls: true,
      showExecuteSqlRawOutput: false,
    });
    const withRawOutput = buildTranscriptMessageBlocks(message, {
      showToolCalls: true,
      showExecuteSqlRawOutput: true,
    });

    expect(withoutRawOutput[0]).toMatchObject({
      kind: "tool-call",
      rawOutputJson: null,
    });
    expect(withRawOutput[0]).toMatchObject({
      kind: "tool-call",
    });
    expect(
      (
        withRawOutput[0] as Extract<
          (typeof withRawOutput)[number],
          { kind: "tool-call" }
        >
      ).rawOutputJson,
    ).toContain('"sql": "select * from orders limit 5"');
  });
});
