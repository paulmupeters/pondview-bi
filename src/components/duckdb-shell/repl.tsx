"use client";

import {
  type ExecuteQueryFn,
  SqlConsole,
  type SqlConsoleApi,
} from "@/components/sql-console";
import type { HttpDuckDbConfig } from "@/lib/duckdb/duckdb-node";

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
};

const HISTORY_KEY = "bi.repl.history";

export function DuckdbRepl({
  className,
  httpConfig,
  selectedDbLabel,
  selectedDbIdentifier,
  onRunSql,
  onConsoleApiChange,
}: DuckdbReplProps) {
  const executeQuery: ExecuteQueryFn = async ({ sql, signal }) => {
    if (onRunSql) {
      return onRunSql({ sql, dbIdentifier: selectedDbIdentifier, signal });
    }

    const response = await fetch("/api/duckdb/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql,
        config: httpConfig,
      }),
      signal,
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as { rows: Record<string, unknown>[] };
    return { rows: data.rows };
  };

  return (
    <SqlConsole
      className={className}
      historyKey={HISTORY_KEY}
      selectedDbLabel={selectedDbLabel}
      executeQuery={executeQuery}
      onApiChange={onConsoleApiChange}
    />
  );
}
