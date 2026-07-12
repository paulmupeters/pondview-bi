import {
  ChevronDown,
  ChevronRight,
  Play,
  Sparkles,
  Square,
} from "lucide-react";
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
import { MISSING_AI_CONFIGURATION_MESSAGE } from "@/features/analysis/ai-configuration-message";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import {
  type AiCellState,
  AiResponseBanner,
} from "@/features/analysis/components/AiCell";
import {
  createSqlCellPayload,
  parseSqlCellPayload,
  type SqlCellRunResult,
  updateSqlCellPayloadConfig,
  updateSqlCellPayloadVisualType,
} from "@/features/analysis/sql-cell-payload";
import {
  isSqlResultStale,
  normalizeSqlDraft,
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
  onSelectMode?: (mode: "ai" | "sql") => void;
  ai: AiCellState;
};

export function SqlCell({
  cell,
  bootstrapSql = null,
  notebookSession,
  onBootstrapConsumed,
  aiEnabled,
  onSelectMode,
  ai,
}: SqlCellProps) {
  const consoleApiRef = useRef<SqlConsoleApi | null>(null);
  const [consoleApi, setConsoleApi] = useState<SqlConsoleApi | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const noticeRef = useRef<QueryNotice | null>(null);
  const runSucceededRef = useRef(false);
  const hasSeenInitialQueryRef = useRef(false);
  const previousRunStateRef = useRef<boolean | null>(null);
  const appliedBootstrapKeyRef = useRef<string | null>(null);
  const [isSqlRunning, setIsSqlRunning] = useState(false);
  const [isSqlPanelExpanded, setIsSqlPanelExpanded] = useState(true);
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
    const api = consoleApi;
    const nextSql = cell.sqlDraft ?? "";
    if (!api || api.getQuery() === nextSql) {
      return;
    }

    api.setQuery(nextSql);
  }, [cell.sqlDraft, consoleApi]);

  useEffect(() => {
    const api = consoleApi;
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
  }, [bootstrapSql, cell.id, consoleApi, onBootstrapConsumed]);

  const handleConsoleApiChange = useCallback((api: SqlConsoleApi | null) => {
    consoleApiRef.current = api;
    setConsoleApi(api);
  }, []);

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
  const hasSqlDraft = Boolean(cell.sqlDraft?.trim());
  const sqlIntentDraftSignature = useMemo(
    () => getSqlIntentDraftSignature(ai.promptDraft),
    [ai.promptDraft],
  );
  const showSqlIntentPopover = useMemo(
    () =>
      shouldShowSqlIntentPopover({
        promptDraft: ai.promptDraft,
        isChatMode: true,
        isAssistantThinking: ai.isAssistantThinking,
        dismissedDraftSignature: dismissedSqlIntentDraft,
      }),
    [ai.isAssistantThinking, ai.promptDraft, dismissedSqlIntentDraft],
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
      }
    },
    [onSelectMode],
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

  const resultPanel =
    hasFreshStoredPayload || isSqlRunning ? (
      <div className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-background pb-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/45" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Output
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground/60">
            generated from SQL
          </span>
        </div>
        <SqlAnalysisDisplay
          data={storedPayload}
          stage={storedPayload?.stage ?? (isSqlRunning ? "loading" : undefined)}
          progress={storedPayload?.progress}
          showStageIndicator={isSqlRunning}
          className="w-full"
          onConfigChange={handleConfigChange}
          onVisualTypeChange={handleVisualTypeChange}
        />
      </div>
    ) : (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
        Run a query in this cell to persist its result and visualization.
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-primary/15 bg-primary/[0.035] shadow-sm">
        <form
          className="p-0"
          onSubmit={(event) => {
            event.preventDefault();
            void ai.submitPrompt();
          }}
        >
          <InputGroup className="items-end rounded-none border-0 bg-transparent shadow-none dark:bg-background">
            <InputGroupTextarea
              value={ai.promptDraft}
              onChange={(event) => ai.setPromptDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  if (ai.promptDraft.trim() && !ai.isAssistantThinking) {
                    void ai.submitPrompt();
                  }
                }
              }}
              placeholder={
                hasSqlDraft
                  ? "Ask AI to refine or explain this analysis..."
                  : "Ask anything about your data..."
              }
              rows={2}
              disabled={ai.isAssistantThinking}
              autoFocus={aiEnabled}
            />
            <InputGroupAddon align="inline-end">
              <Popover
                open={showSqlIntentPopover}
                onOpenChange={(open) => {
                  if (!open && showSqlIntentPopover) {
                    handleKeepInChat();
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <span className="inline-flex">
                    <InputGroupButton
                      type="submit"
                      size="sm"
                      className="gap-1.5 dark:bg-background"
                      disabled={
                        ai.isAssistantThinking || !ai.promptDraft.trim()
                      }
                    >
                      <Sparkles className="size-3.5" />
                      {ai.isAssistantThinking ? "Running..." : "Ask AI"}
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
                      Move this query into the SQL panel?
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleKeepInChat}
                    >
                      Keep as prompt
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSwitchToSql()}
                    >
                      Move to SQL
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>

      <AiResponseBanner
        ai={ai}
        showPromptError={ai.promptError !== MISSING_AI_CONFIGURATION_MESSAGE}
      />

      <div
        className={cn(
          "grid items-start gap-3",
          isSqlPanelExpanded
            ? "lg:grid-cols-[minmax(18rem,0.82fr)_minmax(0,1.38fr)]"
            : "lg:grid-cols-[2.75rem_minmax(0,1fr)]",
        )}
      >
        <div className="min-w-0 overflow-hidden rounded-lg border border-primary/15 bg-primary/[0.035] shadow-sm">
          <div className="flex items-center gap-2 border-b border-primary/10 bg-background/55 px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={isSqlPanelExpanded}
              className="h-7 gap-1.5 rounded-sm px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setIsSqlPanelExpanded((previous) => !previous)}
            >
              {isSqlPanelExpanded ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              <span className={cn(!isSqlPanelExpanded && "sr-only")}>SQL</span>
            </Button>

            {isSqlPanelExpanded ? (
              <div className="ml-auto flex items-center gap-1.5">
                <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 xl:inline">
                  Shift+Enter
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
                    className="h-7 gap-1 bg-primary px-2.5 text-xs font-mono text-primary-foreground hover:bg-primary/90"
                    onClick={() => consoleApiRef.current?.cancelQuery()}
                  >
                    <Square className="size-3" />
                    Stop
                  </Button>
                )}
              </div>
            ) : null}
          </div>

          {isSqlPanelExpanded ? (
            <SqlConsole
              className="py-0 font-mono"
              historyKey={`analysis-sql-history:${cell.id}`}
              editorMinHeight="11rem"
              executeQueryAction={executeQueryAction}
              autocompleteAction={autocompleteAction}
              showInlineResults={false}
              showRunControls={false}
              showKeyboardHint={false}
              onApiChangeAction={handleConsoleApiChange}
              onQueryChangeAction={handleQueryChange}
              onSuccessAction={handleSuccess}
              onNoticeAction={handleNotice}
              onRunStateChangeAction={handleRunStateChange}
            />
          ) : (
            <button
              type="button"
              className="flex h-full min-h-28 w-full items-center justify-center px-2 py-3 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Expand SQL panel"
              onClick={() => setIsSqlPanelExpanded(true)}
            >
              <span className="rotate-90 font-mono text-[10px] font-semibold uppercase tracking-[0.16em]">
                SQL
              </span>
            </button>
          )}
        </div>

        {resultPanel}
      </div>
    </div>
  );
}
