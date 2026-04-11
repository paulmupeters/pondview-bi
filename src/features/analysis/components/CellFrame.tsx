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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import { cn } from "@/lib/utils";

type CellFrameProps = {
  cell: AnalysisCellState;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  children: ReactNode;
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
  children,
}: CellFrameProps) {
  const statusMeta = getStatusMeta(cell.status);
  const StatusIcon = statusMeta.icon;
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
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-pressed={isSelected}
            onClick={onSelect}
          >
            <span className="sr-only">Status: {cell.status}</span>
            <span
              data-status-icon={cell.status}
              className={cn("shrink-0", statusMeta.className)}
              aria-hidden="true"
            >
              <StatusIcon
                className={cn(
                  "size-4",
                  cell.status === "running" && "animate-spin",
                )}
              />
            </span>
            <CardTitle className="shrink-0 font-thin text-sm">
              {cell.kind === "text" ? "Text" : "Cell"} {cell.position + 1}
            </CardTitle>
          </button>
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
