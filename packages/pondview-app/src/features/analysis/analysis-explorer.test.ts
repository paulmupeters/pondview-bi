import { describe, expect, test } from "bun:test";
import {
  buildNotebookExplorerInsertPatch,
  getAnalysisExplorerToggleLabel,
} from "@/features/analysis/analysis-explorer";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";

function makeCell(
  overrides: Partial<AnalysisCellState> & Pick<AnalysisCellState, "id">,
): AnalysisCellState {
  const { id, ...rest } = overrides;

  return {
    id,
    notebookId: "notebook-1",
    position: 0,
    kind: "sql",
    promptText: "",
    sqlDraft: null,
    selectedDbIdentifier: null,
    selectedCatalogContext: null,
    status: "idle",
    resultPayloadJson: null,
    createdAt: 1,
    updatedAt: 1,
    lastRunAt: null,
    aiEnabled: false,
    sqlEnabled: true,
    activeMode: "sql",
    ...rest,
  };
}

describe("analysis explorer helpers", () => {
  test("labels the toolbar toggle based on explorer visibility", () => {
    expect(getAnalysisExplorerToggleLabel(true)).toBe("Show explorer");
    expect(getAnalysisExplorerToggleLabel(false)).toBe("Hide explorer");
  });

  test("returns null when the selected cell cannot accept SQL references", () => {
    expect(
      buildNotebookExplorerInsertPatch({
        cells: [makeCell({ id: "cell-1", sqlEnabled: false })],
        selectedCellId: "cell-1",
        reference: "orders",
        dbIdentifier: "warehouse",
        catalogContext: "sales",
      }),
    ).toBeNull();

    expect(
      buildNotebookExplorerInsertPatch({
        cells: [makeCell({ id: "cell-1" })],
        selectedCellId: "missing",
        reference: "orders",
        dbIdentifier: "warehouse",
        catalogContext: "sales",
      }),
    ).toBeNull();
  });

  test("appends the selected table reference to the active SQL cell", () => {
    expect(
      buildNotebookExplorerInsertPatch({
        cells: [makeCell({ id: "cell-1", sqlDraft: "select * from" })],
        selectedCellId: "cell-1",
        reference: "sales.orders",
        dbIdentifier: "warehouse",
        catalogContext: "sales",
      }),
    ).toEqual({
      cellId: "cell-1",
      patch: {
        sqlDraft: "select * from sales.orders",
        selectedDbIdentifier: "warehouse",
        selectedCatalogContext: "sales",
      },
    });
  });

  test("avoids adding an extra space when the SQL draft already ends with whitespace", () => {
    expect(
      buildNotebookExplorerInsertPatch({
        cells: [makeCell({ id: "cell-1", sqlDraft: "select * from " })],
        selectedCellId: "cell-1",
        reference: "sales.orders",
        dbIdentifier: "warehouse",
        catalogContext: "sales",
      }),
    ).toEqual({
      cellId: "cell-1",
      patch: {
        sqlDraft: "select * from sales.orders",
        selectedDbIdentifier: "warehouse",
        selectedCatalogContext: "sales",
      },
    });
  });
});
