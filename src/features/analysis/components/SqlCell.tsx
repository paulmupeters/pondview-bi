import { Play, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SqlAnalysisDisplay } from "@/components/sql-analysis-display";
import {
  createSqlAutocompleteAction,
  type QueryNotice,
  SqlConsole,
  type SqlConsoleApi,
} from "@/components/sql-console";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import type { AiCellState } from "@/features/analysis/components/AiCell";
import {
  createSqlCellPayload,
  parseSqlCellPayload,
  type SqlCellRunResult,
  updateSqlCellPayloadConfig,
  updateSqlCellPayloadVisualType,
} from "@/features/analysis/sql-cell-payload";
import {
  normalizeSqlDraft,
  isSqlResultStale,
  resolveCellStatusFromRunState,
  shouldPersistSqlDraftChange,
  shouldPersistVisualTypeChange,
} from "@/features/analysis/sql-cell-sync";
import {
  createSqlIntentSwitchPatch,
  getSqlIntentDraftSignature,
  shouldShowSqlIntentPopover,
} from "@/features/analysis/sql-intent";
import type { NotebookSession } from "@/hooks/use-notebook-session";
import { runQuery } from "@/lib/sql/run-query";
import { cn } from "@/lib/utils";

type SqlCellProps = {
  cell: AnalysisCellState;
  bootstrapSql?: { sql: string; autorun: boolean } | null;
  notebookSession: NotebookSession;
  onBootstrapConsumed?: () => void;
  aiEnabled: boolean;
  onToggleAi: () => void;
  onSelectMode?: (mode: "ai" | "sql") => void;
  ai: AiCellState;
};

export function SqlCell({
  cell,
  bootstrapSql = null,
  notebookSession,
  onBootstrapConsumed,
  aiEnabled,
  onToggleAi,
  onSelectMode,
  ai,
}: SqlCellProps) {
  const consoleApiRef = useRef<SqlConsoleApi | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const noticeRef = useRef<QueryNotice | null>(null);
  const runSucceededRef = useRef(false);
  const hasSeenInitialQueryRef = useRef(false);
  const previousRunStateRef = useRef<boolean | null>(null);
  const appliedBootstrapKeyRef = useRef<string | null>(null);
  const [isSqlRunning, setIsSqlRunning] = useState(false);
  const [dismissedSqlIntentDraft, setDismissedSqlIntentDraft] = useState<
    string | null
  >(null);
  const storedPayload = useMemo(
    () => parseSqlCellPayload(cell.resultPayloadJson),
    [cell.resultPayloadJson],
  );
  const hasFreshStoredPayload =
    storedPayload &&
    !isSqlResultStale({
      currentSqlDraft: cell.sqlDraft,
      persistedResultQuery: storedPayload.query,
    });

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
    const api = consoleApiRef.current;
    if (!bootstrapSql || !api) {
      if (!bootstrapSql) {
        appliedBootstrapKeyRef.current = null;
      }
      return;
    }

    const bootstrapKey = `${cell.id}:${bootstrapSql.autorun ? "1" : "0"}:${bootstrapSql.sql}`;
    if (appliedBootstrapKeyRef.current === bootstrapKey) {
      return;
    }
    appliedBootstrapKeyRef.current = bootstrapKey;

    api.clearResults();
    if (api.getQuery() !== bootstrapSql.sql) {
      api.setQuery(bootstrapSql.sql);
    }
    api.focus();

    if (bootstrapSql.autorun) {
      window.requestAnimationFrame(() => {
        api.runQuery();
      });
    }

    onBootstrapConsumed?.();
  }, [bootstrapSql, cell.id, onBootstrapConsumed]);

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
      setIsSqlRunning(isRunning);

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

      const persistedType: "table" | "chart" | "card" | undefined =
        storedPayload.visualType === "text"
          ? undefined
          : storedPayload.visualType;
      if (
        !shouldPersistVisualTypeChange({
          nextVisualType: visualType,
          persistedVisualType: persistedType,
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
  const isChatMode = aiEnabled;
  const sqlIntentDraftSignature = useMemo(
    () => getSqlIntentDraftSignature(ai.promptDraft),
    [ai.promptDraft],
  );
  const showSqlIntentPopover = useMemo(
    () =>
      shouldShowSqlIntentPopover({
        promptDraft: ai.promptDraft,
        isChatMode,
        isAssistantThinking: ai.isAssistantThinking,
        dismissedDraftSignature: dismissedSqlIntentDraft,
      }),
    [
      ai.isAssistantThinking,
      ai.promptDraft,
      dismissedSqlIntentDraft,
      isChatMode,
    ],
  );

  useEffect(() => {
    if (!sqlIntentDraftSignature) {
      setDismissedSqlIntentDraft(null);
    }
  }, [sqlIntentDraftSignature]);

  const handleSelectMode = useCallback(
    (mode: "ai" | "sql") => {
      if (onSelectMode) {
        onSelectMode(mode);
        return;
      }

      if ((mode === "ai") !== isChatMode) {
        onToggleAi();
      }
    },
    [isChatMode, onSelectMode, onToggleAi],
  );
  const handleKeepInChat = useCallback(() => {
    if (!sqlIntentDraftSignature) {
      return;
    }

    setDismissedSqlIntentDraft(sqlIntentDraftSignature);
  }, [sqlIntentDraftSignature]);

  const handleSwitchToSql = useCallback(async () => {
    const nextPatch = createSqlIntentSwitchPatch(ai.promptDraft);
    if (!nextPatch) {
      return;
    }

    setDismissedSqlIntentDraft(sqlIntentDraftSignature);
    ai.setPromptDraft("");
    await notebookSession.updateCell(cell.id, nextPatch);
    handleSelectMode("sql");
  }, [ai, cell.id, handleSelectMode, notebookSession, sqlIntentDraftSignature]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border bg-background">
        {/* Toolbar row */}
        <div className="flex items-center gap-2 border-b px-2 py-1.5">
          <div className="inline-flex items-center gap-1 rounded-full border bg-muted/50 p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={isChatMode}
              className={cn(
                "h-7 gap-1.5 rounded-full px-3 text-xs",
                isChatMode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => handleSelectMode("ai")}
            >
              <Sparkles className="size-3.5" />
              Chat
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={!isChatMode}
              className={cn(
                "h-7 rounded-full px-3 text-xs",
                !isChatMode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => handleSelectMode("sql")}
            >
              SQL
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {!isChatMode && (
              <>
                <span className="text-[11px] text-muted-foreground">
                  Shift+Enter to run
                </span>
                {!isSqlRunning ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2.5 text-xs font-mono"
                    onClick={() => consoleApiRef.current?.runQuery()}
                  >
                    <Play className="size-3" />
                    Run
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2.5 text-xs font-mono bg-primary text-primary-foreground"
                    onClick={() => consoleApiRef.current?.cancelQuery()}
                  >
                    <Square className="size-3" />
                    Stop
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* AI prompt input — shown when AI mode is active */}
        {isChatMode && (
          <form
            className="p-0"
            onSubmit={(event) => {
              event.preventDefault();
              if (ai) {
                void ai.submitPrompt();
              }
            }}
          >
            <InputGroup className="border-0 shadow-none bg-transparent dark:bg-background items-end rounded-none">
              <InputGroupTextarea
                value={ai?.promptDraft ?? ""}
                onChange={(event) => ai?.setPromptDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    if (ai?.promptDraft?.trim() && !ai?.isAssistantThinking) {
                      void ai.submitPrompt();
                    }
                  }
                }}
                placeholder="Ask AI to refine this cell..."
                rows={4}
                disabled={ai?.isAssistantThinking ?? false}
                autoFocus
              />
              <InputGroupAddon align="inline-end">
                <Popover open={showSqlIntentPopover}>
                  <PopoverTrigger asChild>
                    <span className="inline-flex">
                      <InputGroupButton
                        type="submit"
                        size="sm"
                        className="dark:bg-background"
                        disabled={
                          (ai?.isAssistantThinking ?? false) ||
                          !ai?.promptDraft?.trim()
                        }
                      >
                        {ai?.isAssistantThinking ? "Running..." : "Ask AI"}
                      </InputGroupButton>
                    </span>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="top"
                    className="w-80 space-y-3 px-3 py-3"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">This looks like SQL</p>
                      <p className="text-xs text-muted-foreground">
                        Switch to SQL mode and move this query into the SQL
                        editor?
                      </p>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleKeepInChat}
                      >
                        Keep in Chat
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSwitchToSql()}
                      >
                        Switch to SQL
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </InputGroupAddon>
            </InputGroup>
          </form>
        )}

        {/* SQL editor — always mounted, hidden when AI mode is active */}
        <div className={isChatMode ? "hidden" : undefined}>
          <SqlConsole
            className="py-0"
            historyKey={`analysis-sql-history:${cell.id}`}
            editorMinHeight="10rem"
            executeQueryAction={executeQueryAction}
            autocompleteAction={autocompleteAction}
            showInlineResults={false}
            showRunControls={false}
            showKeyboardHint={false}
            onApiChangeAction={(api) => {
              consoleApiRef.current = api;
            }}
            onQueryChangeAction={handleQueryChange}
            onSuccessAction={handleSuccess}
            onNoticeAction={handleNotice}
            onRunStateChangeAction={handleRunStateChange}
          />
        </div>
      </div>

      {hasFreshStoredPayload || isSqlRunning ? (
        <div className="overflow-hidden rounded-lg border bg-background pb-4">
          <SqlAnalysisDisplay
            data={storedPayload}
            stage={
              storedPayload?.stage ?? (isSqlRunning ? "loading" : undefined)
            }
            progress={storedPayload?.progress}
            showStageIndicator={isSqlRunning}
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
