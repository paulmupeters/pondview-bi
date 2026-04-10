import { useCallback, useEffect, useRef, useState } from "react";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import type { HttpDuckDbConfig } from "@/lib/api/types/duckdb";
import { quoteString } from "@/lib/duckdb/duckdb-attachments";
import { sanitizeSqlErrorMessage } from "@/lib/sql/error-sanitizer";
import { runQuery } from "@/lib/sql/run-query";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import { cn } from "@/lib/utils";
import {
  type AutocompleteQueryFn,
  type SqlAutocompleteSuggestion,
  SqlCodeEditor,
  type SqlCodeEditorApi,
} from "./sql-code-editor";

export type { AutocompleteQueryFn } from "./sql-code-editor";

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

export type QueryNotice = {
  kind: "error" | "warning";
  message: string;
};

function toQueryNotice(error: unknown): QueryNotice {
  if (error instanceof Error && error.message.trim().length > 0) {
    return {
      kind: error.name === "QueryWarning" ? "warning" : "error",
      message: sanitizeSqlErrorMessage(error.message),
    };
  }

  return {
    kind: "error",
    message: sanitizeSqlErrorMessage(String(error)),
  };
}

export type ExecuteQueryFn = (params: {
  sql: string;
  signal: AbortSignal;
}) => Promise<{
  rows: Record<string, unknown>[];
  columns?: { name: string; type?: string }[];
  backend?: SqlBackend;
  dbIdentifier?: string;
  catalogContext?: string | null;
}>;

export function buildSqlAutocompleteQuery(sql: string): string {
  return `SELECT suggestion, suggestion_start FROM sql_auto_complete(${quoteString(sql)}) LIMIT 1;`;
}

export function parseSqlAutocompleteSuggestion(
  row: Record<string, unknown> | undefined,
): SqlAutocompleteSuggestion | null {
  if (!row) {
    return null;
  }

  const suggestion =
    typeof row.suggestion === "string" ? row.suggestion : undefined;
  const rawSuggestionStart = row.suggestion_start;
  const suggestionStart =
    typeof rawSuggestionStart === "number"
      ? rawSuggestionStart
      : typeof rawSuggestionStart === "bigint"
        ? Number(rawSuggestionStart)
        : typeof rawSuggestionStart === "string"
          ? Number.parseInt(rawSuggestionStart, 10)
          : Number.NaN;

  if (
    !suggestion ||
    !Number.isInteger(suggestionStart) ||
    suggestionStart < 0
  ) {
    return null;
  }

  return {
    suggestion,
    suggestionStart,
  };
}

export function createSqlExecuteQuery(options: {
  dbIdentifier?: string;
  config?: HttpDuckDbConfig;
}): ExecuteQueryFn {
  return async ({ sql, signal }) => {
    const { rows, columns, backend } = await runQuery({
      sql,
      config: options.config,
      dbIdentifier: options.dbIdentifier,
      signal,
    });

    return {
      rows,
      columns,
      backend,
      dbIdentifier: options.dbIdentifier,
      catalogContext: null,
    };
  };
}

// Backward-compatible alias for existing callers.
export const createDuckDbExecuteQuery = createSqlExecuteQuery;

export function createSqlAutocompleteAction(
  options: {
    dbIdentifier?: string;
    config?: HttpDuckDbConfig;
    catalogContext?: string | null;
  },
  deps: {
    runSqlQuery?: typeof runQuery;
  } = {},
): AutocompleteQueryFn {
  let isDisabled = false;
  const runSqlQuery = deps.runSqlQuery ?? runQuery;

  return async ({ sql, signal }) => {
    if (isDisabled) {
      return null;
    }

    try {
      await runSqlQuery({
        sql: "LOAD autocomplete;",
        config: options.config,
        dbIdentifier: options.dbIdentifier,
        catalogContext: options.catalogContext,
        signal,
      });

      const result = await runSqlQuery({
        sql: buildSqlAutocompleteQuery(sql),
        config: options.config,
        dbIdentifier: options.dbIdentifier,
        catalogContext: options.catalogContext,
        signal,
      });

      return parseSqlAutocompleteSuggestion(result.rows[0]);
    } catch {
      isDisabled = true;
      return null;
    }
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
  editorMinHeight?: string;
  editorMaxHeight?: string;
  runButtonLabel?: string;
  stopButtonLabel?: string;
  executeQueryAction: ExecuteQueryFn;
  autocompleteAction?: AutocompleteQueryFn;
  onSuccessAction?: (payload: {
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
    backend?: SqlBackend;
    dbIdentifier?: string;
    catalogContext?: string | null;
  }) => void;
  onApiChangeAction?: (api: SqlConsoleApi | null) => void;
  onQueryChangeAction?: (sql: string) => void;
  onNoticeAction?: (notice: QueryNotice | null) => void;
  onRunStateChangeAction?: (isRunning: boolean) => void;
  onCancelQueryAction?: () => Promise<void> | void;
  showInlineResults?: boolean;
  showRunControls?: boolean;
};

const DEFAULT_PLACEHOLDER = "ENTER SQL QUERY...";
const DEFAULT_HISTORY_LIMIT = 100;
const DEFAULT_RUN_LABEL = "▶ RUN";
const DEFAULT_STOP_LABEL = "⏹ STOP";

export function SqlConsole({
  className,
  historyKey,
  historyLimit = DEFAULT_HISTORY_LIMIT,
  placeholder = DEFAULT_PLACEHOLDER,
  editorMinHeight = "8rem",
  editorMaxHeight,
  runButtonLabel = DEFAULT_RUN_LABEL,
  stopButtonLabel = DEFAULT_STOP_LABEL,
  executeQueryAction,
  autocompleteAction,
  onSuccessAction,
  onApiChangeAction,
  onQueryChangeAction,
  onNoticeAction,
  onRunStateChangeAction,
  onCancelQueryAction,
  showInlineResults = true,
  showRunControls = true,
}: SqlConsoleProps) {
  const editorRef = useRef<SqlCodeEditorApi | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [sql, setSql] = useState<string>("");
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [notice, setNotice] = useState<QueryNotice | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const latestSqlRef = useRef(sql);

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
    setNotice(null);
    setResults(null);

    const currentSql = sql.trim();
    if (!currentSql) return;
    addToHistory(currentSql);

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    const startedAt = performance.now();

    try {
      const {
        rows,
        columns: providedColumns,
        backend,
        dbIdentifier,
        catalogContext,
      } = await executeQueryAction({
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
      onSuccessAction?.({
        sql: currentSql,
        rows,
        columns,
        durationMs: duration,
        backend,
        dbIdentifier,
        catalogContext,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setNotice({
          kind: "warning",
          message: "Query cancelled",
        });
      } else {
        setNotice(toQueryNotice(err));
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
    if (onCancelQueryAction) {
      void Promise.resolve(onCancelQueryAction()).catch(() => {
        // Best effort cancel; local abort already stops the UI request.
      });
    }
  };

  const runQueryRef = useRef<() => void>(() => {});
  useEffect(() => {
    runQueryRef.current = () => {
      void handleRunQuery();
    };
  }, [handleRunQuery]);

  // Use refs for callbacks so these effects only fire when the actual state
  // changes, not when a parent re-creates a callback reference. Without this,
  // changing `cell.sqlDraft` (which recreates `handleQueryChange` in SqlCell)
  // would cause SqlConsole to call onQueryChangeAction with stale editor
  // content, overwriting the new sqlDraft and creating a toggle loop.
  const onQueryChangeActionRef = useRef(onQueryChangeAction);
  const onNoticeActionRef = useRef(onNoticeAction);
  const onRunStateChangeActionRef = useRef(onRunStateChangeAction);
  onQueryChangeActionRef.current = onQueryChangeAction;
  onNoticeActionRef.current = onNoticeAction;
  onRunStateChangeActionRef.current = onRunStateChangeAction;

  useEffect(() => {
    latestSqlRef.current = sql;
    onQueryChangeActionRef.current?.(sql);
  }, [sql]);

  useEffect(() => {
    onNoticeActionRef.current?.(notice);
  }, [notice]);

  useEffect(() => {
    onRunStateChangeActionRef.current?.(isRunning);
  }, [isRunning]);

  const apiRef = useRef<SqlConsoleApi | null>(null);
  if (apiRef.current === null) {
    apiRef.current = {
      insertText: (text: string) => {
        editorRef.current?.insertText(text);
      },
      setQuery: (value: string) => {
        setSql(value);
        editorRef.current?.setValue(value);
      },
      getQuery: () => editorRef.current?.getValue() ?? latestSqlRef.current,
      focus: () => {
        editorRef.current?.focus();
      },
      clearResults: () => {
        setResults(null);
        setNotice(null);
      },
      runQuery: () => runQueryRef.current(),
    };
  }

  useEffect(() => {
    if (!onApiChangeAction || !apiRef.current) {
      return;
    }

    onApiChangeAction(apiRef.current);
  }, [onApiChangeAction]);

  return (
    <div
      className={cn(
        "flex w-full min-w-0 h-full flex-col gap-3 p-0 py-4 relative",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col rounded-sm bg-card transition-colors">
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-3 p-0 bg-background",
            showRunControls && "sm:flex-row sm:items-center sm:gap-4",
          )}
        >
          <div
            className={cn(
              "flex min-h-0 flex-1 min-w-0 flex-col gap-2 bg-background",
              showRunControls && "mt-12",
            )}
          >
            <SqlCodeEditor
              ref={editorRef}
              value={sql}
              onChange={setSql}
              autocompleteAction={autocompleteAction}
              placeholder={placeholder}
              minHeight={editorMinHeight}
              maxHeight={editorMaxHeight}
              autoFocus
              onRunQuery={() => void handleRunQuery()}
              onCancel={cancelRun}
              onHistoryPrev={handleHistoryPrev}
              onHistoryNext={handleHistoryNext}
              className="flex-1 bg-background"
            />
            <div className="text-[11px] p-2 text-muted-foreground">
              Shift + Enter to run
            </div>
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
        <div className="border border-border bg-background rounded-sm min-w-0 overflow-hidden flex-1 min-h-0">
          <SqlResultsTable dataOverride={results} pageSize={50} expandable />
        </div>
      )}
      {notice && (
        <div
          className={cn(
            "px-3 py-2 text-xs font-mono rounded-sm z-20",
            notice.kind === "warning"
              ? "border border-amber-500/60 bg-amber-500/15 text-amber-900 dark:text-amber-200"
              : "border border-destructive/60 bg-destructive/20 text-destructive dark:border-destructive/60 dark:bg-destructive/20 dark:text-destructive",
          )}
        >
          {notice.kind === "warning" ? "WARNING" : "ERROR"}: {notice.message}
        </div>
      )}
    </div>
  );
}
