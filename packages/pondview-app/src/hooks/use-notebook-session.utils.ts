import type { WorkspaceAnalysisCell } from "@/lib/workspace/workspace-db";

type UpdatableAnalysisCellFields = Pick<
  WorkspaceAnalysisCell,
  | "promptText"
  | "kind"
  | "aiEnabled"
  | "sqlEnabled"
  | "sqlDraft"
  | "selectedDbIdentifier"
  | "selectedCatalogContext"
  | "status"
  | "resultPayloadJson"
  | "lastRunAt"
>;

export function mergeAnalysisCellPatch(params: {
  cell: WorkspaceAnalysisCell;
  patch: Partial<UpdatableAnalysisCellFields>;
  updatedAt: number;
}): WorkspaceAnalysisCell | null {
  const { cell, patch, updatedAt } = params;

  const hasChanges = Object.entries(patch).some(([key, value]) => {
    return cell[key as keyof UpdatableAnalysisCellFields] !== value;
  });

  if (!hasChanges) {
    return null;
  }

  return {
    ...cell,
    ...patch,
    updatedAt,
  };
}
