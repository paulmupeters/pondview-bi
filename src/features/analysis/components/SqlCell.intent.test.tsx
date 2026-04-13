import { describe, expect, mock, test } from "bun:test";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server.node";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import type { AiCellState } from "@/features/analysis/components/AiCell";
import type { NotebookSession } from "@/hooks/use-notebook-session";

mock.module("@/components/sql-console", () => ({
  createSqlAutocompleteAction: () => ({}),
  SqlConsole: () => <div>SQL console</div>,
}));

mock.module("@/components/sql-analysis-display", () => ({
  SqlAnalysisDisplay: () => <div>SQL analysis display</div>,
}));

mock.module("@/components/ui/popover", () => {
  const PopoverContent = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );

  const PopoverTrigger = ({ children }: { children: ReactNode }) => (
    <>{children}</>
  );

  const Popover = ({
    open,
    children,
  }: {
    open?: boolean;
    children: ReactNode;
  }) => (
    <div data-open={String(Boolean(open))}>
      {Children.toArray(children).map((child) => {
        if (isValidElement(child) && child.type === PopoverContent) {
          return open ? child : null;
        }

        return child;
      })}
    </div>
  );

  return {
    Popover,
    PopoverTrigger,
    PopoverContent,
  };
});

const { SqlCell } = await import("@/features/analysis/components/SqlCell");

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

describe("SqlCell SQL intent prompt", () => {
  test("shows the suggestion for SQL-like prompts in chat mode", () => {
    const markup = renderToStaticMarkup(
      <SqlCell
        cell={createCell()}
        notebookSession={createNotebookSession()}
        aiEnabled
        onToggleAi={() => {}}
        ai={createAiState({
          promptDraft: "SELECT * FROM orders",
        })}
      />,
    );

    expect(markup).toContain("This looks like SQL");
    expect(markup).toContain("Switch to SQL");
    expect(markup).toContain("Keep in Chat");
  });

  test("does not show the suggestion for non-SQL prompts", () => {
    const markup = renderToStaticMarkup(
      <SqlCell
        cell={createCell()}
        notebookSession={createNotebookSession()}
        aiEnabled
        onToggleAi={() => {}}
        ai={createAiState({
          promptDraft: "show weekly revenue by customer",
        })}
      />,
    );

    expect(markup).not.toContain("This looks like SQL");
  });

  test("does not show the suggestion in SQL mode", () => {
    const markup = renderToStaticMarkup(
      <SqlCell
        cell={createCell()}
        notebookSession={createNotebookSession()}
        aiEnabled={false}
        onToggleAi={() => {}}
        ai={createAiState({
          promptDraft: "SELECT * FROM orders",
        })}
      />,
    );

    expect(markup).not.toContain("This looks like SQL");
  });
});
