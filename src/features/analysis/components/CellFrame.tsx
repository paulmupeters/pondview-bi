import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  Loader2,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
        className: "text-muted-foreground",
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
        className: "text-muted-foreground",
      };
  }
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
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <Card
      className={cn(
        "gap-0 py-0 transition-colors",
        isSelected && "border-primary/30 ring-primary/15 ring-2",
      )}
    >
      <CardHeader className="grid-rows-[auto] items-center gap-0 px-4 py-1 pb-0">
        <div className="flex min-w-0 w-full items-center gap-2">
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={isCollapsed ? "Expand cell" : "Collapse cell"}
            onClick={() => setIsCollapsed((previous) => !previous)}
          >
            {isCollapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
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
              <CardTitle className="shrink-0 font-thin text-sm">
                {cell.kind === "text" ? "Text" : "Cell"} {cell.position + 1}
              </CardTitle>
            </button>
          </div>
        </div>
        <CardAction className="row-span-1 flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Delete cell"
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </CardAction>
      </CardHeader>
      {!isCollapsed && (
        <CardContent className="px-4 pt-1 pb-4">{children}</CardContent>
      )}
    </Card>
  );
}

function StatusIcon({ cell, className, statusMessage }: StatusIconProps) {
  const statusMeta = getStatusMeta(cell.status);
  const IconComponent = statusMeta.icon;
  const iconMarkup = (
    <span
      data-status-icon={cell.status}
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <IconComponent
        className={cn("size-4", cell.status === "running" && "animate-spin")}
      />
    </span>
  );

  if (cell.status !== "error" || !statusMessage) {
    return iconMarkup;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
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
        </span>
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
