import { ChevronRight, Loader2, Play } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { buildDashboardSourceDescriptor } from "@/lib/dashboard/source-descriptor";
import { runQuery } from "@/lib/sql/run-query";
import type { SqlBackend, SqlBackendPreference } from "@/lib/sql/sql-runtime";
import { cn } from "@/lib/utils";

export type SqlPreviewRunResult = {
  columns: { name: string; type?: string }[];
  rows: Record<string, unknown>[];
  durationMs: number;
  backend?: SqlBackend;
  dbIdentifier?: string;
  catalogContext?: string | null;
  sourceDescriptor?: ReturnType<typeof buildDashboardSourceDescriptor>;
};

export type SqlPreviewPanelHandle = {
  insertText: (text: string) => void;
  focus: () => void;
};

type SqlInsertState = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

function needsLeadingSpace(value: string, insertionStart: number): boolean {
  if (insertionStart <= 0) {
    return false;
  }

  const previousCharacter = value[insertionStart - 1];
  return !/\s/.test(previousCharacter);
}

export function insertSqlTextAtSelection(params: {
  value: string;
  text: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
}): SqlInsertState {
  const { value, text, selectionStart, selectionEnd } = params;
  const normalizedStart =
    typeof selectionStart === "number" ? selectionStart : value.length;
  const normalizedEnd =
    typeof selectionEnd === "number" ? selectionEnd : normalizedStart;
  const insertionStart = Math.max(0, Math.min(normalizedStart, value.length));
  const insertionEnd = Math.max(
    insertionStart,
    Math.min(normalizedEnd, value.length),
  );
  const prefix = value.slice(0, insertionStart);
  const suffix = value.slice(insertionEnd);
  const insertedText = `${needsLeadingSpace(value, insertionStart) ? " " : ""}${text}`;
  const nextValue = `${prefix}${insertedText}${suffix}`;
  const nextSelection = prefix.length + insertedText.length;

  return {
    value: nextValue,
    selectionStart: nextSelection,
    selectionEnd: nextSelection,
  };
}

function scheduleCaretSync(callback: () => void) {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }

  setTimeout(callback, 0);
}

export interface SqlPreviewPanelProps {
  query: string;
  dbIdentifier?: string;
  backendPreference?: SqlBackendPreference;
  catalogContext?: string | null;
  defaultOpen?: boolean;
  onQueryChange?: (newSql: string) => void;
  onSave?: (newSql: string) => Promise<void>;
  onRunStart?: () => void;
  onRun?: (result: SqlPreviewRunResult) => void;
  onCancel?: () => void;
}

export const SqlPreviewPanel = forwardRef<
  SqlPreviewPanelHandle,
  SqlPreviewPanelProps
>(function SqlPreviewPanel(
  {
    query,
    dbIdentifier,
    backendPreference,
    catalogContext,
    defaultOpen = false,
    onQueryChange,
    onSave,
    onRunStart,
    onRun,
    onCancel,
  },
  ref,
) {
  const [editedSql, setEditedSql] = useState(query);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunDuration, setLastRunDuration] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setEditedSql(query);
  }, [query]);

  useImperativeHandle(
    ref,
    () => ({
      insertText(text: string) {
        setEditedSql((current) => {
          const textarea = textareaRef.current;
          const nextState = insertSqlTextAtSelection({
            value: current,
            text,
            selectionStart: textarea?.selectionStart,
            selectionEnd: textarea?.selectionEnd,
          });

          scheduleCaretSync(() => {
            const activeTextarea = textareaRef.current;
            if (!activeTextarea) {
              return;
            }

            activeTextarea.focus();
            activeTextarea.setSelectionRange(
              nextState.selectionStart,
              nextState.selectionEnd,
            );
          });

          onQueryChange?.(nextState.value);
          return nextState.value;
        });
      },
      focus() {
        textareaRef.current?.focus();
      },
    }),
    [onQueryChange],
  );

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
        catalogContext,
      });
      setLastRunDuration(result.durationMs);
      onRun?.({
        columns: result.columns,
        rows: result.rows,
        durationMs: result.durationMs,
        backend: result.backend,
        dbIdentifier,
        catalogContext,
        sourceDescriptor: buildDashboardSourceDescriptor({
          runtimeBackend: result.backend,
          dbIdentifier,
          catalogContext,
        }),
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
    <Collapsible defaultOpen={defaultOpen} className="inline-block w-full">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/40",
          )}
        >
          <span className="shrink-0 font-mono text-xs text-muted-foreground transition-colors group-hover:text-foreground">
            <span className="inline-flex items-center gap-1">
              View SQL
              <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            </span>
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        <Textarea
          ref={textareaRef}
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
            if (
              ((event.metaKey || event.ctrlKey) && event.key === "Enter") ||
              (event.shiftKey && event.key === "Enter")
            ) {
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
              Cmd/Ctrl/Shift + Enter to run
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
});
