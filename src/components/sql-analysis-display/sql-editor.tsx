"use client";

import { createDuckDbExecuteQuery, SqlConsole } from "@/components/sql-console";
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
  const executeQuery = createDuckDbExecuteQuery({ dbIdentifier });

  return (
    <SqlConsole
      className={className}
      historyKey={HISTORY_KEY}
      historyLimit={HISTORY_LIMIT}
      executeQueryAction={executeQuery}
      onSuccessAction={({ sql, rows, columns }) =>
        onQuerySuccess(sql, rows as Result[], columns)
      }
    />
  );
}
