"use client";

import { SqlConsole } from "@/components/sql-console";
import type { Result } from "@/lib/types";

interface SqlEditorProps {
  dbIdentifier: string;
  onQuerySuccess: (
    query: string,
    results: Result[],
    columns: { name: string; type?: string }[],
  ) => void;
  className?: string;
}

const HISTORY_KEY = "bi.sql-editor.history";
const HISTORY_LIMIT = 50;

export function SqlEditor({
  dbIdentifier,
  onQuerySuccess,
  className,
}: SqlEditorProps) {
  const executeQuery = async ({
    sql,
    signal,
  }: {
    sql: string;
    signal: AbortSignal;
  }) => {
    const response = await fetch("/api/chat/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dbIdentifier,
        query: sql,
      }),
      signal,
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      rows: Record<string, unknown>[];
    };
    return { rows: data.rows as Result[] };
  };

  return (
    <SqlConsole
      className={className}
      historyKey={HISTORY_KEY}
      historyLimit={HISTORY_LIMIT}
      executeQuery={executeQuery}
      onSuccess={({ sql, rows, columns }) =>
        onQuerySuccess(sql, rows as Result[], columns)
      }
    />
  );
}
