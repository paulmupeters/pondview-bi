import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import { AiCell } from "@/features/analysis/components/AiCell";
import { CellFrame } from "@/features/analysis/components/CellFrame";
import { SqlCell } from "@/features/analysis/components/SqlCell";
import type { NotebookSession } from "@/hooks/use-notebook-session";

type CellListProps = {
  cells: AnalysisCellState[];
  selectedCellId: string | null;
  pendingBootstrap:
    | {
        kind: "ai";
        cellId: string;
        prompt: string;
      }
    | {
        kind: "sql";
        cellId: string;
        sql: string;
        autorun: boolean;
      }
    | null;
  notebookSession: NotebookSession;
  onSelectCell: (cellId: string) => void;
  onBootstrapConsumed: (cellId: string) => void;
  onDeleteCell: (cellId: string) => void;
  onToggleAiPane: (cellId: string, enabled: boolean) => void;
  onToggleSqlPane: (cellId: string, enabled: boolean) => void;
};

export function CellList({
  cells,
  selectedCellId,
  pendingBootstrap,
  notebookSession,
  onSelectCell,
  onBootstrapConsumed,
  onDeleteCell,
  onToggleAiPane,
  onToggleSqlPane,
}: CellListProps) {
  if (cells.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/10 px-6 py-12 text-center text-sm text-muted-foreground">
        This notebook is empty. Add an AI or SQL cell to start rebuilding the
        analysis flow.
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {cells.map((cell) => (
        <CellFrame
          key={cell.id}
          cell={cell}
          isSelected={cell.id === selectedCellId}
          onSelect={() => onSelectCell(cell.id)}
          onDelete={() => onDeleteCell(cell.id)}
        >
          <div className="space-y-4">
            <AiCell
              cell={cell}
              bootstrapPrompt={
                pendingBootstrap?.kind === "ai" &&
                pendingBootstrap.cellId === cell.id
                  ? pendingBootstrap.prompt
                  : null
              }
              entries={notebookSession.cellEntriesByCellId.get(cell.id) ?? []}
              notebookSession={notebookSession}
              aiEnabled={cell.aiEnabled}
              onToggleAi={() => onToggleAiPane(cell.id, !cell.aiEnabled)}
              onBootstrapConsumed={() => onBootstrapConsumed(cell.id)}
            />
            <SqlCell
              cell={cell}
              bootstrapSql={
                pendingBootstrap?.kind === "sql" &&
                pendingBootstrap.cellId === cell.id
                  ? {
                      sql: pendingBootstrap.sql,
                      autorun: pendingBootstrap.autorun,
                    }
                  : null
              }
              notebookSession={notebookSession}
              sqlEditorVisible={cell.sqlEnabled}
              onToggleSqlEditor={() =>
                onToggleSqlPane(cell.id, !cell.sqlEnabled)
              }
              onBootstrapConsumed={() => onBootstrapConsumed(cell.id)}
            />
          </div>
        </CellFrame>
      ))}
    </div>
  );
}
