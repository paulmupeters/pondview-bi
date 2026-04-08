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
  const cellEntryMessages = params.cells.flatMap((cell) =>
    (params.cellEntriesByCellId.get(cell.id) ?? []).map(
      analysisCellEntryToUiMessage,
    ),
  );

  const syntheticSqlMessages: UIMessage[] = params.cells.flatMap((cell) => {
    if (!cell.resultPayloadJson) {
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

  return [...cellEntryMessages, ...syntheticSqlMessages];
}
