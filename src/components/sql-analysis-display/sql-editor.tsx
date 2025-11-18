"use client";

import { createDuckDbExecuteQuery, SqlConsole } from "@/components/sql-console";
import type { Result } from "@/lib/types";

interface SqlEditorProps {
  dbIdentifier: string;
  selectedDbLabel?: string;
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
  selectedDbLabel,
  className,
}: SqlEditorProps) {
  const executeQuery = createDuckDbExecuteQuery({ dbIdentifier });

  return (
    <SqlConsole
      className={className}
      historyKey={HISTORY_KEY}
      selectedDbLabel={selectedDbLabel}
      historyLimit={HISTORY_LIMIT}
      executeQuery={executeQuery}
      onSuccess={({ sql, rows, columns }) =>
        onQuerySuccess(sql, rows as Result[], columns)
      }
    />
  );
}
