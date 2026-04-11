import type { UIMessage } from "@ai-sdk/react";
import { analysisCellEntryToUiMessage } from "@/components/chat/notebook-cell-utils";
import { parseSqlCellPayload } from "@/features/analysis/sql-cell-payload";
import type {
  WorkspaceAnalysisCell,
  WorkspaceAnalysisCellEntry,
} from "@/lib/workspace/workspace-db";

export function buildDashboardBuilderMessages(params: {
  cells: WorkspaceAnalysisCell[];
  cellEntriesByCellId: Map<string, WorkspaceAnalysisCellEntry[]>;
}): UIMessage[] {
  const cellsWithEntries = new Set<string>();
  const cellEntryMessages = params.cells.flatMap((cell) => {
    const entries = params.cellEntriesByCellId.get(cell.id) ?? [];
    if (entries.length === 0) return [];
    cellsWithEntries.add(cell.id);
    // Only use the latest entry to avoid duplicate charts from historical runs
    return [analysisCellEntryToUiMessage(entries[entries.length - 1])];
  });

  // Only create synthetic SQL messages for cells that don't already have
  // a cell entry message, to avoid duplicate visuals in the dashboard.
  const syntheticSqlMessages: UIMessage[] = params.cells.flatMap((cell) => {
    if (cellsWithEntries.has(cell.id) || !cell.resultPayloadJson) {
      return [];
    }

    const payload = parseSqlCellPayload(cell.resultPayloadJson);

    if (!payload) {
      return [];
    }

    return [
      {
        id: `sql-result-${cell.id}`,
        role: "assistant" as const,
        parts: [
          {
            type: "data-execute-sql" as const,
            data: {
              id: `sql-result-${cell.id}`,
              type: "execute-sql" as const,
              status: "complete" as const,
              payload,
              version: 1,
              createdAt: cell.lastRunAt ?? cell.updatedAt,
              updatedAt: cell.updatedAt,
            },
          },
        ],
      } as UIMessage,
    ];
  });

  // Create synthetic messages for text cells
  const syntheticTextMessages: UIMessage[] = params.cells.flatMap((cell) => {
    if (cell.kind !== "text" || !cell.promptText?.trim()) {
      return [];
    }

    return [
      {
        id: `text-cell-${cell.id}`,
        role: "assistant" as const,
        parts: [
          {
            type: "data-execute-sql" as const,
            data: {
              id: `text-cell-${cell.id}`,
              type: "execute-sql" as const,
              status: "complete" as const,
              payload: {
                stage: "complete" as const,
                visualType: "text" as const,
                textConfig: {
                  configType: "text" as const,
                  content: cell.promptText,
                },
                rows: [],
                columns: [],
              },
              version: 1,
              createdAt: cell.createdAt,
              updatedAt: cell.updatedAt,
            },
          },
        ],
      } as UIMessage,
    ];
  });

  return [...cellEntryMessages, ...syntheticSqlMessages, ...syntheticTextMessages];
}
