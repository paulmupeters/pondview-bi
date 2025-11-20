"use client";

import { useEffect, useRef, useState } from "react";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import type { HttpDuckDbConfig } from "@/lib/duckdb/duckdb-node";
import { runQuery } from "@/lib/sql/run-query";
import { cn } from "@/lib/utils";
import { PromptInputTextarea } from "./ai-elements/prompt-input";

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
 * Creates an ExecuteQueryFn that fetches from /api/duckdb/query.
 * Supports both dbIdentifier (for local/MotherDuck) and config (for HTTP DuckDB).
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
};

export type SqlConsoleProps = {
  className?: string;
  historyKey: string;
  historyLimit?: number;
  placeholder?: string;
  selectedDbLabel?: string;
  runButtonLabel?: string;
  stopButtonLabel?: string;
  executeQuery: ExecuteQueryFn;
  onSuccessAction?: (payload: {
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
  }) => void;
  onApiChange?: (api: SqlConsoleApi | null) => void;
  showInlineResults?: boolean;
};

const DEFAULT_PLACEHOLDER =
  "ENTER SQL QUERY... (ENTER to execute, SHIFT+ENTER for newline)";
const DEFAULT_HISTORY_LIMIT = 100;
const DEFAULT_RUN_LABEL = "[RUN |>]";
const DEFAULT_STOP_LABEL = "[STOP X]";

export function SqlConsole({
  className,
  historyKey,
  historyLimit = DEFAULT_HISTORY_LIMIT,
  placeholder = DEFAULT_PLACEHOLDER,
  selectedDbLabel,
  runButtonLabel = DEFAULT_RUN_LABEL,
  stopButtonLabel = DEFAULT_STOP_LABEL,
  executeQuery,
  onSuccessAction,
  onApiChange,
  showInlineResults = true,
}: SqlConsoleProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [sql, setSql] = useState<string>("");
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  useEffect(() => {
    if (!onApiChange) {
      return;
    }

    const api: SqlConsoleApi = {
      insertText: (text: string) => {
        setSql((prev) => {
          const current = prev ?? "";
          const el = textareaRef.current;
          if (!el) {
            return `${current}${text}`;
          }
          const selectionStart = el.selectionStart ?? current.length;
          const selectionEnd = el.selectionEnd ?? current.length;
          const before = current.slice(0, selectionStart);
          const after = current.slice(selectionEnd);
          const next = `${before}${text}${after}`;
          requestAnimationFrame(() => {
            const caret = selectionStart + text.length;
            el.setSelectionRange(caret, caret);
            el.focus();
          });
          return next;
        });
      },
      setQuery: (value: string) => {
        setSql(value);
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (!el) return;
          const caret = value.length;
          el.setSelectionRange(caret, caret);
          el.focus();
        });
      },
      getQuery: () => textareaRef.current?.value ?? "",
      focus: () => {
        textareaRef.current?.focus();
      },
      clearResults: () => {
        setResults(null);
        setError(null);
      },
    };

    // Only update API if it has actually changed (which shouldn't happen often)
    // or rely on a stable ref if we want to avoid this effect re-running.
    // For now, let's just call onApiChange.
    onApiChange(api);

    return () => {
      // We intentionally don't clean up with null here to avoid the parent
      // component seeing a flickering "null" API state during re-renders.
      // Only clear if we're truly unmounting (which this effect cleanup
      // can't distinguish from re-render, but the parent state update loop
      // is likely caused by onApiChange triggering a re-render in parent
      // which re-renders this component, triggering this effect again).
    };
  }, [onApiChange]);

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
    textareaRef.current?.focus();
  }, [historyKey, historyLimit]);

  const persistHistory = (items: string[]) => {
    try {
      localStorage.setItem(
        historyKey,
        JSON.stringify(items.slice(-historyLimit)),
      );
    } catch {
      // ignore storage errors
    }
  };

  const addToHistory = (entry: string) => {
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
  };

  const caretOnFirstLine = (): boolean => {
    const el = textareaRef.current;
    if (!el) return true;
    const pos = el.selectionStart ?? 0;
    return el.value.lastIndexOf("\n", Math.max(0, pos - 1)) === -1;
  };

  const caretOnLastLine = (): boolean => {
    const el = textareaRef.current;
    if (!el) return true;
    const pos = el.selectionStart ?? el.value.length;
    return el.value.indexOf("\n", pos) === -1;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void runQuery();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelRun();
      return;
    }
    if (e.key === "ArrowUp" && caretOnFirstLine()) {
      if (history.length === 0) return;
      e.preventDefault();
      const nextIdx = Math.max(
        0,
        (historyIdx === -1 ? history.length : historyIdx) - 1,
      );
      setHistoryIdx(nextIdx);
      setSql(history[nextIdx] ?? "");
      // Move caret to start
      setTimeout(() => textareaRef.current?.setSelectionRange(0, 0), 0);
      return;
    }
    if (e.key === "ArrowDown" && caretOnLastLine()) {
      if (history.length === 0) return;
      e.preventDefault();
      const base = historyIdx === -1 ? history.length : historyIdx;
      const nextIdx = Math.min(history.length, base + 1);
      setHistoryIdx(nextIdx);
      setSql(history[nextIdx] ?? "");
      return;
    }
  };

  const runQuery = async () => {
    if (isRunning) return;
    setError(null);
    setResults(null);

    const currentSql = sql.trim();
    if (!currentSql) return;
    addToHistory(currentSql);

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    const startedAt = performance.now();

    try {
      const { rows, columns: providedColumns } = await executeQuery({
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
  };

  const cancelRun = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div className="rounded-sm border border-border bg-card transition-colors">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex-1">
            <PromptInputTextarea
              ref={textareaRef}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 min-h-32"
            />
          </div>
          <div className="flex flex-row justify-end gap-2 sm:flex-col sm:items-center sm:px-1">
            {!isRunning && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void runQuery()}
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
                className="text-sm font-mono border-border hover:bg-primary/80 hover:text-primary-foreground hover:border-primary dark:hover:bg-primary/80 dark:hover:text-primary-foreground dark:hover:border-primary"
              >
                {stopButtonLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
      {showInlineResults && results && (
        <div className="border border-border bg-background p-6 rounded-sm">
          <SqlResultsTable dataOverride={results} />
        </div>
      )}
      {error && (
        <div className="border border-destructive/60 bg-destructive/20 px-3 py-2 text-xs text-destructive font-mono rounded-sm dark:border-destructive/60 dark:bg-destructive/20 dark:text-destructive">
          ERROR: {error}
        </div>
      )}
    </div>
  );
}
