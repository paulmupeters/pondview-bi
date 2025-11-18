"use client";

import { useCallback, useState } from "react";
import { PlusCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  createDuckDbExecuteQuery,
  type ExecuteQueryFn,
  SqlConsole,
  type SqlConsoleApi,
} from "@/components/sql-console";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { HttpDuckDbConfig } from "@/lib/duckdb/duckdb-node";
import type { Result } from "@/lib/types";

type DuckdbReplProps = {
  className?: string;
  httpConfig?: HttpDuckDbConfig;
  selectedDbLabel?: string;
  selectedDbIdentifier?: string;
  onRunSql?: (params: {
    sql: string;
    dbIdentifier?: string;
    signal: AbortSignal;
  }) => ReturnType<ExecuteQueryFn>;
  onConsoleApiChange?: (api: SqlConsoleApi | null) => void;
  onAddToChat?: (payload: SqlAnalysisData) => void;
};

const HISTORY_KEY = "bi.repl.history";

export function DuckdbRepl({
  className,
  httpConfig,
  selectedDbLabel,
  selectedDbIdentifier,
  onRunSql,
  onConsoleApiChange,
  onAddToChat,
}: DuckdbReplProps) {
  const [lastResult, setLastResult] = useState<{
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
  } | null>(null);
  const [hasShared, setHasShared] = useState(false);

  const executeQuery: ExecuteQueryFn = async ({ sql, signal }) => {
    if (onRunSql) {
      return onRunSql({ sql, dbIdentifier: selectedDbIdentifier, signal });
    }

    return createDuckDbExecuteQuery({
      dbIdentifier: selectedDbIdentifier,
      config: httpConfig,
    })({ sql, signal });
  };

  const handleShareResult = useCallback(() => {
    if (!onAddToChat || !lastResult) {
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

    onAddToChat(payload);
    setHasShared(true);
  }, [lastResult, onAddToChat, selectedDbIdentifier]);

  const canShare = Boolean(onAddToChat && lastResult && !hasShared);

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
        </div>
      )}
      <SqlConsole
        className={className}
        historyKey={HISTORY_KEY}
        selectedDbLabel={selectedDbLabel}
        executeQuery={executeQuery}
        onApiChange={onConsoleApiChange}
        onSuccess={({ sql, rows, columns, durationMs }) => {
          setLastResult({ sql, rows, columns, durationMs });
          setHasShared(false);
        }}
      />
    </div>
  );
}
