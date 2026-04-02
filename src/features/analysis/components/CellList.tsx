import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import { AiCell } from "@/features/analysis/components/AiCell";
import { CellFrame } from "@/features/analysis/components/CellFrame";
import { SqlCell } from "@/features/analysis/components/SqlCell";
import type { NotebookSession } from "@/hooks/use-notebook-session";

type CellListProps = {
  cells: AnalysisCellState[];
  selectedCellId: string | null;
  notebookSession: NotebookSession;
  onSelectCell: (cellId: string) => void;
  onDeleteCell: (cellId: string) => void;
  onToggleAiPane: (cellId: string, enabled: boolean) => void;
  onToggleSqlPane: (cellId: string, enabled: boolean) => void;
};

export function CellList({
  cells,
  selectedCellId,
  notebookSession,
  onSelectCell,
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
    <div className="space-y-4">
      {cells.map((cell) => (
        <CellFrame
          key={cell.id}
          cell={cell}
          isSelected={cell.id === selectedCellId}
          onSelect={() => onSelectCell(cell.id)}
          onDelete={() => onDeleteCell(cell.id)}
          onToggleAi={() => onToggleAiPane(cell.id, !cell.aiEnabled)}
          onToggleSql={() => onToggleSqlPane(cell.id, !cell.sqlEnabled)}
        >
          <div className="space-y-4">
            {cell.aiEnabled ? <AiCell cell={cell} /> : null}
            {cell.sqlEnabled ? (
              <SqlCell cell={cell} notebookSession={notebookSession} />
            ) : null}
            {!cell.aiEnabled && !cell.sqlEnabled ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                Enable AI or SQL for this cell to keep working in place.
              </div>
            ) : null}
          </div>
        </CellFrame>
      ))}
    </div>
  );
}
