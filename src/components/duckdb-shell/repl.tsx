"use client";

import {
  ClipboardDocumentIcon,
  PlayIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import {
  type ExecuteQueryFn,
  SqlConsole,
  type SqlConsoleApi,
} from "@/components/sql-console";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { HttpDuckDbConfig } from "@/lib/duckdb/duckdb-node";
import { runQuery } from "@/lib/sql/run-query";
import type { Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";

const SQL_SAMPLE_SQL = `-- Create a sample table with two columns (col1, col2)
SELECT 
    range1 AS col1,
    range2 AS col2
FROM 
    (SELECT UNNEST(GENERATE_SERIES(1, 10)) AS range1) t1
CROSS JOIN 
    (SELECT UNNEST(GENERATE_SERIES(11, 20)) AS range2) t2;
`;

const SQL_SAMPLE_LINES: {
  id: string;
  content: ReactNode;
  indent?: boolean;
}[] = [
    {
      id: "select",
      content: <span className="text-purple-600 font-bold">SELECT</span>,
    },
    {
      id: "date-trunc",
      indent: true,
      content: (
        <>
          date_trunc(<span className="text-green-600">'minute'</span>, timestamp,
          5) <span className="text-purple-600 font-bold">AS</span> time_bucket,
        </>
      ),
    },
    {
      id: "count-distinct",
      indent: true,
      content: (
        <>
          count(
          <span className="text-purple-600 font-bold">DISTINCT</span> user_id){" "}
          <span className="text-purple-600 font-bold">AS</span> active_users
        </>
      ),
    },
    {
      id: "from",
      content: <span className="text-purple-600 font-bold">FROM</span>,
    },
    {
      id: "analytics-table",
      indent: true,
      content: <span className="text-amber-600">analytics.page_views</span>,
    },
    {
      id: "where",
      content: <span className="text-purple-600 font-bold">WHERE</span>,
    },
    {
      id: "region",
      indent: true,
      content: (
        <>
          region = <span className="text-green-600">'us-east-1'</span>
        </>
      ),
    },
    {
      id: "group-by",
      content: (
        <>
          <span className="text-purple-600 font-bold">GROUP BY</span> 1
        </>
      ),
    },
    {
      id: "order-by",
      content: (
        <>
          <span className="text-purple-600 font-bold">ORDER BY</span> 1{" "}
          <span className="text-purple-600 font-bold">ASC</span>
          {";"}
        </>
      ),
    },
  ];

type DuckdbReplProps = {
  className?: string;
  httpConfig?: HttpDuckDbConfig;
  selectedDbIdentifier?: string;
  onRunSqlAction?: (params: {
    sql: string;
    dbIdentifier?: string;
    signal: AbortSignal;
  }) => ReturnType<ExecuteQueryFn>;
  onConsoleApiChangeAction?: (api: SqlConsoleApi | null) => void;
  onAddToChatAction?: (payload: SqlAnalysisData) => void;
  inlineResults?: boolean;
  onResultChangeAction?: (
    result: {
      sql: string;
      rows: Record<string, unknown>[];
      columns: { name: string; type?: string }[];
      durationMs: number;
    } | null,
  ) => void;
  showRunControls?: boolean;
  chartConfig?: Config | null;
};

const HISTORY_KEY = "bi.repl.history";

export function DuckdbRepl({
  className,
  httpConfig,
  selectedDbIdentifier,
  onRunSqlAction,
  onConsoleApiChangeAction,
  onAddToChatAction,
  inlineResults = true,
  onResultChangeAction,
  showRunControls = true,
  chartConfig,
}: DuckdbReplProps) {
  const [lastResult, setLastResult] = useState<{
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
  } | null>(null);
  const [hasShared, setHasShared] = useState(false);
  const [internalApi, setInternalApi] = useState<SqlConsoleApi | null>(null);
  const [copiedSqlSnippet, setCopiedSqlSnippet] = useState(false);
  const copySnippetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const executeQuery: ExecuteQueryFn = async ({ sql, signal }) => {
    if (onRunSqlAction) {
      return onRunSqlAction({
        sql,
        dbIdentifier: selectedDbIdentifier,
        signal,
      });
    }
    return runQuery({
      sql,
      dbIdentifier: selectedDbIdentifier,
      config: httpConfig,
      signal,
    });
  };

  const handleShareResult = () => {
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
      visualType: chartConfig ? "chart" : "table",
      chartConfig: chartConfig ?? undefined,
      summary: {
        totalRows: lastResult.rows.length,
        executionTimeMs: lastResult.durationMs,
        insights: [],
      },
    };

    onAddToChatAction(payload);
    setHasShared(true);
  };

  const canShare = Boolean(onAddToChatAction && lastResult && !hasShared);


  const handleCopySqlSnippet = () => {
    const currentSql = internalApi?.getQuery()?.trim();
    const textToCopy = currentSql?.length ? currentSql : SQL_SAMPLE_SQL;
    if (
      !textToCopy ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }
    void navigator.clipboard.writeText(textToCopy);
    setCopiedSqlSnippet(true);
    if (copySnippetTimeoutRef.current) {
      clearTimeout(copySnippetTimeoutRef.current);
    }
    copySnippetTimeoutRef.current = setTimeout(() => {
      setCopiedSqlSnippet(false);
    }, 2000);
  };

  const handleRunSqlFromBanner = () => {
    if (!internalApi) {
      return;
    }
    internalApi.runQuery();
  };

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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copySnippetTimeoutRef.current) {
        clearTimeout(copySnippetTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "relative flex-1 h-full overflow-hidden border-r border-border p-4",
        className,
      )}
    >
      {/* Toolbar Buttons */}
      <div className="absolute top-4 right-4 z-20 flex gap-2 text-xs">
        <button
          type="button"
          className="flex items-center gap-2 bg-card border border-border text-foreground px-3 py-1.5 rounded text-xs font-bold hover:bg-accent transition-colors shadow-sm h-[26px]"
          onClick={handleCopySqlSnippet}
        >
          {copiedSqlSnippet ? (
            <>
              <svg
                aria-hidden="true"
                className="w-3 h-3 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Copied
            </>
          ) : (
            <>
              <ClipboardDocumentIcon className="w-3 h-3" />
              Copy
            </>
          )}
        </button>

        <button
          type="button"
          disabled={!internalApi}
          onClick={handleRunSqlFromBanner}
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold transition-colors shadow-sm h-[26px]",
            internalApi
              ? "bg-card border border-border text-card-foreground hover:bg-accent"
              : "bg-card border border-border text-card-foreground cursor-not-allowed",
          )}
        >
          <PlayIcon className="w-3 h-3" />
          Run
        </button>

        {canShare && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 bg-card border border-border text-foreground px-3 py-1.5 rounded text-xs font-bold hover:bg-accent transition-colors shadow-sm h-[26px]"
                onClick={handleShareResult}
              >
                <PlusCircleIcon className="w-3 h-3" />
                Add to chat
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Share this result</p>
            </TooltipContent>
          </Tooltip>
        )}

        {lastResult && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 bg-card border border-border text-foreground px-3 py-1.5 rounded text-xs font-bold hover:bg-accent transition-colors shadow-sm h-[26px]"
                onClick={() => {
                  setLastResult(null);
                  internalApi?.clearResults();
                  if (!inlineResults && onResultChangeAction) {
                    onResultChangeAction(null);
                  }
                }}
              >
                <TrashIcon className="w-3 h-3" />
                Clear
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Clear results</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>


      {/* SQL Console */}
      <div className="relative z-10 h-full min-h-[380px]">
        <SqlConsole
          className="h-full w-full"
          historyKey={HISTORY_KEY}
          executeQueryAction={executeQuery}
          onApiChangeAction={setInternalApi}
          showInlineResults={inlineResults}
          showRunControls={showRunControls}
          onSuccessAction={({ sql, rows, columns, durationMs }) => {
            setLastResult({ sql, rows, columns, durationMs });
            setHasShared(false);
          }}
        />
      </div>
    </div>
  );
}
