import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server.node";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import type { AiCellState } from "@/features/analysis/components/AiCell";
import { SqlCell } from "@/features/analysis/components/SqlCell";
import { createSqlCellPayload } from "@/features/analysis/sql-cell-payload";
import type { NotebookSession } from "@/hooks/use-notebook-session";

function createCell(
  overrides: Partial<AnalysisCellState> = {},
): AnalysisCellState {
  return {
    id: "cell-1",
    notebookId: "notebook-1",
    position: 0,
    kind: "ai",
    aiEnabled: true,
    sqlEnabled: true,
    activeMode: "ai",
    promptText: "",
    sqlDraft: "select * from orders",
    selectedDbIdentifier: null,
    selectedCatalogContext: null,
    status: "idle",
    resultPayloadJson: null,
    createdAt: 1,
    updatedAt: 1,
    lastRunAt: null,
    ...overrides,
  };
}

function createAiState(overrides: Partial<AiCellState> = {}): AiCellState {
  return {
    promptDraft: "",
    setPromptDraft: () => {},
    promptError: null,
    latestAssistantText: null,
    transcriptMessages: [],
    isAssistantThinking: false,
    submitPrompt: async () => {},
    ...overrides,
  };
}

function createNotebookSession(): NotebookSession {
  return {
    isLoading: false,
    hasLoaded: true,
    error: null,
    notebook: null,
    cells: [],
    cellEntriesByCellId: new Map(),
    updateTitle: async () => {},
    addCell: async () => {
      throw new Error("not implemented");
    },
    appendCellEntry: async () => {
      throw new Error("not implemented");
    },
    updateCell: async () => {},
    deleteCell: async () => {},
    deleteCellEntry: async () => {},
    refreshUpdatedAt: async () => {},
    reload: async () => {},
  };
}

function installDomMocks() {
  globalThis.document ??= {
    body: {},
    documentElement: {
      classList: {
        contains: () => false,
      },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  } as never;
  globalThis.window ??= {
    document: globalThis.document,
  } as never;
}

describe("SqlCell", () => {
  test("renders explicit Chat and SQL tabs for analysis cells", () => {
    installDomMocks();

    const markup = renderToStaticMarkup(
      <SqlCell
        cell={createCell()}
        notebookSession={createNotebookSession()}
        aiEnabled
        onToggleAi={() => {}}
        ai={createAiState()}
      />,
    );

    expect(markup).toContain(">Chat<");
    expect(markup).toContain(">SQL<");
    expect(markup).not.toContain(">AI<");
  });

  test("renders the result panel before the chat or SQL editor", () => {
    installDomMocks();

    const payload = createSqlCellPayload({
      result: {
        sql: "select region, revenue from revenue_by_region",
        rows: [{ region: "West", revenue: 42 }],
        columns: [
          { name: "region", type: "VARCHAR" },
          { name: "revenue", type: "INTEGER" },
        ],
        durationMs: 18,
      },
      selectedCatalogContext: null,
    });

    const markup = renderToStaticMarkup(
      <SqlCell
        cell={createCell({
          resultPayloadJson: JSON.stringify(payload),
          sqlDraft: payload.query,
        })}
        notebookSession={createNotebookSession()}
        aiEnabled
        onToggleAi={() => {}}
        ai={createAiState()}
      />,
    );

    expect(markup.indexOf(">Data<")).toBeLessThan(markup.indexOf(">Chat<"));
  });
});
