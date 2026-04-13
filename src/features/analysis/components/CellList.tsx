import { Bot, Plus, Type } from "lucide-react";
import { useCallback, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import { CellContent } from "@/features/analysis/components/CellContent";
import { CellFrame } from "@/features/analysis/components/CellFrame";
import type { NotebookSession } from "@/hooks/use-notebook-session";
import type { WorkspaceAnalysisCellKind } from "@/lib/workspace/workspace-db";

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
  onSelectCellMode: (cellId: string, mode: "ai" | "sql" | "text") => void;
  onAddCell: (kind: WorkspaceAnalysisCellKind) => void;
  isBusy: boolean;
};

function InsertCellDivider({
  onAddCell,
  disabled,
}: {
  onAddCell: (kind: WorkspaceAnalysisCellKind) => void;
  disabled: boolean;
}) {
  return (
    <div className="group/insert relative flex items-center justify-center py-1">
      <div className="absolute inset-x-0 top-1/2 border-t border-transparent transition-colors group-hover/insert:border-border" />
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          className="relative z-10 flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/insert:opacity-100 disabled:pointer-events-none disabled:opacity-0"
        >
          <Plus className="size-3" />
          Add cell
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem onClick={() => onAddCell("ai")}>
            <Bot className="size-4" />
            Analysis cell
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddCell("text")}>
            <Type className="size-4" />
            Text cell
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function CellList({
  cells,
  selectedCellId,
  pendingBootstrap,
  notebookSession,
  onSelectCell,
  onBootstrapConsumed,
  onDeleteCell,
  onSelectCellMode,
  onAddCell,
  isBusy,
}: CellListProps) {
  const [statusMessagesByCellId, setStatusMessagesByCellId] = useState<
    Record<string, string | null>
  >({});

  const handleStatusMessageChange = useCallback(
    (cellId: string, statusMessage: string | null) => {
      setStatusMessagesByCellId((previousStatusMessages) => {
        if (previousStatusMessages[cellId] === statusMessage) {
          return previousStatusMessages;
        }

        if (statusMessage == null) {
          if (!Object.hasOwn(previousStatusMessages, cellId)) {
            return previousStatusMessages;
          }

          const {
            [cellId]: _removedStatusMessage,
            ...remainingStatusMessages
          } = previousStatusMessages;
          return remainingStatusMessages;
        }

        return {
          ...previousStatusMessages,
          [cellId]: statusMessage,
        };
      });
    },
    [],
  );

  if (cells.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/10 px-6 py-12 text-center text-sm text-muted-foreground">
        This notebook is empty. Add an analysis or text cell to get started.
      </div>
    );
  }

  return (
    <div className="pb-8">
      {cells.map((cell, index) => (
        <div key={cell.id}>
          {index > 0 && (
            <InsertCellDivider onAddCell={onAddCell} disabled={isBusy} />
          )}
          <CellFrame
            cell={cell}
            isSelected={cell.id === selectedCellId}
            onSelect={() => onSelectCell(cell.id)}
            onDelete={() => onDeleteCell(cell.id)}
            statusMessage={statusMessagesByCellId[cell.id] ?? null}
          >
            <CellContent
              cell={cell}
              pendingBootstrap={pendingBootstrap}
              notebookSession={notebookSession}
              onBootstrapConsumed={onBootstrapConsumed}
              onSelectCellMode={onSelectCellMode}
              onStatusMessageChange={handleStatusMessageChange}
            />
          </CellFrame>
        </div>
      ))}
      <InsertCellDivider onAddCell={onAddCell} disabled={isBusy} />
    </div>
  );
}
