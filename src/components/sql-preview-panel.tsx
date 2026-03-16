import { ChevronRight, Loader2, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { runQuery } from "@/lib/sql/run-query";
import type { SqlBackendPreference } from "@/lib/sql/sql-runtime";
import { cn } from "@/lib/utils";

export type SqlPreviewRunResult = {
  columns: { name: string; type?: string }[];
  rows: Record<string, unknown>[];
  durationMs: number;
};

export interface SqlPreviewPanelProps {
  query: string;
  dbIdentifier?: string;
  backendPreference?: SqlBackendPreference;
  onQueryChange?: (newSql: string) => void;
  onSave?: (newSql: string) => Promise<void>;
  onRunStart?: () => void;
  onRun?: (result: SqlPreviewRunResult) => void;
  onCancel?: () => void;
}

export function SqlPreviewPanel({
  query,
  dbIdentifier,
  backendPreference,
  onQueryChange,
  onSave,
  onRunStart,
  onRun,
  onCancel,
}: SqlPreviewPanelProps) {
  const [editedSql, setEditedSql] = useState(query);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunDuration, setLastRunDuration] = useState<number | null>(null);

  useEffect(() => {
    setEditedSql(query);
  }, [query]);

  const handleRun = async () => {
    const trimmed = editedSql.trim();
    if (!trimmed || isRunning) return;

    setError(null);
    setIsRunning(true);
    setLastRunDuration(null);
    onRunStart?.();

    try {
      const result = await runQuery({
        sql: trimmed,
        dbIdentifier,
        backendPreference,
      });
      setLastRunDuration(result.durationMs);
      onRun?.({
        columns: result.columns,
        rows: result.rows,
        durationMs: result.durationMs,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Query execution failed.";
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSave = async () => {
    if (!onSave || editedSql === query) return;

    setError(null);
    setIsSaving(true);

    try {
      await onSave(editedSql);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save SQL.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedSql(query);
    setError(null);
    setLastRunDuration(null);
    onCancel?.();
  };

  const isBusy = isSaving || isRunning;
  const hasChanges = editedSql !== query;

  return (
    <Collapsible defaultOpen={false} className="inline-block w-full">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/40",
          )}
        >
          <span className="shrink-0 font-mono text-xs text-muted-foreground transition-colors group-hover:text-foreground">
            <span className="inline-flex items-center gap-1">
              View / Edit SQL
              <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            </span>
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        <Textarea
          value={editedSql}
          onChange={(event) => {
            const nextSql = event.target.value;
            setEditedSql(nextSql);
            onQueryChange?.(nextSql);
          }}
          readOnly={!onSave}
          className={cn(
            "min-h-35 font-mono text-sm",
            !onSave && "cursor-default opacity-80",
          )}
          placeholder="SELECT * FROM ..."
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              if (!isBusy) {
                void handleRun();
              }
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              Cmd/Ctrl + Enter to run
            </span>
            {lastRunDuration !== null && (
              <span className="text-[11px] text-muted-foreground">
                {Math.round(lastRunDuration)}ms
              </span>
            )}
            {hasChanges && onSave && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                unsaved changes — save to persist
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onSave && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isBusy}
              >
                Cancel
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRun()}
              disabled={isBusy || !editedSql.trim()}
            >
              {isRunning ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Running
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Play className="h-3 w-3" />
                  Run
                </span>
              )}
            </Button>
            {onSave && (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSave()}
                disabled={!hasChanges || isBusy}
              >
                {isSaving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  "Save"
                )}
              </Button>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}
