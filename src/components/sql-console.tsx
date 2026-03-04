import { useCallback, useEffect, useRef, useState } from "react";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import type { HttpDuckDbConfig } from "@/lib/api/types/duckdb";
import { cancelBridgeQuery } from "@/lib/bridge/pondview-bridge";
import { runQuery } from "@/lib/sql/run-query";
import { cn } from "@/lib/utils";
import { SqlCodeEditor, type SqlCodeEditorApi } from "./sql-code-editor";

type ResultsPayload = {
  stage: "complete";
  columns: { name: string; type?: string }[];
  rows: Record<string, unknown>[];
  summary?: {
    totalRows: number;
    executionTimeMs?: number;
    insights: string[];
    queryType?: string;
  };
};

export type ExecuteQueryFn = (params: {
  sql: string;
  signal: AbortSignal;
}) => Promise<{
  rows: Record<string, unknown>[];
  columns?: { name: string; type?: string }[];
}>;

/**
 * Creates an ExecuteQueryFn backed by the Pondview bridge.
 * Keeps config/dbIdentifier options for compatibility with existing callers.
 */
export function createDuckDbExecuteQuery(options: {
  dbIdentifier?: string;
  config?: HttpDuckDbConfig;
}): ExecuteQueryFn {
  return async ({ sql, signal }) => {
    const { rows, columns } = await runQuery({
      sql,
      config: options.config,
      dbIdentifier: options.dbIdentifier,
      signal,
    });

    return { rows, columns };
  };
}

export type SqlConsoleApi = {
  /**
   * Inserts text at the current caret position (or at the end if unfocused).
   */
  insertText: (text: string) => void;
  /**
   * Replaces the entire SQL buffer with the provided value.
   */
  setQuery: (sql: string) => void;
  /**
   * Returns the current SQL buffer.
   */
  getQuery: () => string;
  /**
   * Focuses the textarea without modifying content.
   */
  focus: () => void;
  /**
   * Clears the executed results and error messages.
   */
  clearResults: () => void;
  /**
   * Runs the current query programmatically.
   */
  runQuery: () => void;
};

export type SqlConsoleProps = {
  className?: string;
  historyKey: string;
  historyLimit?: number;
  placeholder?: string;
  runButtonLabel?: string;
  stopButtonLabel?: string;
  executeQueryAction: ExecuteQueryFn;
  onSuccessAction?: (payload: {
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
  }) => void;
  onApiChangeAction?: (api: SqlConsoleApi | null) => void;
  showInlineResults?: boolean;
  showRunControls?: boolean;
};

const DEFAULT_PLACEHOLDER =
  "ENTER SQL QUERY...";
const DEFAULT_HISTORY_LIMIT = 100;
const DEFAULT_RUN_LABEL = "▶ RUN";
const DEFAULT_STOP_LABEL = "⏹ STOP";

export function SqlConsole({
  className,
  historyKey,
  historyLimit = DEFAULT_HISTORY_LIMIT,
  placeholder = DEFAULT_PLACEHOLDER,
  runButtonLabel = DEFAULT_RUN_LABEL,
  stopButtonLabel = DEFAULT_STOP_LABEL,
  executeQueryAction,
  onSuccessAction,
  onApiChangeAction,
  showInlineResults = true,
  showRunControls = true,
}: SqlConsoleProps) {
  const editorRef = useRef<SqlCodeEditorApi | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [sql, setSql] = useState<string>("");
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);

  useEffect(() => {
    try {
      const storedRaw = localStorage.getItem(historyKey) || "[]";
      const stored = JSON.parse(storedRaw) as string[];
      if (Array.isArray(stored)) {
        const trimmed = stored.slice(-historyLimit);
        setHistory(trimmed);
        setHistoryIdx(trimmed.length);
      }
    } catch {
      // ignore parse errors
    }
    editorRef.current?.focus();
  }, [historyKey, historyLimit]);

  const persistHistory = useCallback(
    (items: string[]) => {
      try {
        localStorage.setItem(
          historyKey,
          JSON.stringify(items.slice(-historyLimit)),
        );
      } catch {
        // ignore storage errors
      }
    },
    [historyKey, historyLimit],
  );

  const addToHistory = useCallback(
    (entry: string) => {
      const trimmed = entry.trim();
      if (!trimmed) return;
      setHistory((prev) => {
        const last = prev[prev.length - 1];
        const next =
          last === trimmed ? prev : [...prev, trimmed].slice(-historyLimit);
        persistHistory(next);
        setHistoryIdx(next.length);
        return next;
      });
    },
    [historyLimit, persistHistory],
  );

  // History navigation handlers for CodeMirror
  const handleHistoryPrev = useCallback(() => {
    if (history.length === 0) return;
    const nextIdx = Math.max(
      0,
      (historyIdx === -1 ? history.length : historyIdx) - 1,
    );
    setHistoryIdx(nextIdx);
    setSql(history[nextIdx] ?? "");
  }, [history, historyIdx]);

  const handleHistoryNext = useCallback(() => {
    if (history.length === 0) return;
    const base = historyIdx === -1 ? history.length : historyIdx;
    const nextIdx = Math.min(history.length, base + 1);
    setHistoryIdx(nextIdx);
    setSql(history[nextIdx] ?? "");
  }, [history, historyIdx]);

  const handleRunQuery = useCallback(async () => {
    if (isRunning) return;
    setError(null);
    setResults(null);

    const currentSql = sql.trim();
    console.log("sql", currentSql)
    if (!currentSql) return;
    addToHistory(currentSql);

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    const startedAt = performance.now();

    try {
      const { rows, columns: providedColumns } = await executeQueryAction({
        sql: currentSql,
        signal: controller.signal,
      });
      const columns =
        providedColumns ?? Object.keys(rows[0] ?? {}).map((name) => ({ name }));
      const duration = Math.max(0, Math.round(performance.now() - startedAt));
      setResults({
        stage: "complete",
        columns,
        rows,
        summary: {
          totalRows: rows.length,
          executionTimeMs: duration,
          insights: [],
        },
      });
      onSuccessAction?.({ sql: currentSql, rows, columns, durationMs: duration });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setError("Query cancelled");
      } else {
        setError((err as Error).message || String(err));
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [addToHistory, executeQueryAction, isRunning, onSuccessAction, sql]);

  const cancelRun = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    void cancelBridgeQuery().catch(() => {
      // Best effort cancel; local abort already stops the UI request.
    });
  };

  const runQueryRef = useRef<() => void>(() => { });
  useEffect(() => {
    runQueryRef.current = () => {
      void handleRunQuery();
    };
  }, [handleRunQuery]);

  useEffect(() => {
    if (!onApiChangeAction) {
      return;
    }

    const api: SqlConsoleApi = {
      insertText: (text: string) => {
        editorRef.current?.insertText(text);
      },
      setQuery: (value: string) => {
        setSql(value);
        editorRef.current?.setValue(value);
      },
      getQuery: () => editorRef.current?.getValue() ?? sql,
      focus: () => {
        editorRef.current?.focus();
      },
      clearResults: () => {
        setResults(null);
        setError(null);
      },
      runQuery: () => runQueryRef.current(),
    };

    onApiChangeAction(api);

    return () => {
      // Intentionally not cleaning up to avoid flickering null API state
    };
  }, [onApiChangeAction, sql]);


  return (
    <div className={cn("flex w-full min-w-0 h-full flex-col gap-3 p-0 py-4 relative", className)}>
      <div className="rounded-sm bg-card transition-colors h-full">
        <div className="flex flex-col gap-3 p-0 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2 mt-12">
            <SqlCodeEditor
              ref={editorRef}
              value={sql}
              onChange={setSql}
              placeholder={placeholder}
              minHeight="8rem"
              autoFocus
              onRunQuery={() => void handleRunQuery()}
              onCancel={cancelRun}
              onHistoryPrev={handleHistoryPrev}
              onHistoryNext={handleHistoryNext}
              className="flex-1"
            />
          </div>
          {showRunControls && (
          <div className="flex flex-row justify-end gap-2 sm:flex-col sm:items-center sm:px-1 absolute top-2 right-1">
            {!isRunning && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRunQuery()}
                disabled={isRunning}
                className="text-sm font-mono border-border hover:bg-primary/80 hover:text-primary-foreground hover:border-primary dark:hover:bg-primary/80 dark:hover:text-primary-foreground dark:hover:border-primary"
              >
                {runButtonLabel}
              </Button>
            )}
            {isRunning && (
              <Button
                size="sm"
                variant="outline"
                onClick={cancelRun}
                disabled={!isRunning}
                className="text-sm font-mono bg-primary text-primary-foreground border-border hover:bg-primary/80 hover:text-primary-foreground hover:border-primary dark:hover:bg-primary/80 dark:hover:text-primary-foreground dark:hover:border-primary"
              >
                {stopButtonLabel}
              </Button>
            )}
          </div>
          )} 
        </div>
      </div>
      {showInlineResults && results && (
        <div className="border border-border bg-background p-6 rounded-sm">
          <SqlResultsTable dataOverride={results} />
        </div>
      )}
      {error && (
        <div className="border border-destructive/60 bg-destructive/20 px-3 py-2 text-xs text-destructive font-mono rounded-sm dark:border-destructive/60 dark:bg-destructive/20 dark:text-destructive z-20">
          ERROR: {error}
        </div>
      )}
    </div>
  );
}
