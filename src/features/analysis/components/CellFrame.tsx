import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  FileText,
  Loader2,
  Sparkles,
  Table2,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import { cn } from "@/lib/utils";

type CellFrameProps = {
  cell: AnalysisCellState;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  statusMessage?: string | null;
  children: ReactNode;
};

type StatusIconProps = {
  cell: AnalysisCellState;
  className: string;
  statusMessage?: string | null;
};

function getStatusMeta(status: AnalysisCellState["status"]): {
  icon: typeof Circle;
  className: string;
} {
  switch (status) {
    case "running":
      return {
        icon: Loader2,
        className: "text-primary",
      };
    case "complete":
      return {
        icon: CircleCheck,
        className: "text-green-600 dark:text-green-400",
      };
    case "error":
      return {
        icon: CircleAlert,
        className: "text-destructive",
      };
    default:
      return {
        icon: Circle,
        className: "text-muted-foreground/40",
      };
  }
}

function getCellTypeMeta(cell: AnalysisCellState): {
  label: string;
  icon: typeof Circle;
  className: string;
  lineage: string;
} {
  if (cell.kind === "text" || cell.activeMode === "text") {
    return {
      label: "Markdown",
      icon: FileText,
      className: "border-border/70 bg-background",
      lineage: "Notebook note",
    };
  }

  const payload = cell.resultPayloadJson;
  if (payload?.includes('"visualType":"chart"')) {
    return {
      label: "Chart",
      icon: BarChart3,
      className: "border-primary/15 bg-card",
      lineage: "Generated from SQL",
    };
  }

  if (payload?.includes('"visualType":"table"')) {
    return {
      label: "Table",
      icon: Table2,
      className: "border-border/70 bg-card",
      lineage: "Generated from SQL",
    };
  }

  if (cell.activeMode === "sql") {
    return {
      label: "SQL",
      icon: TerminalSquare,
      className: "border-primary/20 bg-primary/[0.035]",
      lineage: "Prompt to query",
    };
  }

  return {
    label: "Analysis",
    icon: Sparkles,
    className: "border-primary/20 bg-primary/[0.045]",
    lineage: "Prompt to analysis",
  };
}

export function CellFrame({
  cell,
  isSelected,
  onSelect,
  onDelete,
  statusMessage,
  children,
}: CellFrameProps) {
  const statusMeta = getStatusMeta(cell.status);
  const typeMeta = getCellTypeMeta(cell);
  const TypeIcon = typeMeta.icon;
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "group/cell relative overflow-hidden rounded-lg border transition-all",
        typeMeta.className,
        isSelected && "ring-1 ring-primary/15 shadow-sm",
      )}
    >
      {/* Collapse, select, and delete row */}
      <div className="relative z-10 flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground"
          aria-label={isCollapsed ? "Expand cell" : "Collapse cell"}
          onClick={() => setIsCollapsed((previous) => !previous)}
        >
          {isCollapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>

        <span className="font-mono text-[10px] tabular-nums text-muted-foreground/40">
          {String(cell.position + 1).padStart(2, "0")}
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="sr-only">Status: {cell.status}</span>
          <StatusIcon
            cell={cell}
            className={statusMeta.className}
            statusMessage={statusMessage}
          />
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-pressed={isSelected}
            onClick={onSelect}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <TypeIcon className="size-3" />
              {typeMeta.label}
            </span>
            <span className="hidden min-w-0 truncate text-[11px] text-muted-foreground/55 sm:inline">
              {typeMeta.lineage}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/cell:opacity-100 focus-within:opacity-100">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground/50 hover:text-destructive"
            aria-label="Delete cell"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="relative z-10 px-3 pb-4 pt-0.5">{children}</div>
      )}
    </div>
  );
}

function StatusIcon({ cell, className, statusMessage }: StatusIconProps) {
  const statusMeta = getStatusMeta(cell.status);
  const IconComponent = statusMeta.icon;
  const iconMarkup = (
    <span
      data-status-icon={cell.status}
      className={cn(
        "shrink-0 inline-flex items-center justify-center",
        className,
      )}
      aria-hidden="true"
    >
      <IconComponent
        className={cn("size-3.5", cell.status === "running" && "animate-spin")}
      />
    </span>
  );

  if (cell.status !== "error" || !statusMessage) {
    return iconMarkup;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Show error details"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          {iconMarkup}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 px-3 py-2 text-sm"
        side="bottom"
        align="start"
      >
        {statusMessage}
      </PopoverContent>
    </Popover>
  );
}
