import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import type { WorkspaceAnalysisCell } from "@/lib/workspace/workspace-db";

type NotebookExplorerInsertPatch = {
  cellId: string;
  patch: Partial<
    Pick<
      WorkspaceAnalysisCell,
      "sqlDraft" | "selectedDbIdentifier" | "selectedCatalogContext"
    >
  >;
};

export function getAnalysisExplorerToggleLabel(isCollapsed: boolean): string {
  return isCollapsed ? "Show explorer" : "Hide explorer";
}

export function appendSqlReference(
  sqlDraft: string | null | undefined,
  reference: string,
): string {
  const current = sqlDraft ?? "";
  const lastChar = current.length > 0 ? current[current.length - 1] : "";
  const needsSpace = current.length > 0 && !/\s/.test(lastChar);
  return `${current}${needsSpace ? " " : ""}${reference}`;
}

export function buildNotebookExplorerInsertPatch(params: {
  cells: AnalysisCellState[];
  selectedCellId: string | null;
  reference: string;
  dbIdentifier?: string | null;
  catalogContext?: string | null;
}): NotebookExplorerInsertPatch | null {
  const targetCell = params.cells.find(
    (cell) => cell.id === params.selectedCellId && cell.sqlEnabled,
  );

  if (!targetCell) {
    return null;
  }

  return {
    cellId: targetCell.id,
    patch: {
      sqlDraft: appendSqlReference(targetCell.sqlDraft, params.reference),
      selectedDbIdentifier: params.dbIdentifier ?? null,
      selectedCatalogContext: params.catalogContext ?? null,
    },
  };
}
