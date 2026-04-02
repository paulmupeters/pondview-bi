import { useCallback, useEffect, useMemo, useRef } from "react";
import { SqlAnalysisDisplay } from "@/components/sql-analysis-display";
import {
  createSqlAutocompleteAction,
  type QueryNotice,
  SqlConsole,
  type SqlConsoleApi,
} from "@/components/sql-console";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import {
  createSqlCellPayload,
  parseSqlCellPayload,
  type SqlCellRunResult,
  updateSqlCellPayloadConfig,
  updateSqlCellPayloadVisualType,
} from "@/features/analysis/sql-cell-payload";
import {
  normalizeSqlDraft,
  resolveCellStatusFromRunState,
  shouldPersistSqlDraftChange,
  shouldPersistVisualTypeChange,
} from "@/features/analysis/sql-cell-sync";
import type { NotebookSession } from "@/hooks/use-notebook-session";
import { runQuery } from "@/lib/sql/run-query";

type SqlCellProps = {
  cell: AnalysisCellState;
  notebookSession: NotebookSession;
};

export function SqlCell({ cell, notebookSession }: SqlCellProps) {
  const consoleApiRef = useRef<SqlConsoleApi | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const noticeRef = useRef<QueryNotice | null>(null);
  const runSucceededRef = useRef(false);
  const hasSeenInitialQueryRef = useRef(false);
  const previousRunStateRef = useRef<boolean | null>(null);
  const storedPayload = useMemo(
    () => parseSqlCellPayload(cell.resultPayloadJson),
    [cell.resultPayloadJson],
  );

  const executeQueryAction = useCallback(
    async ({ sql, signal }: { sql: string; signal: AbortSignal }) => {
      const result = await runQuery({
        sql,
        signal,
        dbIdentifier: cell.selectedDbIdentifier ?? undefined,
        catalogContext: cell.selectedCatalogContext,
      });

      return {
        rows: result.rows,
        columns: result.columns,
        backend: result.backend,
        dbIdentifier: cell.selectedDbIdentifier ?? undefined,
        catalogContext: cell.selectedCatalogContext,
      };
    },
    [cell.selectedCatalogContext, cell.selectedDbIdentifier],
  );

  const autocompleteAction = useMemo(
    () =>
      createSqlAutocompleteAction({
        dbIdentifier: cell.selectedDbIdentifier ?? undefined,
        catalogContext: cell.selectedCatalogContext,
      }),
    [cell.selectedCatalogContext, cell.selectedDbIdentifier],
  );

  useEffect(() => {
    const api = consoleApiRef.current;
    const nextSql = cell.sqlDraft ?? "";
    if (!api || api.getQuery() === nextSql) {
      return;
    }

    api.setQuery(nextSql);
  }, [cell.sqlDraft]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current !== null) {
        window.clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  const handleQueryChange = useCallback(
    (sql: string) => {
      const hasSeenInitialQuery = hasSeenInitialQueryRef.current;
      hasSeenInitialQueryRef.current = true;

      if (
        !shouldPersistSqlDraftChange({
          nextSql: sql,
          persistedSql: cell.sqlDraft,
          hasSeenInitialQuery,
        })
      ) {
        return;
      }

      if (syncTimeoutRef.current !== null) {
        window.clearTimeout(syncTimeoutRef.current);
      }

      syncTimeoutRef.current = window.setTimeout(() => {
        void notebookSession.updateCell(cell.id, {
          sqlDraft: normalizeSqlDraft(sql),
        });
      }, 250);
    },
    [cell.id, cell.sqlDraft, notebookSession],
  );

  const handleSuccess = useCallback(
    (result: SqlCellRunResult) => {
      runSucceededRef.current = true;
      const payload = createSqlCellPayload({
        result,
        previousPayload: storedPayload,
        selectedCatalogContext: cell.selectedCatalogContext,
      });
      const now = Date.now();

      void notebookSession.updateCell(cell.id, {
        sqlDraft: result.sql,
        status: "complete",
        selectedDbIdentifier: result.dbIdentifier ?? cell.selectedDbIdentifier,
        selectedCatalogContext:
          result.catalogContext ?? cell.selectedCatalogContext,
        resultPayloadJson: JSON.stringify(payload),
        lastRunAt: now,
      });
    },
    [
      cell.id,
      cell.selectedCatalogContext,
      cell.selectedDbIdentifier,
      notebookSession,
      storedPayload,
    ],
  );

  const handleNotice = useCallback((notice: QueryNotice | null) => {
    noticeRef.current = notice;
  }, []);

  const handleRunStateChange = useCallback(
    (isRunning: boolean) => {
      if (isRunning) {
        runSucceededRef.current = false;
        noticeRef.current = null;
      }

      const nextStatus = resolveCellStatusFromRunState({
        isRunning,
        previousIsRunning: previousRunStateRef.current,
        runSucceeded: runSucceededRef.current,
        noticeKind: noticeRef.current?.kind ?? null,
      });
      previousRunStateRef.current = isRunning;

      if (!nextStatus || nextStatus === cell.status) {
        return;
      }

      void notebookSession.updateCell(cell.id, {
        status: nextStatus,
      });
    },
    [cell.id, cell.status, notebookSession],
  );

  const handleConfigChange = useCallback(
    (config: {
      chartConfig?: NonNullable<typeof storedPayload>["chartConfig"];
      cardConfig?: NonNullable<typeof storedPayload>["cardConfig"];
    }) => {
      if (!storedPayload) {
        return;
      }

      const nextPayload = updateSqlCellPayloadConfig(storedPayload, config);
      const nextPayloadJson = JSON.stringify(nextPayload);
      if (nextPayloadJson === cell.resultPayloadJson) {
        return;
      }
      void notebookSession.updateCell(cell.id, {
        resultPayloadJson: nextPayloadJson,
      });
    },
    [cell.id, cell.resultPayloadJson, notebookSession, storedPayload],
  );

  const handleVisualTypeChange = useCallback(
    (visualType: "table" | "chart" | "card") => {
      if (!storedPayload) {
        return;
      }

      if (
        !shouldPersistVisualTypeChange({
          nextVisualType: visualType,
          persistedVisualType: storedPayload.visualType,
        })
      ) {
        return;
      }

      const nextPayload = updateSqlCellPayloadVisualType(
        storedPayload,
        visualType,
      );
      void notebookSession.updateCell(cell.id, {
        resultPayloadJson: JSON.stringify(nextPayload),
      });
    },
    [cell.id, notebookSession, storedPayload],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-background px-3">
        <SqlConsole
          className="py-0"
          historyKey={`analysis-sql-history:${cell.id}`}
          editorMinHeight="10rem"
          executeQueryAction={executeQueryAction}
          autocompleteAction={autocompleteAction}
          showInlineResults={false}
          onApiChangeAction={(api) => {
            consoleApiRef.current = api;
          }}
          onQueryChangeAction={handleQueryChange}
          onSuccessAction={handleSuccess}
          onNoticeAction={handleNotice}
          onRunStateChangeAction={handleRunStateChange}
        />
      </div>

      {storedPayload || cell.status === "running" ? (
        <div className="overflow-hidden rounded-lg border bg-background">
          <SqlAnalysisDisplay
            data={storedPayload}
            stage={
              storedPayload?.stage ??
              (cell.status === "running" ? "loading" : undefined)
            }
            progress={storedPayload?.progress}
            showStageIndicator={cell.status === "running"}
            className="w-full"
            onConfigChange={handleConfigChange}
            onVisualTypeChange={handleVisualTypeChange}
          />
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          Run a query in this cell to persist its result and visualization.
        </div>
      )}
    </div>
  );
}
