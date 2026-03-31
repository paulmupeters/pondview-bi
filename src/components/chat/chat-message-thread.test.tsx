import { describe, expect, test } from "bun:test";
import type { UIMessage } from "@ai-sdk/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtifactMutationProvider } from "@/components/artifact-mutation-context";
import {
  ChatMessageThread,
  getCollapsedAssistantMessageIds,
  getCollapsedAssistantPartIndexes,
  getLatestAssistantPreviewPartIndex,
  getTrailingAssistantMessageIds,
  groupMessagesIntoCells,
} from "@/components/chat/chat-message-thread";
import type { VisualizationEntry } from "@/components/chat/hooks/use-visualization-selection";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";

const EXECUTE_SQL_ARTIFACT_TYPE = "data-execute-sql";

function createSqlPayload(): SqlAnalysisData {
  return {
    stage: "complete",
    progress: 1,
    query: "select region, revenue from sales",
    rowCount: 1,
    columns: [
      { name: "region", type: "VARCHAR" },
      { name: "revenue", type: "INTEGER" },
    ],
    rows: [{ region: "North", revenue: 42 }],
    visualType: "table",
    summary: {
      totalRows: 1,
      executionTimeMs: 18,
      insights: ["North leads revenue"],
      queryType: "SELECT",
    },
  };
}

function renderThread({
  messages,
  visualizationMap,
  status = "ready",
  showToolCalls = true,
}: {
  messages: UIMessage[];
  visualizationMap?: Map<string, VisualizationEntry>;
  status?: string;
  showToolCalls?: boolean;
}) {
  return renderToStaticMarkup(
    <ArtifactMutationProvider
      chatId="chat-1"
      messages={messages}
      setMessages={() => {}}
      executeSqlArtifactType={EXECUTE_SQL_ARTIFACT_TYPE}
    >
      <ChatMessageThread
        messages={messages}
        status={status}
        animationFrame="."
        verbAiIsThinking="Thinking"
        executeSqlArtifactType={EXECUTE_SQL_ARTIFACT_TYPE}
        visualizationMap={visualizationMap ?? new Map()}
        onRemoveMessage={async () => {}}
        conversationClassName=""
        contentSpacingClassName=""
        messagePaddingClassName="p-3"
        userResponsePaddingClassName="p-1"
        showToolCalls={showToolCalls}
        showExecuteSqlRawOutput={false}
      />
    </ArtifactMutationProvider>,
  );
}

describe("ChatMessageThread", () => {
  test("shows only the latest assistant message while keeping prior SQL results visible", () => {
    const payload = createSqlPayload();
    const messages = [
      {
        id: "assistant-hidden-text",
        role: "assistant",
        parts: [{ type: "text", text: "Hidden earlier assistant output" }],
      },
      {
        id: "assistant-hidden-sql",
        role: "assistant",
        parts: [
          {
            type: "tool-execute_sql",
            toolCallId: "tool-1",
            state: "output-available",
            input: { sql: payload.query },
            result: {
              parts: [
                {
                  type: EXECUTE_SQL_ARTIFACT_TYPE,
                  data: {
                    id: "artifact-1",
                    status: "complete",
                    progress: 1,
                    payload,
                  },
                },
              ],
            },
          },
        ],
      },
      {
        id: "assistant-latest",
        role: "assistant",
        parts: [
          { type: "text", text: "Latest assistant output stays visible" },
        ],
      },
    ] as UIMessage[];
    const visualizationMap = new Map<string, VisualizationEntry>([
      [
        "artifact-1",
        {
          id: "artifact-1",
          artifactId: "artifact-1",
          data: payload,
          stage: "complete",
          progress: 1,
        },
      ],
    ]);

    const markup = renderThread({
      messages,
      visualizationMap,
      showToolCalls: true,
    });

    expect(markup).toContain("Latest assistant output stays visible");
    expect(markup).toContain("Run summary");
    expect(markup).toContain("North");
    expect(markup).toContain("Show assistant output");
    expect(markup).not.toContain("Hidden earlier assistant output");
    expect(markup).not.toContain("execute_sql");
  });

  test("hides the toggle while the assistant is still streaming", () => {
    const markup = renderThread({
      messages: [
        {
          id: "assistant-hidden",
          role: "assistant",
          parts: [{ type: "text", text: "Earlier assistant step" }],
        } as UIMessage,
        {
          id: "assistant-latest-streaming",
          role: "assistant",
          parts: [{ type: "text", text: "Streaming latest assistant step" }],
        } as UIMessage,
      ],
      status: "streaming",
      showToolCalls: false,
    });

    expect(markup).toContain("Streaming latest assistant step");
    expect(markup).not.toContain("Earlier assistant step");
    expect(markup).not.toContain("Show assistant output");
  });

  test("shows only the latest part inside the latest assistant message until expanded", () => {
    const payload = createSqlPayload();
    const markup = renderThread({
      messages: [
        {
          id: "assistant-latest",
          role: "assistant",
          parts: [
            { type: "text", text: "I'll help you analyze trends of unicorns" },
            {
              type: "tool-read_skills_md",
              toolCallId: "tool-1",
              state: "output-available",
              input: {},
              output: { ok: true },
            },
            {
              type: "tool-list_tables",
              toolCallId: "tool-2",
              state: "output-available",
              input: {},
              output: { tables: ["unicorns"] },
            },
            {
              type: "tool-execute_sql",
              toolCallId: "tool-3",
              state: "output-available",
              input: { sql: payload.query },
              result: {
                parts: [
                  {
                    type: EXECUTE_SQL_ARTIFACT_TYPE,
                    data: {
                      id: "artifact-1",
                      status: "complete",
                      progress: 1,
                      payload,
                    },
                  },
                ],
              },
            },
            {
              type: "text",
              text: "Here is the final assistant summary",
            },
          ],
        } as UIMessage,
      ],
      visualizationMap: new Map<string, VisualizationEntry>([
        [
          "artifact-1",
          {
            id: "artifact-1",
            artifactId: "artifact-1",
            data: payload,
            stage: "complete",
            progress: 1,
          },
        ],
      ]),
      showToolCalls: true,
    });

    expect(markup).not.toContain("I'll help you analyze trends of unicorns");
    expect(markup).toContain("Here is the final assistant summary");
    expect(markup).not.toContain("read_skills_md");
    expect(markup).not.toContain("list_tables");
    expect(markup).not.toContain("execute_sql");
    expect(markup).toContain("Run summary");
    expect(markup).toContain("North");
    expect(markup).toContain("Show assistant output");
  });

  test("keeps tool errors visible even when earlier assistant messages are hidden", () => {
    const markup = renderThread({
      messages: [
        {
          id: "assistant-hidden-error",
          role: "assistant",
          parts: [
            {
              type: "tool-fetch_data",
              toolCallId: "tool-2",
              state: "output-error",
              input: {},
              errorText: "Warehouse connection failed",
            },
          ],
        } as UIMessage,
        {
          id: "assistant-latest",
          role: "assistant",
          parts: [{ type: "text", text: "Latest assistant output" }],
        } as UIMessage,
      ],
      showToolCalls: false,
    });

    expect(markup).toContain("Warehouse connection failed");
    expect(markup).toContain("Show assistant output");
    expect(markup).not.toContain("Hidden explanation");
  });
});

describe("chat message thread helpers", () => {
  test("collects the trailing assistant message stack for the active run", () => {
    expect(
      getTrailingAssistantMessageIds([
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Show me revenue" }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "Step 1" }],
        },
        {
          id: "assistant-2",
          role: "assistant",
          parts: [{ type: "text", text: "Step 2" }],
        },
      ] as UIMessage[]),
    ).toEqual(["assistant-1", "assistant-2"]);
  });

  test("hides all but the latest assistant message until the run is expanded", () => {
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Show me revenue" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Step 1" }],
      },
      {
        id: "assistant-2",
        role: "assistant",
        parts: [{ type: "text", text: "Step 2" }],
      },
    ] as UIMessage[];

    expect(
      getCollapsedAssistantMessageIds({
        messages,
        isExpanded: false,
      }),
    ).toEqual(["assistant-1"]);
    expect(
      getCollapsedAssistantMessageIds({
        messages,
        isExpanded: true,
      }),
    ).toEqual([]);
  });

  test("groups messages into notebook cells", () => {
    const messages = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "Hello" }] },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Hi" }],
      },
      {
        id: "assistant-2",
        role: "assistant",
        parts: [{ type: "text", text: "More" }],
      },
      {
        id: "user-2",
        role: "user",
        parts: [{ type: "text", text: "Next" }],
      },
      {
        id: "assistant-3",
        role: "assistant",
        parts: [{ type: "text", text: "Reply" }],
      },
    ] as UIMessage[];

    const cells = groupMessagesIntoCells(messages);
    expect(cells).toHaveLength(2);
    expect(cells[0].id).toBe("user-1");
    expect(cells[0].userMessage?.id).toBe("user-1");
    expect(cells[0].assistantMessages).toHaveLength(2);
    expect(cells[0].assistantMessages[0].id).toBe("assistant-1");
    expect(cells[0].assistantMessages[1].id).toBe("assistant-2");
    expect(cells[1].id).toBe("user-2");
    expect(cells[1].userMessage?.id).toBe("user-2");
    expect(cells[1].assistantMessages).toHaveLength(1);
  });

  test("creates a cell with null userMessage for leading assistant messages", () => {
    const messages = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Welcome" }],
      },
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Hi" }],
      },
    ] as UIMessage[];

    const cells = groupMessagesIntoCells(messages);
    expect(cells).toHaveLength(2);
    expect(cells[0].userMessage).toBeNull();
    expect(cells[0].assistantMessages).toHaveLength(1);
    expect(cells[1].userMessage?.id).toBe("user-1");
    expect(cells[1].assistantMessages).toHaveLength(0);
  });

  test("creates a cell with empty assistantMessages when user message is last", () => {
    const messages = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "Hello" }] },
    ] as UIMessage[];

    const cells = groupMessagesIntoCells(messages);
    expect(cells).toHaveLength(1);
    expect(cells[0].userMessage?.id).toBe("user-1");
    expect(cells[0].assistantMessages).toHaveLength(0);
  });

  test("keeps only the latest renderable part visible inside the latest assistant message", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "text", text: "First" },
        {
          type: "tool-read_skills_md",
          toolCallId: "tool-1",
          state: "output-available",
          input: {},
          output: { ok: true },
        },
        {
          type: "tool-execute_sql",
          toolCallId: "tool-2",
          state: "output-available",
          input: { sql: "select 1" },
          result: {
            parts: [
              {
                type: EXECUTE_SQL_ARTIFACT_TYPE,
                data: {
                  id: "artifact-1",
                  status: "complete",
                  payload: createSqlPayload(),
                },
              },
            ],
          },
        },
      ],
    } as UIMessage;

    expect(
      getLatestAssistantPreviewPartIndex({
        parts: message.parts,
        executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
        isAssistantThinking: true,
      }),
    ).toBe(2);
    expect(
      getLatestAssistantPreviewPartIndex({
        parts: [
          ...message.parts,
          { type: "text", text: "Final summary" },
        ] as UIMessage["parts"],
        executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
        isAssistantThinking: false,
      }),
    ).toBe(3);
    expect(
      getCollapsedAssistantPartIndexes({
        message,
        executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
        isAssistantThinking: true,
        isExpanded: false,
      }),
    ).toEqual([0, 1]);
    expect(
      getCollapsedAssistantPartIndexes({
        message,
        executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
        isAssistantThinking: false,
        isExpanded: true,
      }),
    ).toEqual([]);
  });
});
