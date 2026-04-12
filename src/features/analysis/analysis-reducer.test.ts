import { describe, expect, test } from "bun:test";
import {
  analysisReducer,
  createInitialAnalysisState,
  toAnalysisCellState,
} from "@/features/analysis/analysis-reducer";
import type { WorkspaceAnalysisCell } from "@/lib/workspace/workspace-db";

function makeCell(
  overrides: Partial<WorkspaceAnalysisCell> & Pick<WorkspaceAnalysisCell, "id">,
): WorkspaceAnalysisCell {
  const { id, ...rest } = overrides;

  return {
    id,
    notebookId: "notebook-1",
    position: 0,
    promptText: "",
    sqlDraft: null,
    selectedDbIdentifier: null,
    selectedCatalogContext: null,
    status: "idle",
    resultPayloadJson: null,
    createdAt: 1,
    updatedAt: 1,
    lastRunAt: null,
    ...rest,
  };
}

describe("analysis reducer", () => {
  test("infers pane visibility from legacy sql and ai cells", () => {
    expect(
      toAnalysisCellState(
        makeCell({
          id: "cell-sql",
          kind: "sql",
          sqlDraft: "select * from orders",
        }),
      ),
    ).toMatchObject({
      aiEnabled: false,
      sqlEnabled: true,
      activeMode: "sql",
    });

    expect(
      toAnalysisCellState(
        makeCell({
          id: "cell-ai",
          kind: "ai",
          promptText: "Summarize weekly revenue",
        }),
      ),
    ).toMatchObject({
      aiEnabled: true,
      sqlEnabled: true,
      activeMode: "sql",
    });
  });

  test("loads cells and selects the first available cell", () => {
    const initial = createInitialAnalysisState("notebook-1");
    const loaded = analysisReducer(initial, {
      type: "workspaceLoaded",
      cells: [
        toAnalysisCellState(makeCell({ id: "cell-1", position: 0 })),
        toAnalysisCellState(makeCell({ id: "cell-2", position: 1 })),
      ],
    });

    expect(loaded.hydration).toBe("ready");
    expect(loaded.selectedCellId).toBe("cell-1");
  });

  test("selects newly added cells and can toggle panes independently", () => {
    const initial = createInitialAnalysisState("notebook-1");
    const added = analysisReducer(initial, {
      type: "cellAdded",
      cell: toAnalysisCellState(
        makeCell({
          id: "cell-1",
          aiEnabled: false,
          sqlEnabled: true,
        }),
      ),
    });

    const toggledAi = analysisReducer(added, {
      type: "cellAiPaneToggled",
      cellId: "cell-1",
      enabled: true,
    });

    const toggledSql = analysisReducer(toggledAi, {
      type: "cellSqlPaneToggled",
      cellId: "cell-1",
      enabled: false,
    });

    expect(toggledSql.selectedCellId).toBe("cell-1");
    expect(toggledSql.cells[0]).toMatchObject({
      aiEnabled: true,
      sqlEnabled: false,
      activeMode: "ai",
    });
  });

  test("reselects the next remaining cell after deleting the selected cell", () => {
    const loaded = analysisReducer(createInitialAnalysisState("notebook-1"), {
      type: "workspaceLoaded",
      cells: [
        toAnalysisCellState(makeCell({ id: "cell-1", position: 0 })),
        toAnalysisCellState(makeCell({ id: "cell-2", position: 1 })),
      ],
    });

    const selected = analysisReducer(loaded, {
      type: "cellSelected",
      cellId: "cell-2",
    });

    const deleted = analysisReducer(selected, {
      type: "cellDeleted",
      cellId: "cell-2",
    });

    expect(deleted.cells.map((cell) => cell.id)).toEqual(["cell-1"]);
    expect(deleted.selectedCellId).toBe("cell-1");
  });
});
