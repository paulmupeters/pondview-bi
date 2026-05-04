import { ChartNetwork, FileText, Plus, Type } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  AI_SETTINGS_UPDATED_EVENT,
  hasRequiredAiConfigurationInStorage,
} from "@/ai/settings";
import { Button } from "@/components/ui/button";
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

export function resolveDisplayedCellForMissingAiConfig(params: {
  cell: AnalysisCellState;
  hasAiConfiguration: boolean;
  honorChatMode: boolean;
}): AnalysisCellState {
  const { cell, hasAiConfiguration, honorChatMode } = params;

  if (
    hasAiConfiguration ||
    honorChatMode ||
    cell.kind === "text" ||
    cell.activeMode !== "ai"
  ) {
    return cell;
  }

  return {
    ...cell,
    activeMode: "sql",
  };
}

function InsertCellDivider({
  onAddCell,
  disabled,
}: {
  onAddCell: (kind: WorkspaceAnalysisCellKind) => void;
  disabled: boolean;
}) {
  return (
    <div className="group/insert relative flex items-center justify-center py-1.5">
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/40 transition-colors group-hover/insert:border-border" />
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          className="relative z-10 flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/insert:opacity-100 disabled:pointer-events-none disabled:opacity-0"
        >
          <Plus className="size-3" />
          Add cell
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem onClick={() => onAddCell("ai")}>
            <ChartNetwork className="size-4" />
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

function AddCellMenu({
  onAddCell,
  disabled,
}: {
  onAddCell: (kind: WorkspaceAnalysisCellKind) => void;
  disabled: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={disabled} size="sm">
          <Plus className="size-3.5" />
          Add cell
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuItem onClick={() => onAddCell("ai")}>
          <ChartNetwork className="size-4" />
          Analysis cell
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddCell("text")}>
          <Type className="size-4" />
          Text cell
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const [explicitChatModeByCellId, setExplicitChatModeByCellId] = useState<
    Record<string, true>
  >({});
  const [hasAiConfiguration, setHasAiConfiguration] = useState(() =>
    hasRequiredAiConfigurationInStorage(),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncAiConfiguration = () => {
      setHasAiConfiguration(hasRequiredAiConfigurationInStorage());
    };

    syncAiConfiguration();
    window.addEventListener("storage", syncAiConfiguration);
    window.addEventListener(AI_SETTINGS_UPDATED_EVENT, syncAiConfiguration);

    return () => {
      window.removeEventListener("storage", syncAiConfiguration);
      window.removeEventListener(
        AI_SETTINGS_UPDATED_EVENT,
        syncAiConfiguration,
      );
    };
  }, []);

  useEffect(() => {
    setExplicitChatModeByCellId((previousExplicitChatModeByCellId) => {
      const knownCellIds = new Set(cells.map((cell) => cell.id));
      let hasChanges = false;
      const nextExplicitChatModeByCellId: Record<string, true> = {};

      for (const cellId of Object.keys(previousExplicitChatModeByCellId)) {
        if (!knownCellIds.has(cellId)) {
          hasChanges = true;
          continue;
        }

        nextExplicitChatModeByCellId[cellId] = true;
      }

      return hasChanges
        ? nextExplicitChatModeByCellId
        : previousExplicitChatModeByCellId;
    });
  }, [cells]);

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

  const handleSelectCellMode = useCallback(
    (cellId: string, mode: "ai" | "sql" | "text") => {
      setExplicitChatModeByCellId((previousExplicitChatModeByCellId) => {
        const hadExplicitChatMode = previousExplicitChatModeByCellId[cellId];

        if (mode === "ai") {
          if (hadExplicitChatMode) {
            return previousExplicitChatModeByCellId;
          }

          return {
            ...previousExplicitChatModeByCellId,
            [cellId]: true,
          };
        }

        if (!hadExplicitChatMode) {
          return previousExplicitChatModeByCellId;
        }

        const {
          [cellId]: _removedExplicitChatMode,
          ...remainingExplicitChatModes
        } = previousExplicitChatModeByCellId;
        return remainingExplicitChatModes;
      });

      onSelectCellMode(cellId, mode);
    },
    [onSelectCellMode],
  );

  if (cells.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 px-6 py-20 text-center">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/30">
          <FileText className="size-5 text-muted-foreground/50" />
        </div>
        <h3 className="mb-1 text-base font-semibold tracking-tight text-foreground">
          Empty workbook
        </h3>
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          Add an analysis or text cell to get started.
        </p>
        <div className="mt-6">
          <AddCellMenu onAddCell={onAddCell} disabled={isBusy} />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {cells.map((cell, index) => {
        const honorChatMode =
          Boolean(explicitChatModeByCellId[cell.id]) ||
          (pendingBootstrap?.kind === "ai" &&
            pendingBootstrap.cellId === cell.id);
        const displayedCell = resolveDisplayedCellForMissingAiConfig({
          cell,
          hasAiConfiguration,
          honorChatMode,
        });

        return (
          <div key={cell.id}>
            {index > 0 && (
              <InsertCellDivider onAddCell={onAddCell} disabled={isBusy} />
            )}
            <CellFrame
              cell={displayedCell}
              isSelected={displayedCell.id === selectedCellId}
              onSelect={() => onSelectCell(displayedCell.id)}
              onDelete={() => onDeleteCell(displayedCell.id)}
              statusMessage={statusMessagesByCellId[displayedCell.id] ?? null}
            >
              <CellContent
                cell={displayedCell}
                pendingBootstrap={pendingBootstrap}
                notebookSession={notebookSession}
                onBootstrapConsumed={onBootstrapConsumed}
                onSelectCellMode={handleSelectCellMode}
                onStatusMessageChange={handleStatusMessageChange}
              />
            </CellFrame>
          </div>
        );
      })}
      <InsertCellDivider onAddCell={onAddCell} disabled={isBusy} />
    </div>
  );
}
