import type { UIMessage } from "@ai-sdk/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import type { ChatStatus } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { useManualVisualization } from "@/components/chat/hooks/use-manual-visualization";
import type { SqlReplResult } from "@/components/chat/hooks/use-sql-repl";
import { NotebookCellTranscript } from "@/components/chat/notebook-cell-transcript";
import {
  analysisCellEntryToUiMessage,
  buildNotebookArtifactEntry,
  parseStoredPayload,
} from "@/components/chat/notebook-cell-utils";
import { logNotebookDebug } from "@/components/chat/notebook-debug";
import { PromptErrorBanner } from "@/components/chat/prompt-error-banner";
import {
  type ManualShellVariant,
  PromptInputWrapper,
  type PromptMode,
} from "@/components/prompt-input-wrapper";
import { SqlAnalysisDisplay } from "@/components/sql-analysis-display";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { QueryNotice, SqlConsoleApi } from "@/components/sql-console";
import { Button } from "@/components/ui/button";
import type { NotebookSession } from "@/hooks/use-notebook-session";
import { cn } from "@/lib/utils";
import type {
  WorkspaceAnalysisCell,
  WorkspaceAnalysisCellEntry,
} from "@/lib/workspace/workspace-db";

const CHAT_MANUAL_SHELL_VARIANT: ManualShellVariant = "minimal";

type NotebookAnalysisCellProps = {
  cell: WorkspaceAnalysisCell;
  cellIndex: number;
  entries: WorkspaceAnalysisCellEntry[];
  streamingAssistantMessages: UIMessage[];
  isAssistantThinking: boolean;
  promptError: string | null;
  promptStatus: ChatStatus;
  promptPendingMode: "ai" | null;
  mode: PromptMode;
  showToolCalls: boolean;
  showExecuteSqlRawOutput: boolean;
  executeSqlArtifactType: string;
  isFocused: boolean;
  sharedSelectedDb?: string;
  sharedSelectedCatalogContext?: string | null;
  pendingSqlLoad?: { sql: string; autorun: boolean } | null;
  saveQuery: (sql?: string) => Promise<void>;
  isSavingQuery: boolean;
  onSubmitPrompt: (input: {
    cellId: string;
    message: PromptInputMessage;
    selectedDb?: string;
    selectedCatalogContext?: string | null;
  }) => Promise<void>;
  onModeChange: (cellId: string, mode: PromptMode) => void;
  onDeleteCell: (cellId: string) => Promise<void>;
  onDeleteCellEntry: (messageId: string) => Promise<void>;
  onRegisterConsoleApi: (cellId: string, api: SqlConsoleApi | null) => void;
  onPendingSqlLoadHandled: (cellId: string) => void;
  onFocusCell: (input: {
    cellId: string;
    selectedDb?: string;
    selectedCatalogContext?: string | null;
  }) => void;
  onOpenDashboardBuilder: () => void;
  notebookSession: Pick<
    NotebookSession,
    "appendCellEntry" | "refreshUpdatedAt" | "updateCell"
  >;
};

function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function EmptyCellVisual({
  hasPrompt,
  isRunning,
}: {
  hasPrompt: boolean;
  isRunning: boolean;
}) {
  return (
    <div className="flex min-h-[220px] items-center justify-center px-6 py-10 text-center">
      <div className="max-w-md space-y-2">
        <p className="text-sm font-medium text-foreground">
          {isRunning
            ? "This cell is running."
            : hasPrompt
              ? "No committed result for this cell yet."
              : "This cell is empty."}
        </p>
        <p className="text-sm text-muted-foreground">
          {isRunning
            ? "The visualization will appear here when the query result is ready."
            : hasPrompt
              ? "Run the prompt or switch to Manual SQL to generate a table or chart."
              : "Ask AI or run SQL in Manual mode to generate a visualization for this cell."}
        </p>
      </div>
    </div>
  );
}

export function NotebookAnalysisCell({
  cell,
  cellIndex,
  entries,
  streamingAssistantMessages,
  isAssistantThinking,
  promptError,
  promptStatus,
  promptPendingMode,
  mode,
  showToolCalls,
  showExecuteSqlRawOutput,
  executeSqlArtifactType,
  isFocused,
  sharedSelectedDb,
  sharedSelectedCatalogContext,
  pendingSqlLoad,
  saveQuery,
  isSavingQuery,
  onSubmitPrompt,
  onModeChange,
  onDeleteCell,
  onDeleteCellEntry,
  onRegisterConsoleApi,
  onPendingSqlLoadHandled,
  onFocusCell,
  onOpenDashboardBuilder,
  notebookSession,
}: NotebookAnalysisCellProps) {
  const storedPayload = useMemo(
    () => parseStoredPayload(cell.resultPayloadJson),
    [cell.resultPayloadJson],
  );
  const [promptDraft, setPromptDraft] = useState(cell.promptText);
  const [sqlDraft, setSqlDraft] = useState(cell.sqlDraft ?? "");
  const [localSelectedDb, setLocalSelectedDb] = useState<string | undefined>(
    cell.selectedDbIdentifier ?? sharedSelectedDb,
  );
  const [localSelectedCatalogContext, setLocalSelectedCatalogContext] =
    useState<string | null>(cell.selectedCatalogContext ?? null);
  const [manualResult, setManualResult] = useState<SqlReplResult | null>(null);
  const consoleApiRef = useRef<SqlConsoleApi | null>(null);
  const manualRunNoticeRef = useRef<QueryNotice | null>(null);
  const manualRunSucceededRef = useRef(false);

  const transcriptMessages = useMemo(() => {
    const persistedAssistantMessages = entries
      .map(analysisCellEntryToUiMessage)
      .filter((message) => message.role === "assistant");
    const dedupedPersistedAssistantMessages = Array.from(
      new Map(
        persistedAssistantMessages.map((message) => [message.id, message]),
      ).values(),
    );
    const persistedIds = new Set(
      dedupedPersistedAssistantMessages.map((message) => message.id),
    );

    return [
      ...dedupedPersistedAssistantMessages,
      ...streamingAssistantMessages.filter(
        (message) => !persistedIds.has(message.id),
      ),
    ];
  }, [entries, streamingAssistantMessages]);

  useEffect(() => {
    setPromptDraft(cell.promptText);
  }, [cell.promptText]);

  useEffect(() => {
    setSqlDraft(cell.sqlDraft ?? "");
  }, [cell.sqlDraft]);

  useEffect(() => {
    setLocalSelectedDb(cell.selectedDbIdentifier ?? sharedSelectedDb);
  }, [cell.selectedDbIdentifier, sharedSelectedDb]);

  useEffect(() => {
    setLocalSelectedCatalogContext(cell.selectedCatalogContext ?? null);
  }, [cell.selectedCatalogContext]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (sharedSelectedDb !== localSelectedDb) {
      setLocalSelectedDb(sharedSelectedDb);
    }
  }, [isFocused, localSelectedDb, sharedSelectedDb]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (
      (sharedSelectedCatalogContext ?? null) !== localSelectedCatalogContext
    ) {
      setLocalSelectedCatalogContext(sharedSelectedCatalogContext ?? null);
    }
  }, [isFocused, localSelectedCatalogContext, sharedSelectedCatalogContext]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    logNotebookDebug("notebook-cell:effect:focused", {
      cellId: cell.id,
      localSelectedDb: localSelectedDb ?? null,
      localSelectedCatalogContext,
      mode,
    });
    onFocusCell({
      cellId: cell.id,
      selectedDb: localSelectedDb,
      selectedCatalogContext: localSelectedCatalogContext,
    });
  }, [
    cell.id,
    isFocused,
    localSelectedCatalogContext,
    localSelectedDb,
    onFocusCell,
    mode,
  ]);

  useEffect(() => {
    if (promptDraft === cell.promptText) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void notebookSession.updateCell(cell.id, {
        promptText: promptDraft,
      });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [cell.id, cell.promptText, notebookSession, promptDraft]);

  useEffect(() => {
    const persistedSql = cell.sqlDraft ?? "";
    const persistedDb = normalizeNullableString(cell.selectedDbIdentifier);
    const persistedCatalog = cell.selectedCatalogContext ?? null;
    const nextDb = normalizeNullableString(localSelectedDb);

    if (
      sqlDraft === persistedSql &&
      nextDb === persistedDb &&
      localSelectedCatalogContext === persistedCatalog
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void notebookSession.updateCell(cell.id, {
        sqlDraft: sqlDraft || null,
        selectedDbIdentifier: nextDb,
        selectedCatalogContext: localSelectedCatalogContext,
      });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    cell.id,
    cell.selectedCatalogContext,
    cell.selectedDbIdentifier,
    cell.sqlDraft,
    localSelectedCatalogContext,
    localSelectedDb,
    notebookSession,
    sqlDraft,
  ]);

  const { manualVisualization } = useManualVisualization({
    sqlResult: manualResult,
    setSqlResult: setManualResult,
    selectedCatalogContext: localSelectedCatalogContext,
  });

  useEffect(() => {
    if (!pendingSqlLoad || mode !== "manual" || !consoleApiRef.current) {
      return;
    }

    logNotebookDebug("notebook-cell:effect:apply-pending-sql", {
      cellId: cell.id,
      autorun: pendingSqlLoad.autorun,
      sqlPreview: pendingSqlLoad.sql.slice(0, 100),
    });
    const api = consoleApiRef.current;
    api.clearResults();
    api.setQuery(pendingSqlLoad.sql);
    api.focus();

    if (pendingSqlLoad.autorun) {
      window.requestAnimationFrame(() => {
        api.runQuery();
      });
    }

    setSqlDraft(pendingSqlLoad.sql);
    onPendingSqlLoadHandled(cell.id);
  }, [cell.id, mode, onPendingSqlLoadHandled, pendingSqlLoad]);

  useEffect(() => {
    if (!manualResult) {
      return;
    }

    const payload = manualVisualization.createPayload({
      result: manualResult,
      selectedCatalogContext: localSelectedCatalogContext,
    });
    if (!payload) {
      return;
    }

    const nextPayload: SqlAnalysisData = storedPayload
      ? {
          ...payload,
          visualType: storedPayload.visualType,
          chartConfig: storedPayload.chartConfig,
          cardConfig: storedPayload.cardConfig,
        }
      : payload;

    const createdAt = Date.now();

    void notebookSession
      .appendCellEntry({
        cellId: cell.id,
        role: "assistant",
        partsJson: buildNotebookArtifactEntry({
          executeSqlArtifactType,
          payload: nextPayload,
        }),
        createdAt,
      })
      .then(() =>
        notebookSession.updateCell(cell.id, {
          sqlDraft: manualResult.sql || null,
          selectedDbIdentifier:
            manualResult.dbIdentifier ??
            normalizeNullableString(localSelectedDb),
          selectedCatalogContext:
            manualResult.catalogContext ?? localSelectedCatalogContext,
          status: "complete",
          resultPayloadJson: JSON.stringify(nextPayload),
          lastRunAt: createdAt,
        }),
      )
      .then(() => notebookSession.refreshUpdatedAt())
      .catch((error) => {
        console.error("Failed to persist manual notebook result:", error);
      })
      .finally(() => {
        manualRunSucceededRef.current = false;
        manualRunNoticeRef.current = null;
      });
  }, [
    cell.id,
    executeSqlArtifactType,
    localSelectedCatalogContext,
    localSelectedDb,
    manualResult,
    manualVisualization,
    notebookSession,
    storedPayload,
  ]);

  const handleConsoleApiChange = useCallback(
    (api: SqlConsoleApi | null) => {
      logNotebookDebug("notebook-cell:event:console-api-change", {
        cellId: cell.id,
        hasApi: Boolean(api),
      });
      consoleApiRef.current = api;
      onRegisterConsoleApi(cell.id, api);
    },
    [cell.id, onRegisterConsoleApi],
  );

  const handleManualRunNotice = useCallback((notice: QueryNotice | null) => {
    manualRunNoticeRef.current = notice;
  }, []);

  const handleManualRunSuccess = useCallback(() => {
    manualRunSucceededRef.current = true;
  }, []);

  const handleManualRunStateChange = useCallback(
    (isRunning: boolean) => {
      if (isRunning) {
        manualRunNoticeRef.current = null;
        manualRunSucceededRef.current = false;
        return;
      }

      if (manualRunSucceededRef.current) {
        return;
      }

      const nextStatus =
        manualRunNoticeRef.current?.kind === "error" ? "error" : "idle";

      void notebookSession
        .updateCell(cell.id, {
          status: nextStatus,
        })
        .then(() => notebookSession.refreshUpdatedAt())
        .catch((error) => {
          console.error("Failed to update manual notebook run status:", error);
        })
        .finally(() => {
          manualRunNoticeRef.current = null;
        });
    },
    [cell.id, notebookSession],
  );

  const handleManualRun = useCallback(() => {
    void notebookSession.updateCell(cell.id, {
      status: "running",
      selectedDbIdentifier: normalizeNullableString(localSelectedDb),
      selectedCatalogContext: localSelectedCatalogContext,
    });
  }, [cell.id, localSelectedCatalogContext, localSelectedDb, notebookSession]);

  const handleVisualConfigChange = useCallback(
    (config: {
      chartConfig?: SqlAnalysisData["chartConfig"];
      cardConfig?: SqlAnalysisData["cardConfig"];
    }) => {
      if (!storedPayload) {
        return;
      }

      const nextPayload: SqlAnalysisData = {
        ...storedPayload,
      };

      if ("chartConfig" in config) {
        nextPayload.chartConfig = config.chartConfig;
      }

      if ("cardConfig" in config) {
        nextPayload.cardConfig = config.cardConfig;
      }

      void notebookSession.updateCell(cell.id, {
        resultPayloadJson: JSON.stringify(nextPayload),
      });
    },
    [cell.id, notebookSession, storedPayload],
  );

  const handleVisualTypeChange = useCallback(
    (visualType: "table" | "chart" | "card") => {
      if (!storedPayload) {
        return;
      }

      const nextPayload: SqlAnalysisData = {
        ...storedPayload,
        visualType,
      };

      void notebookSession.updateCell(cell.id, {
        resultPayloadJson: JSON.stringify(nextPayload),
      });
    },
    [cell.id, notebookSession, storedPayload],
  );

  const handleCellFocus = useCallback(() => {
    onFocusCell({
      cellId: cell.id,
      selectedDb: localSelectedDb,
      selectedCatalogContext: localSelectedCatalogContext,
    });
  }, [cell.id, localSelectedCatalogContext, localSelectedDb, onFocusCell]);

  const sqlReplAdapter = useMemo(
    () => ({
      result: manualResult,
      setConsoleApi: handleConsoleApiChange,
      saveQuery,
      isSavingQuery,
      persistManualResultToChat: async () => {},
    }),
    [handleConsoleApiChange, isSavingQuery, manualResult, saveQuery],
  );

  return (
    <section
      className={cn(
        "group rounded-xl border bg-card shadow-sm overflow-hidden transition-colors",
        isFocused ? "border-primary/50" : "border-border",
      )}
      onPointerDownCapture={handleCellFocus}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">
            [{`Cell ${cellIndex + 1}`}]
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide",
              cell.status === "error"
                ? "bg-destructive/10 text-destructive"
                : cell.status === "running"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {cell.status}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => void onDeleteCell(cell.id)}
          aria-label="Delete cell"
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>

      <div className="px-4 py-3">
        <NotebookCellTranscript
          messages={transcriptMessages}
          isAssistantThinking={isAssistantThinking}
          showToolCalls={showToolCalls}
          showExecuteSqlRawOutput={showExecuteSqlRawOutput}
          onRemoveMessage={onDeleteCellEntry}
        />
      </div>

      <div className="border-y border-border/60 bg-background">
        {storedPayload ? (
          <SqlAnalysisDisplay
            data={storedPayload}
            stage={storedPayload.stage}
            progress={storedPayload.progress}
            showStageIndicator={false}
            className="w-full"
            onConfigChange={handleVisualConfigChange}
            onVisualTypeChange={handleVisualTypeChange}
          />
        ) : (
          <EmptyCellVisual
            hasPrompt={Boolean(promptDraft.trim())}
            isRunning={cell.status === "running"}
          />
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        {promptError ? <PromptErrorBanner message={promptError} /> : null}
        <PromptInputWrapper
          chatComposer={{
            submitPrompt: (message) =>
              onSubmitPrompt({
                cellId: cell.id,
                message,
                selectedDb: localSelectedDb,
                selectedCatalogContext: localSelectedCatalogContext,
              }),
            status: promptStatus,
            pendingMode: promptPendingMode,
          }}
          sqlRepl={sqlReplAdapter}
          manualVisualization={manualVisualization}
          mode={mode}
          onModeChange={(nextMode) => onModeChange(cell.id, nextMode)}
          compact
          showAiInput
          onCreateDashboard={onOpenDashboardBuilder}
          selectedDb={localSelectedDb}
          selectedCatalogContext={localSelectedCatalogContext}
          manualShellVariant={CHAT_MANUAL_SHELL_VARIANT}
          integratedComposer
          promptValue={promptDraft}
          onPromptChange={setPromptDraft}
          sqlValue={sqlDraft}
          onSqlChange={setSqlDraft}
          onManualRunNotice={handleManualRunNotice}
          onManualRunStateChange={handleManualRunStateChange}
          onManualRunSuccess={handleManualRunSuccess}
          onManualRun={handleManualRun}
        />
      </div>
    </section>
  );
}
