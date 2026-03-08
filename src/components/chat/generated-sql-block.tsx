import { Loader2, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useArtifactMutation } from "@/components/artifact-mutation-context";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { runQuery } from "@/lib/sql/run-query";
import type { Result } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatExecutionTimeLabel(executionTimeMs: number): string {
  if (executionTimeMs >= 1000) {
    return `${(executionTimeMs / 1000).toFixed(2)}s`;
  }

  return `${Math.round(executionTimeMs)}ms`;
}

function normalizeRows(rows: Record<string, unknown>[]): Result[] {
  return rows.map((row) => {
    const normalized: Result = {};
    Object.entries(row).forEach(([key, value]) => {
      if (value instanceof Date) {
        normalized[key] = value;
        return;
      }
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        normalized[key] = value;
        return;
      }
      if (value === null || value === undefined) {
        normalized[key] = "";
        return;
      }
      normalized[key] = JSON.stringify(value);
    });
    return normalized;
  });
}

export function GeneratedSqlBlock({
  query,
  executionTimeMs,
  rowCount,
  queryType,
  visualizationId,
  artifactId,
  dbIdentifier,
  payload,
  onSelectVisualization,
  isSelected = false,
}: {
  query: string;
  executionTimeMs?: number;
  rowCount?: number;
  queryType?: string;
  visualizationId?: string;
  artifactId?: string;
  dbIdentifier?: string;
  payload?: SqlAnalysisData | null;
  onSelectVisualization?: (visualizationId: string) => void;
  isSelected?: boolean;
}) {
  const { updateArtifactPayload } = useArtifactMutation();
  const [editableQuery, setEditableQuery] = useState(query);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    setEditableQuery(query);
  }, [query]);

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

  const handleRunQuery = async () => {
    const nextQuery = editableQuery.trim();
    if (!nextQuery) {
      setRunError("SQL query is required.");
      return;
    }

    if (!artifactId) {
      setRunError("Unable to update this SQL artifact.");
      return;
    }

    setRunError(null);
    setIsRunning(true);
    handleSelectVisualization();

    try {
      const result = await runQuery({
        sql: nextQuery,
        dbIdentifier,
      });

      const normalizedRows = normalizeRows(result.rows);
      const nextRowCount = normalizedRows.length;
      const nextQueryType = nextQuery.split(/\s+/)[0]?.toUpperCase() ?? "QUERY";
      const nextVisualType =
        nextRowCount === 1 && result.columns.length === 1 ? "card" : "table";
      const insights =
        nextRowCount === 0
          ? ["Query executed successfully but returned no results"]
          : [
              `Query returned ${nextRowCount} row${
                nextRowCount === 1 ? "" : "s"
              }`,
            ];

      await updateArtifactPayload(artifactId, (currentPayload) => ({
        ...(payload ?? currentPayload ?? {}),
        stage: "complete",
        progress: 1,
        query: nextQuery,
        dbIdentifier:
          dbIdentifier ?? payload?.dbIdentifier ?? currentPayload?.dbIdentifier,
        executionTime: result.durationMs,
        rowCount: nextRowCount,
        columns: result.columns,
        rows: normalizedRows,
        visualType: nextVisualType,
        chartConfig: undefined,
        cardConfig: undefined,
        tableConfig: undefined,
        summary: {
          totalRows: nextRowCount,
          executionTimeMs: result.durationMs,
          queryType: nextQueryType,
          insights,
        },
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Query execution failed.";
      setRunError(message);
    } finally {
      setIsRunning(false);
    }
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
            onClick={(event) => {
              event.stopPropagation();
              handleSelectVisualization();
            }}
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
                Edit SQL
                <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
              </span>
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <Textarea
            value={editableQuery}
            onChange={(event) => setEditableQuery(event.target.value)}
            className="min-h-[140px] w-full font-mono text-sm"
            placeholder="SELECT * FROM ..."
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                if (!isRunning) {
                  void handleRunQuery();
                }
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              Cmd/Ctrl + Enter to run
            </span>
            <Button
              type="button"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                void handleRunQuery();
              }}
              disabled={isRunning}
            >
              {isRunning ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running
                </span>
              ) : (
                "Run"
              )}
            </Button>
          </div>
          {runError ? (
            <p className="text-xs text-destructive">{runError}</p>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
