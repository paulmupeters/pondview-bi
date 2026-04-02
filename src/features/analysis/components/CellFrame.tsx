import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
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
  onToggleAi: () => void;
  onToggleSql: () => void;
  children: ReactNode;
};

function getCellPreview(cell: AnalysisCellState): string {
  if (cell.sqlDraft?.trim()) {
    return cell.sqlDraft?.trim() || "Empty SQL cell";
  }

  if (cell.promptText.trim()) {
    return cell.promptText.trim();
  }

  if (cell.aiEnabled && !cell.sqlEnabled) {
    return "Empty AI cell";
  }

  if (cell.sqlEnabled && !cell.aiEnabled) {
    return "Empty SQL cell";
  }

  return "Empty analysis cell";
}

export function CellFrame({
  cell,
  isSelected,
  onSelect,
  onDelete,
  onToggleAi,
  onToggleSql,
  children,
}: CellFrameProps) {
  return (
    <Card
      className={cn(
        "gap-4 py-4 transition-colors",
        isSelected && "border-primary ring-primary/15 ring-4",
      )}
    >
      <CardHeader className="gap-3 px-4 pb-0">
        <button
          type="button"
          className="flex w-full flex-col items-start gap-3 text-left"
          aria-pressed={isSelected}
          onClick={onSelect}
        >
          <div className="flex items-center gap-2">
            <Badge variant={cell.aiEnabled ? "default" : "outline"}>AI</Badge>
            <Badge variant={cell.sqlEnabled ? "secondary" : "outline"}>
              SQL
            </Badge>
            <Badge variant="outline">{cell.status}</Badge>
          </div>
          <CardTitle className="text-base">Cell {cell.position + 1}</CardTitle>
          <CardDescription className="line-clamp-2">
            {getCellPreview(cell)}
          </CardDescription>
        </button>
        <CardAction className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={cell.aiEnabled ? "default" : "outline"}
            onClick={onToggleAi}
          >
            AI
          </Button>
          <Button
            type="button"
            size="sm"
            variant={cell.sqlEnabled ? "default" : "outline"}
            onClick={onToggleSql}
          >
            SQL
          </Button>
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
      <CardContent className="px-4 pt-0">{children}</CardContent>
    </Card>
  );
}
