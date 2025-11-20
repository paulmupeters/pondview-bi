"use client";

import { PlusCircleIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import {
  createDuckDbExecuteQuery,
  type ExecuteQueryFn,
  SqlConsole,
  type SqlConsoleApi,
} from "@/components/sql-console";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { HttpDuckDbConfig } from "@/lib/duckdb/duckdb-node";
import type { Result } from "@/lib/types";

type DuckdbReplProps = {
  className?: string;
  httpConfig?: HttpDuckDbConfig;
  selectedDbLabel?: string;
  selectedDbIdentifier?: string;
  onRunSqlAction?: (params: {
    sql: string;
    dbIdentifier?: string;
    signal: AbortSignal;
  }) => ReturnType<ExecuteQueryFn>;
  onConsoleApiChangeAction?: (api: SqlConsoleApi | null) => void;
  onAddToChatAction?: (payload: SqlAnalysisData) => void;
  inlineResults?: boolean;
  onResultChangeAction?: (result: {
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
  } | null) => void;
};

const HISTORY_KEY = "bi.repl.history";

export function DuckdbRepl({
  className,
  httpConfig,
  selectedDbLabel,
  selectedDbIdentifier,
  onRunSqlAction,
  onConsoleApiChangeAction,
  onAddToChatAction,
  inlineResults = true,
  onResultChangeAction,
}: DuckdbReplProps) {
  const [lastResult, setLastResult] = useState<{
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
  } | null>(null);
  const [hasShared, setHasShared] = useState(false);
  const [internalApi, setInternalApi] = useState<SqlConsoleApi | null>(null);

  const executeQuery: ExecuteQueryFn = async ({ sql, signal }) => {
    if (onRunSqlAction) {
      return onRunSqlAction({ sql, dbIdentifier: selectedDbIdentifier, signal });
    }

    return createDuckDbExecuteQuery({
      dbIdentifier: selectedDbIdentifier,
      config: httpConfig,
    })({ sql, signal });
  };

  const handleShareResult = useCallback(() => {
    if (!onAddToChatAction || !lastResult) {
      return;
    }
    const payload: SqlAnalysisData = {
      stage: "complete",
      progress: 1,
      query: lastResult.sql,
      dbIdentifier: selectedDbIdentifier,
      executionTime: lastResult.durationMs,
      rowCount: lastResult.rows.length,
      columns: lastResult.columns,
      rows: lastResult.rows as Result[],
      visualType: "table",
      summary: {
        totalRows: lastResult.rows.length,
        executionTimeMs: lastResult.durationMs,
        insights: [],
      },
    };

    onAddToChatAction(payload);
    setHasShared(true);
  }, [lastResult, onAddToChatAction, selectedDbIdentifier]);

  const canShare = Boolean(onAddToChatAction && lastResult && !hasShared);

  // Propagate result changes to parent when inlineResults is false
  useEffect(() => {
    if (!inlineResults && onResultChangeAction) {
      onResultChangeAction(lastResult);
    }
  }, [lastResult, inlineResults, onResultChangeAction]);

  useEffect(() => {
    if (internalApi && onConsoleApiChangeAction) {
      onConsoleApiChangeAction(internalApi);
    }
    return () => {
      // Only clear if we're unmounting to avoid null flickering during re-renders
      // Note: This might need adjustment if repl.tsx is conditionally rendered often
    };
  }, [internalApi, onConsoleApiChangeAction]);

  return (
    <div className="space-y-3 w-full">
      {lastResult && (
        <div className="flex items-center gap-2">
          {canShare && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                  onClick={handleShareResult}
                >
                  <PlusCircleIcon className="h-4 w-4" />
                  Add to chat
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Share this result</p>
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => {
                  setLastResult(null);
                  internalApi?.clearResults();
                  if (!inlineResults && onResultChangeAction) {
                    onResultChangeAction(null);
                  }
                }}
              >
                <TrashIcon className="h-4 w-4" />
                Clear
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Clear results</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <SqlConsole
        className={className}
        historyKey={HISTORY_KEY}
        selectedDbLabel={selectedDbLabel}
        executeQuery={executeQuery}
        onApiChange={setInternalApi}
        showInlineResults={inlineResults}
        onSuccessAction={({ sql, rows, columns, durationMs }) => {
          setLastResult({ sql, rows, columns, durationMs });
          setHasShared(false);
        }}
      />
    </div>
  );
}
