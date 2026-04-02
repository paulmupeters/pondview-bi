import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";

type AiCellProps = {
  cell: AnalysisCellState;
};

export function AiCell({ cell }: AiCellProps) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
      {cell.promptText.trim()
        ? "AI cell rebuild lands in phase 5. This cell keeps its prompt draft and structure for now."
        : "AI cell rebuild lands in phase 5. Add SQL cells now, and we will wire transcripts back in next."}
    </div>
  );
}
