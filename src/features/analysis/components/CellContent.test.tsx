import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import type { AiCellState } from "@/features/analysis/components/AiCell";
import type { NotebookSession } from "@/hooks/use-notebook-session";

const aiState: AiCellState = {
  promptDraft: "",
  setPromptDraft: () => {},
  promptError: null,
  latestAssistantText: "AI says to keep this result visible.",
  transcriptMessages: [],
  isAssistantThinking: false,
  submitPrompt: async () => {},
};

mock.module("@/features/analysis/use-analysis-cell-ai", () => ({
  useAnalysisCellAi: () => aiState,
}));

mock.module("@/features/analysis/components/SqlCell", () => ({
  SqlCell: ({ aiEnabled }: { aiEnabled: boolean }) => (
    <div data-ai-enabled={String(aiEnabled)}>SQL cell</div>
  ),
}));

const { CellContent } = await import(
  "@/features/analysis/components/CellContent"
);

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
    activeMode: "sql",
    promptText: "",
    sqlDraft: "select * from orders",
    selectedDbIdentifier: null,
    selectedCatalogContext: null,
    status: "complete",
    resultPayloadJson: null,
    createdAt: 1,
    updatedAt: 1,
    lastRunAt: null,
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

describe("CellContent", () => {
  test("keeps the AI response visible while the SQL mode is selected", () => {
    const markup = renderToStaticMarkup(
      <CellContent
        cell={createCell({ activeMode: "sql" })}
        pendingBootstrap={null}
        notebookSession={createNotebookSession()}
        onBootstrapConsumed={() => {}}
        onSelectCellMode={() => {}}
      />,
    );

    expect(markup).toContain("AI Response");
    expect(markup).toContain("AI says to keep this result visible.");
    expect(markup).toContain("SQL cell");
    expect(markup).toContain('data-ai-enabled="false"');
  });
});
