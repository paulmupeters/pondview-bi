import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server.node";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import {
  CellList,
  resolveDisplayedCellForMissingAiConfig,
} from "@/features/analysis/components/CellList";
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
    sqlDraft: null,
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

describe("resolveDisplayedCellForMissingAiConfig", () => {
  test("defaults analysis cells to SQL when AI configuration is missing", () => {
    const displayedCell = resolveDisplayedCellForMissingAiConfig({
      cell: createCell(),
      hasAiConfiguration: false,
      honorChatMode: false,
    });

    expect(displayedCell.activeMode).toBe("sql");
  });

  test("keeps chat mode when it was explicitly selected", () => {
    const displayedCell = resolveDisplayedCellForMissingAiConfig({
      cell: createCell(),
      hasAiConfiguration: false,
      honorChatMode: true,
    });

    expect(displayedCell.activeMode).toBe("ai");
  });
});

describe("CellList", () => {
  test("renders an add cell control in the empty workbook state", () => {
    const markup = renderToStaticMarkup(
      <CellList
        cells={[]}
        selectedCellId={null}
        pendingBootstrap={null}
        notebookSession={createNotebookSession()}
        onSelectCell={() => {}}
        onBootstrapConsumed={() => {}}
        onDeleteCell={() => {}}
        onSelectCellMode={() => {}}
        onAddCell={() => {}}
        isBusy={false}
      />,
    );

    expect(markup).toContain("Empty workbook");
    expect(markup).toContain("Add cell");
  });
});
