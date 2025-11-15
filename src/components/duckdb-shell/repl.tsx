"use client";

import { useEffect, useRef, useState } from "react";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import type { HttpDuckDbConfig } from "@/lib/duckdb/duckdb-node";
import { cn } from "@/lib/utils";

type DuckdbReplProps = {
  className?: string;
  httpConfig?: HttpDuckDbConfig;
};

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

const HISTORY_KEY = "bi.repl.history";
const HISTORY_LIMIT = 100;

export function DuckdbRepl({ className, httpConfig }: DuckdbReplProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [sql, setSql] = useState<string>("");
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [ranMs, setRanMs] = useState<number | null>(null);

  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(HISTORY_KEY) || "[]",
      ) as string[];
      if (Array.isArray(stored)) {
        setHistory(stored.slice(-HISTORY_LIMIT));
        setHistoryIdx(stored.length);
      }
    } catch {
      // ignore parse errors
    }
    // Autofocus
    textareaRef.current?.focus();
  }, []);

  const persistHistory = (items: string[]) => {
    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(items.slice(-HISTORY_LIMIT)),
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
        last === trimmed ? prev : [...prev, trimmed].slice(-HISTORY_LIMIT);
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
      // Move caret to end
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
    setRanMs(null);
    setResults(null);

    const currentSql = sql.trim();
    if (!currentSql) return;
    addToHistory(currentSql);

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    const startedAt = performance.now();

    try {
      const response = await fetch("/api/duckdb/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sql: currentSql,
          config: httpConfig,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { rows: Record<string, unknown>[] };
      const rows = data.rows;
      const columns = Object.keys(rows[0] ?? {}).map((name) => ({ name }));
      const duration = Math.max(0, Math.round(performance.now() - startedAt));
      setRanMs(duration);
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

  const clearInput = () => {
    setSql("");
    setError(null);
    setResults(null);
    setRanMs(null);
    setHistoryIdx(history.length);
    textareaRef.current?.focus();
  };

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div className="shadow-sm border-border border-1 bg-card/50 rounded-sm">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="text-xs terminal-text">
            {isRunning ? "RUNNING…" : ranMs != null ? `${ranMs} ms` : "READY"}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runQuery()}
              disabled={isRunning}
              className="text-xs font-mono border-border hover:bg-primary/20 hover:terminal-glow hover:border-primary"
            >
              [RUN]
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={cancelRun}
              disabled={!isRunning}
              className="text-xs font-mono border-border hover:bg-primary/20 hover:terminal-glow hover:border-primary"
            >
              [STOP]
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearInput}
              className="text-xs font-mono hover:text-primary hover:bg-primary/10"
            >
              [CLR]
            </Button>
          </div>
        </div>
        <div className="p-0">
          <textarea
            ref={textareaRef}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ENTER SQL QUERY... (ENTER to execute, SHIFT+ENTER for newline)"
            className="min-h-32 w-full resize-y p-4 font-mono text-sm outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary bg-card"
          />
          {error && (
            <div className="mt-2 border border-destructive/60 bg-destructive/20 px-3 py-2 text-xs text-destructive font-mono rounded-sm">
              ERROR: {error}
            </div>
          )}
        </div>
      </div>

      {results && (
        <div className="border border-border bg-background p-6 rounded-sm">
          <SqlResultsTable dataOverride={results} />
        </div>
      )}
    </div>
  );
}
