"use client";

import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

function formatExecutionTimeLabel(executionTimeMs: number): string {
  if (executionTimeMs >= 1000) {
    return `${(executionTimeMs / 1000).toFixed(2)}s`;
  }

  return `${Math.round(executionTimeMs)}ms`;
}

export function GeneratedSqlBlock({
  query,
  executionTimeMs,
  rowCount,
  queryType,
  visualizationId,
  onSelectVisualization,
  isSelected = false,
}: {
  query: string;
  executionTimeMs?: number;
  rowCount?: number;
  queryType?: string;
  visualizationId?: string;
  onSelectVisualization?: (visualizationId: string) => void;
  isSelected?: boolean;
}) {
  const hasExecutionTime =
    typeof executionTimeMs === "number" && Number.isFinite(executionTimeMs);
  const hasRowCount = typeof rowCount === "number" && Number.isFinite(rowCount);
  const statusLabel = queryType?.trim() ? queryType.trim() : "Ran query";
  const handleSelectVisualization = () => {
    if (!visualizationId) {
      return;
    }
    onSelectVisualization?.(visualizationId);
  };

  const metadataItems = [
    statusLabel,
    hasExecutionTime ? formatExecutionTimeLabel(executionTimeMs) : null,
    hasRowCount
      ? `${rowCount.toLocaleString()} ${rowCount === 1 ? "row" : "rows"}`
      : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="mt-4 w-full">
      <Collapsible defaultOpen={false} className="w-full">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            onClick={handleSelectVisualization}
            onFocus={handleSelectVisualization}
            aria-pressed={isSelected}
            className={cn(
              "group flex w-full items-center justify-between gap-3 rounded-md border border-border/80 bg-card/70 px-3 py-2 text-left shadow-sm transition-colors hover:bg-accent/40",
              isSelected && "border-primary/60 bg-accent/30",
            )}
            data-selected={isSelected ? "true" : "false"}
          >
            <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Run summary</span>
              {metadataItems.map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-1 w-1 rounded-full bg-muted-foreground/60"
                  />
                  <span>{item}</span>
                </span>
              ))}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground transition-colors group-hover:text-foreground">
              <span className="inline-flex items-center gap-1">
                View SQL
                <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
              </span>
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <pre className="overflow-x-auto rounded-md border border-border bg-card px-3 py-2 font-mono text-sm leading-6 text-foreground">
            <code className="whitespace-pre-wrap wrap-break-word">{query}</code>
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
