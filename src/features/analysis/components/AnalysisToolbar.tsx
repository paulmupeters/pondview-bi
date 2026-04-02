import { Bot, Plus, SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/button";

type AnalysisToolbarProps = {
  onAddAiCell: () => void;
  onAddSqlCell: () => void;
  isBusy: boolean;
};

export function AnalysisToolbar({
  onAddAiCell,
  onAddSqlCell,
  isBusy,
}: AnalysisToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
      <Button onClick={onAddAiCell} disabled={isBusy}>
        <Plus />
        <Bot />
        Add AI cell
      </Button>
      <Button variant="outline" onClick={onAddSqlCell} disabled={isBusy}>
        <Plus />
        <SquareTerminal />
        Add SQL cell
      </Button>
    </div>
  );
}
