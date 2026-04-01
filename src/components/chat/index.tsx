import type { UIMessage } from "@ai-sdk/react";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArtifactMutationProvider } from "@/components/artifact-mutation-context";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { ChatMessageThread } from "@/components/chat/chat-message-thread";
import { toUiMessages } from "@/components/chat/hooks/chat-session-utils";
import { ChatTitleBar } from "@/components/chat/chat-title-bar";
import { useChatSession } from "@/components/chat/hooks/use-chat-session";
import { useManualVisualization } from "@/components/chat/hooks/use-manual-visualization";
import { useChatUrlParams } from "@/components/chat/hooks/use-chat-url-params";
import { useSqlRepl } from "@/components/chat/hooks/use-sql-repl";
import { useVisualizationSelection } from "@/components/chat/hooks/use-visualization-selection";
import { extractSqlArtifactParts } from "@/components/chat/sql-artifact-utils";
import { PromptErrorBanner } from "@/components/chat/prompt-error-banner";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { DashboardBuilderPanel } from "@/components/dashboard-builder-panel";
import { SqlAnalysisDisplay } from "@/components/sql-analysis-display";
import {
  type ManualShellVariant,
  PromptInputWrapper,
  type PromptMode,
} from "@/components/prompt-input-wrapper";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { QueryNotice } from "@/components/sql-console";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import type { NotebookSession } from "@/hooks/use-notebook-session";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useExecuteSqlRawOutputPreference,
  useShowToolCallsPreference,
} from "@/lib/chat-display-preferences";
import { buildDashboardSourceDescriptor } from "@/lib/dashboard/source-descriptor";
import { getDefaultPromptModePreference } from "@/lib/default-prompt-mode";
import type { ExplorerInsertPayload } from "@/lib/duckdb/table-reference";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  resolveDbIdentifierForSqlBackend,
} from "@/lib/sql/sql-runtime";
import { listLegacyCompatibleMessagesByNotebookId } from "@/lib/workspace/analysis-notebook-repo";
import { useResolvedSqlBackend } from "@/lib/sql/use-sql-backend";
import { useRouter, useSearchParams } from "@/vite/next-navigation";

const CHAT_MANUAL_SHELL_VARIANT: ManualShellVariant = "minimal";
const EXECUTE_SQL_ARTIFACT_TYPE = "data-execute-sql";
const EXPLORATORY_SQL_TOOL_TYPE = "tool-execute_exploratory_sql";

function parseStoredPayload(
  resultPayloadJson: string | null | undefined,
): SqlAnalysisData | null {
  if (!resultPayloadJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(resultPayloadJson);
    return parsed && typeof parsed === "object"
      ? (parsed as SqlAnalysisData)
      : null;
  } catch {
    return null;
  }
}

function hasToolError(message: UIMessage): boolean {
  return (message.parts ?? []).some((part) => {
    if (!part.type.startsWith("tool-")) {
      return false;
    }

    return (
      ("errorText" in part &&
        typeof part.errorText === "string" &&
        part.errorText.trim().length > 0) ||
      ("error" in part &&
        typeof part.error === "string" &&
        part.error.trim().length > 0)
    );
  });
}

function mapArtifactStatusToCellStatus(
  status: string | undefined,
): "idle" | "running" | "complete" | "error" {
  if (status === "complete") {
    return "complete";
  }

  if (status === "error") {
    return "error";
  }

  if (status === "loading" || status === "streaming") {
    return "running";
  }

  return "idle";
}

function buildNotebookArtifactEntry(payload: SqlAnalysisData): string {
  const now = Date.now();

  return JSON.stringify([
    {
      type: EXECUTE_SQL_ARTIFACT_TYPE,
      data: {
        id: `notebook-artifact-${now}`,
        version: 1,
        status: "complete",
        progress: 1,
        payload,
        createdAt: now,
        updatedAt: now,
      },
    },
  ]);
}

function extractToolOutput(part: UIMessage["parts"][number]): unknown {
  if (!("output" in part) && !("result" in part)) {
    return undefined;
  }

  return "output" in part && typeof part.output !== "undefined"
    ? part.output
    : "result" in part
      ? part.result
      : undefined;
}

function extractLatestExploratoryDraft(parts: UIMessage["parts"] | undefined): {
  sql: string;
  dbIdentifier?: string;
  catalogContext?: string | null;
} | null {
  if (!parts?.length) {
    return null;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part.type !== EXPLORATORY_SQL_TOOL_TYPE) {
      continue;
    }

    const output = extractToolOutput(part);
    if (!output || typeof output !== "object") {
      continue;
    }

    const candidate = output as {
      sql?: unknown;
      dbIdentifier?: unknown;
      catalogContext?: unknown;
    };

    if (typeof candidate.sql !== "string" || !candidate.sql.trim()) {
      continue;
    }

    return {
      sql: candidate.sql,
      dbIdentifier:
        typeof candidate.dbIdentifier === "string"
          ? candidate.dbIdentifier
          : undefined,
      catalogContext:
        typeof candidate.catalogContext === "string" ||
        candidate.catalogContext === null
          ? candidate.catalogContext
          : undefined,
    };
  }

  return null;
}

export default function Chat({
  chatId,
  initialMessages,
  notebookSession,
}: {
  chatId: string;
  initialMessages?: UIMessage[];
  notebookSession?: NotebookSession;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectedTables = useConnectedTables();
  const effectiveSqlBackend = useResolvedSqlBackend();
  const [promptMode, setPromptMode] = useState<PromptMode>(() =>
    getDefaultPromptModePreference(),
  );
  const [selectedDb, setSelectedDb] = useState<string | undefined>();
  const [selectedCatalogContext, setSelectedCatalogContext] = useState<
    string | null
  >(null);
  const isMobile = useIsMobile();
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(true);
  const [isDashboardBuilderOpen, setIsDashboardBuilderOpen] = useState(false);
  const showToolCalls = useShowToolCallsPreference();
  const showExecuteSqlRawOutput = useExecuteSqlRawOutputPreference();
  const isNotebookMode = Boolean(notebookSession);
  const activeCell =
    notebookSession?.cells[notebookSession.cells.length - 1] ?? null;
  const activeCellIdRef = useRef<string | null>(activeCell?.id ?? null);
  const previousActiveCellIdRef = useRef<string | null>(activeCell?.id ?? null);
  const pendingManualRunCellIdRef = useRef<string | null>(null);
  const manualRunSucceededRef = useRef(false);
  const manualRunNoticeRef = useRef<QueryNotice | null>(null);
  const hasSeededNotebookCellRef = useRef(false);
  const [cellPromptDraft, setCellPromptDraft] = useState("");
  const [cellSqlDraft, setCellSqlDraft] = useState("");
  const hasPendingAutoNotebookPrompt = Boolean(searchParams.get("q")?.trim());
  const activeCellPayload = useMemo(
    () => parseStoredPayload(activeCell?.resultPayloadJson),
    [activeCell?.resultPayloadJson],
  );

  useEffect(() => {
    activeCellIdRef.current = activeCell?.id ?? null;
  }, [activeCell?.id]);

  useEffect(() => {
    hasSeededNotebookCellRef.current = false;
  }, [chatId]);

  const loadNotebookMessages = useCallback(async () => {
    if (!isNotebookMode) {
      return [];
    }

    return toUiMessages(
      (await listLegacyCompatibleMessagesByNotebookId(chatId)) as never,
    );
  }, [chatId, isNotebookMode]);

  const handleAssistantMessageFinished = useCallback(
    async (message: UIMessage) => {
      if (!notebookSession) {
        return;
      }

      const activeCellId = activeCellIdRef.current;
      if (!activeCellId) {
        return;
      }

      const createdAt = Date.now();
      const partsJson = JSON.stringify(message.parts ?? []);

      await notebookSession.appendCellEntry({
        cellId: activeCellId,
        role: "assistant",
        partsJson,
        createdAt,
        id: message.id,
      });

      const latestArtifact = extractSqlArtifactParts(
        message.parts,
        EXECUTE_SQL_ARTIFACT_TYPE,
      ).at(-1)?.artifactData;
      const latestExploratoryDraft = extractLatestExploratoryDraft(
        message.parts,
      );

      const nextPatch: {
        status: "idle" | "running" | "complete" | "error";
        sqlDraft?: string | null;
        resultPayloadJson?: string | null;
        lastRunAt?: number | null;
        selectedDbIdentifier?: string | null;
        selectedCatalogContext?: string | null;
      } = {
        status: hasToolError(message)
          ? "error"
          : mapArtifactStatusToCellStatus(latestArtifact?.status),
      };

      if (latestArtifact?.payload) {
        nextPatch.sqlDraft = latestArtifact.payload.query || null;
        nextPatch.resultPayloadJson = JSON.stringify(latestArtifact.payload);
        nextPatch.lastRunAt = createdAt;
        nextPatch.selectedDbIdentifier =
          latestArtifact.payload.dbIdentifier ?? selectedDb ?? null;
        nextPatch.selectedCatalogContext =
          latestArtifact.payload.catalogContext ?? selectedCatalogContext;
        setCellSqlDraft(latestArtifact.payload.query || "");
      } else if (latestExploratoryDraft) {
        nextPatch.sqlDraft = latestExploratoryDraft.sql;
        nextPatch.selectedDbIdentifier =
          latestExploratoryDraft.dbIdentifier ?? selectedDb ?? null;
        nextPatch.selectedCatalogContext =
          latestExploratoryDraft.catalogContext ?? selectedCatalogContext;
        setCellSqlDraft(latestExploratoryDraft.sql);
      }

      await notebookSession.updateCell(activeCellId, nextPatch);
      await notebookSession.refreshUpdatedAt();
    },
    [notebookSession, selectedCatalogContext, selectedDb],
  );

  const chatSession = useChatSession({
    chatId,
    initialMessages,
    executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
    loadPersistedMessages: notebookSession ? loadNotebookMessages : undefined,
    onAssistantMessageFinished: notebookSession
      ? handleAssistantMessageFinished
      : undefined,
  });
  const sqlRepl = useSqlRepl({
    chatId,
    setMessages: chatSession.thread.setMessages,
    executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
  });
  const { persistVisualPlaceholder, queueSqlLoad } = sqlRepl;
  const {
    manualVisualization,
    supplementalVisualizations: manualSupplementalVisualizations,
  } = useManualVisualization({
    sqlResult: sqlRepl.result,
    setSqlResult: sqlRepl.setResult,
    selectedCatalogContext,
  });

  const { visualizationMap } = useVisualizationSelection({
    messages: chatSession.thread.messages,
    executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
    supplementalVisualizations: isNotebookMode
      ? []
      : manualSupplementalVisualizations,
  });

  const focusManualVisualization = useCallback(() => {}, []);

  const manualVisualizationController = useMemo(
    () => ({
      ...manualVisualization,
      focusManualVisualization,
    }),
    [focusManualVisualization, manualVisualization],
  );

  useEffect(() => {
    if (!selectedDb && connectedTables.length > 0) {
      const first = connectedTables[0];
      const firstIdentifier =
        first?.connectionId ??
        first?.databasePath ??
        first?.attachAs ??
        DEFAULT_WASM_DB_IDENTIFIER;
      setSelectedDb(firstIdentifier);
    }
  }, [connectedTables, selectedDb]);

  useEffect(() => {
    if (
      !notebookSession ||
      hasSeededNotebookCellRef.current ||
      notebookSession.isLoading ||
      hasPendingAutoNotebookPrompt ||
      notebookSession.cells.length > 0
    ) {
      return;
    }

    hasSeededNotebookCellRef.current = true;
    void notebookSession.addCell();
  }, [
    notebookSession,
    notebookSession?.cells.length,
    notebookSession?.isLoading,
    hasPendingAutoNotebookPrompt,
  ]);

  useEffect(() => {
    const nextActiveCellId = activeCell?.id ?? null;
    const activeCellChanged =
      previousActiveCellIdRef.current !== nextActiveCellId;
    previousActiveCellIdRef.current = nextActiveCellId;

    if (!activeCell) {
      setCellPromptDraft("");
      setCellSqlDraft("");
      return;
    }

    if (activeCellChanged) {
      setCellPromptDraft(activeCell.promptText);
      setCellSqlDraft(activeCell.sqlDraft ?? "");
      sqlRepl.setResult(null);
      if (activeCell.selectedDbIdentifier) {
        setSelectedDb(activeCell.selectedDbIdentifier);
      }
      if (activeCell.selectedCatalogContext !== undefined) {
        setSelectedCatalogContext(activeCell.selectedCatalogContext);
      }
    }
  }, [activeCell, sqlRepl]);

  useEffect(() => {
    if (
      !notebookSession ||
      !activeCell ||
      cellPromptDraft === activeCell.promptText
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void notebookSession.updateCell(activeCell.id, {
        promptText: cellPromptDraft,
      });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeCell, cellPromptDraft, notebookSession]);

  useEffect(() => {
    if (
      !notebookSession ||
      !activeCell ||
      cellSqlDraft === (activeCell.sqlDraft ?? "")
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void notebookSession.updateCell(activeCell.id, {
        sqlDraft: cellSqlDraft || null,
        selectedDbIdentifier: selectedDb ?? null,
        selectedCatalogContext,
      });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    activeCell,
    cellSqlDraft,
    notebookSession,
    selectedCatalogContext,
    selectedDb,
  ]);

  useEffect(() => {
    if (!notebookSession || !sqlRepl.result) {
      return;
    }

    const targetCellId =
      pendingManualRunCellIdRef.current ?? activeCellIdRef.current;
    if (!targetCellId) {
      return;
    }

    const payload = manualVisualization.createPayload({
      result: sqlRepl.result,
      selectedCatalogContext,
    });
    if (!payload) {
      return;
    }

    if (activeCellPayload) {
      payload.visualType = activeCellPayload.visualType;
      payload.chartConfig = activeCellPayload.chartConfig;
      payload.cardConfig = activeCellPayload.cardConfig;
    }

    const createdAt = Date.now();

    void notebookSession
      .appendCellEntry({
        cellId: targetCellId,
        role: "assistant",
        partsJson: buildNotebookArtifactEntry(payload),
        createdAt,
      })
      .then(() =>
        notebookSession.updateCell(targetCellId, {
          sqlDraft: sqlRepl.result?.sql || null,
          selectedDbIdentifier:
            sqlRepl.result?.dbIdentifier ?? selectedDb ?? null,
          selectedCatalogContext:
            sqlRepl.result?.catalogContext ?? selectedCatalogContext,
          status: "complete",
          resultPayloadJson: JSON.stringify(payload),
          lastRunAt: createdAt,
        }),
      )
      .then(() =>
        Promise.all([
          sqlRepl.persistManualResultToChat(payload),
          notebookSession.refreshUpdatedAt(),
        ]),
      )
      .catch((error) => {
        console.error("Failed to persist manual notebook result:", error);
      })
      .finally(() => {
        pendingManualRunCellIdRef.current = null;
        manualRunSucceededRef.current = false;
        manualRunNoticeRef.current = null;
      });
  }, [
    activeCellPayload,
    manualVisualization,
    notebookSession,
    selectedCatalogContext,
    selectedDb,
    sqlRepl,
    sqlRepl.result,
  ]);

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

      const targetCellId = pendingManualRunCellIdRef.current;
      if (!notebookSession || !targetCellId || manualRunSucceededRef.current) {
        return;
      }

      const nextStatus =
        manualRunNoticeRef.current?.kind === "error" ? "error" : "idle";

      void notebookSession
        .updateCell(targetCellId, { status: nextStatus })
        .then(() => notebookSession.refreshUpdatedAt())
        .catch((error) => {
          console.error("Failed to update manual notebook run status:", error);
        })
        .finally(() => {
          pendingManualRunCellIdRef.current = null;
          manualRunNoticeRef.current = null;
        });
    },
    [notebookSession],
  );

  const handleOpenDashboardBuilder = useCallback(() => {
    setIsDashboardBuilderOpen(true);
  }, []);

  const handleInsertTableIntoSql = useCallback(
    (payload: ExplorerInsertPayload) => {
      if (!sqlRepl.consoleApi) return;
      const current = sqlRepl.consoleApi.getQuery() ?? "";
      const lastChar = current.length > 0 ? current[current.length - 1] : "";
      const needsSpace = current.length > 0 && !/\s/.test(lastChar);
      sqlRepl.consoleApi.insertText(
        `${needsSpace ? " " : ""}${payload.reference}`,
      );
      sqlRepl.consoleApi.focus();
      if (payload.dbIdentifier) {
        setSelectedDb(payload.dbIdentifier);
      }
      setSelectedCatalogContext(payload.catalogContext ?? null);
    },
    [sqlRepl.consoleApi],
  );

  const handleSubmitPrompt = useCallback(
    async (message: PromptInputMessage) => {
      if (!isNotebookMode || !notebookSession) {
        await chatSession.composer.submitPrompt(message);
        return;
      }

      const existingActiveCell =
        notebookSession.cells[notebookSession.cells.length - 1] ?? null;
      const targetCell =
        existingActiveCell ??
        (await notebookSession.addCell(message.text ?? ""));
      const promptText = message.text?.trim() ?? "";

      setCellPromptDraft(promptText);

      await notebookSession.updateCell(targetCell.id, {
        promptText,
        status: "running",
        selectedDbIdentifier: selectedDb ?? null,
        selectedCatalogContext,
      });
      await notebookSession.refreshUpdatedAt();
      await chatSession.composer.submitPrompt(message);
    },
    [
      chatSession.composer,
      isNotebookMode,
      notebookSession,
      selectedCatalogContext,
      selectedDb,
    ],
  );

  const handleStoredPayloadConfigChange = useCallback(
    (config: {
      chartConfig?: SqlAnalysisData["chartConfig"];
      cardConfig?: SqlAnalysisData["cardConfig"];
    }) => {
      if (!notebookSession || !activeCellPayload || !activeCell) {
        return;
      }

      const nextPayload: SqlAnalysisData = {
        ...activeCellPayload,
        ...(config.chartConfig ? { chartConfig: config.chartConfig } : {}),
        ...(config.cardConfig ? { cardConfig: config.cardConfig } : {}),
      };

      void notebookSession.updateCell(activeCell.id, {
        resultPayloadJson: JSON.stringify(nextPayload),
      });
    },
    [activeCell, activeCellPayload, notebookSession],
  );

  const handleStoredPayloadVisualTypeChange = useCallback(
    (visualType: "table" | "chart" | "card") => {
      if (!notebookSession || !activeCellPayload || !activeCell) {
        return;
      }

      const nextPayload: SqlAnalysisData = {
        ...activeCellPayload,
        visualType,
      };

      void notebookSession.updateCell(activeCell.id, {
        resultPayloadJson: JSON.stringify(nextPayload),
      });
    },
    [activeCell, activeCellPayload, notebookSession],
  );

  const handleAddVisual = useCallback(async () => {
    const first = connectedTables[0];
    const defaultDatabase = resolveDbIdentifierForSqlBackend(
      first?.connectionId ??
        first?.databasePath ??
        first?.attachAs ??
        DEFAULT_WASM_DB_IDENTIFIER,
      effectiveSqlBackend,
    );

    const defaultPayload: SqlAnalysisData = {
      stage: "complete",
      progress: 1,
      query: "",
      dbIdentifier: defaultDatabase,
      sqlBackend: effectiveSqlBackend,
      sourceDescriptor: buildDashboardSourceDescriptor({
        runtimeBackend: effectiveSqlBackend,
        dbIdentifier: defaultDatabase,
      }),
      isSqlExpandedInitial: true,
      rowCount: 0,
      columns: [],
      rows: [],
      visualType: "table",
      chartConfig: {
        visualType: "chart",
        title: "New visual",
        description: "",
        type: "bar",
        xKey: "",
        yKeys: [],
        multipleLines: false,
        legend: false,
        countMode: false,
      },
      summary: {
        totalRows: 0,
        insights: [],
      },
    };

    await persistVisualPlaceholder(defaultPayload);
  }, [connectedTables, effectiveSqlBackend, persistVisualPlaceholder]);

  const handleUrlSendMessage = useCallback(
    ({ text }: { text: string }) => {
      setPromptMode("ai");
      void handleSubmitPrompt({ text });
    },
    [handleSubmitPrompt],
  );

  const handleUrlLoadManualSql = useCallback(
    ({ sql, autorun }: { sql: string; autorun: boolean }) => {
      setPromptMode("manual");
      queueSqlLoad({ sql, autorun });
    },
    [queueSqlLoad],
  );

  useChatUrlParams({
    chatId,
    searchParams,
    sendMessage: handleUrlSendMessage,
    router,
    normalizedPath: isNotebookMode ? "/analysis" : "/chat",
    handleAddVisual,
    setPromptMode,
    loadManualSql: handleUrlLoadManualSql,
  });

  const handleSelectStoredSqlQuery = useCallback(
    (queryId: string) => {
      if (promptMode !== "manual") {
        sqlRepl.selectSavedQuery(queryId, {
          switchToManual: () => {
            setPromptMode("manual");
          },
        });
        return;
      }

      sqlRepl.selectSavedQuery(queryId);
    },
    [promptMode, sqlRepl],
  );

  const footerPayload = useMemo(() => {
    if (isNotebookMode) {
      return activeCellPayload;
    }

    if (promptMode !== "manual" || !sqlRepl.result) {
      return null;
    }

    return manualVisualization.createPayload({
      result: sqlRepl.result,
      selectedCatalogContext,
    });
  }, [
    activeCellPayload,
    isNotebookMode,
    manualVisualization,
    promptMode,
    selectedCatalogContext,
    sqlRepl.result,
  ]);

  const handleRemoveThreadItem = useCallback(
    async (messageId: string) => {
      if (!notebookSession) {
        await chatSession.thread.removeMessage(messageId);
        return;
      }

      const targetCell = notebookSession.cells.find(
        (cell) => cell.id === messageId,
      );
      if (targetCell) {
        const entryIds = new Set(
          (notebookSession.cellEntriesByCellId.get(targetCell.id) ?? []).map(
            (entry) => entry.id,
          ),
        );
        await notebookSession.deleteCell(targetCell.id);
        await notebookSession.refreshUpdatedAt();
        chatSession.thread.setMessages((previous) =>
          previous.filter(
            (message) =>
              message.id !== targetCell.id && !entryIds.has(message.id),
          ),
        );
        return;
      }

      for (const [cellId, entries] of notebookSession.cellEntriesByCellId) {
        if (!entries.some((entry) => entry.id === messageId)) {
          continue;
        }

        await notebookSession.deleteCellEntry(cellId, messageId);
        await notebookSession.refreshUpdatedAt();
        chatSession.thread.setMessages((previous) =>
          previous.filter((message) => message.id !== messageId),
        );
        return;
      }

      chatSession.thread.setMessages((previous) =>
        previous.filter((message) => message.id !== messageId),
      );
    },
    [chatSession.thread, notebookSession],
  );

  return (
    <ArtifactMutationProvider {...chatSession.artifactProvider}>
      <div className="chat-container relative flex h-full flex-col">
        <div className="relative flex h-full w-full flex-1 flex-col">
          <div className="flex-1 overflow-hidden bg-card">
            <div className="flex h-full">
              {!isMobile && (
                <ConnectedDataPanel
                  selectedDb={selectedDb}
                  onSelect={(db) => {
                    setSelectedDb(db);
                    setSelectedCatalogContext(null);
                  }}
                  mode="sidebar"
                  onInsertTable={handleInsertTableIntoSql}
                  refreshToken={sqlRepl.explorerRefreshToken}
                  collapsed={isExplorerCollapsed}
                  collapsedBehavior="overlay"
                  onToggleCollapse={() =>
                    setIsExplorerCollapsed((previous) => !previous)
                  }
                  className="shrink-0 bg-background"
                  sqlBackend={effectiveSqlBackend}
                  storedSqlQueries={sqlRepl.savedQueries}
                  onSelectStoredSqlQuery={handleSelectStoredSqlQuery}
                  onDeleteStoredSqlQuery={(queryId) => {
                    void sqlRepl.deleteSavedQuery(queryId);
                  }}
                  onRenameStoredSqlQuery={(queryId) => {
                    void sqlRepl.renameSavedQuery(queryId);
                  }}
                  showStoredSqlQueries
                />
              )}
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                <ChatTitleBar model={chatSession.titleBar} />
                <ChatMessageThread
                  messages={chatSession.thread.messages}
                  status={chatSession.thread.status}
                  animationFrame={chatSession.thread.animationFrame}
                  verbAiIsThinking={chatSession.thread.verbAiIsThinking}
                  executeSqlArtifactType={EXECUTE_SQL_ARTIFACT_TYPE}
                  visualizationMap={visualizationMap}
                  onRemoveMessage={handleRemoveThreadItem}
                  conversationClassName="flex-1 min-h-0"
                  contentSpacingClassName="space-y-3 pb-4"
                  messagePaddingClassName="p-3"
                  userResponsePaddingClassName="p-1"
                  showToolCalls={showToolCalls}
                  showExecuteSqlRawOutput={showExecuteSqlRawOutput}
                  footerContent={
                    <div className="w-full space-y-3">
                      <div className="w-full rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                        {footerPayload && (
                          <div className="max-h-[50vh] overflow-y-auto border-b border-border">
                            <SqlAnalysisDisplay
                              data={footerPayload}
                              stage="complete"
                              progress={1}
                              showStageIndicator={false}
                              className="w-full"
                              onConfigChange={
                                isNotebookMode
                                  ? handleStoredPayloadConfigChange
                                  : manualVisualization.handleConfigChange
                              }
                              onVisualTypeChange={
                                isNotebookMode
                                  ? handleStoredPayloadVisualTypeChange
                                  : manualVisualization.handleVisualTypeChange
                              }
                            />
                          </div>
                        )}
                        <PromptErrorBanner
                          message={chatSession.composer.promptError}
                        />
                        <div className="px-4 py-3">
                          <PromptInputWrapper
                            chatComposer={{
                              ...chatSession.composer,
                              submitPrompt: handleSubmitPrompt,
                            }}
                            sqlRepl={sqlRepl}
                            manualVisualization={
                              isNotebookMode
                                ? undefined
                                : manualVisualizationController
                            }
                            mode={promptMode}
                            onModeChange={setPromptMode}
                            compact
                            showAiInput
                            onCreateDashboard={handleOpenDashboardBuilder}
                            selectedDb={selectedDb}
                            selectedCatalogContext={selectedCatalogContext}
                            manualShellVariant={CHAT_MANUAL_SHELL_VARIANT}
                            integratedComposer={isNotebookMode}
                            promptValue={
                              isNotebookMode ? cellPromptDraft : undefined
                            }
                            onPromptChange={
                              isNotebookMode ? setCellPromptDraft : undefined
                            }
                            sqlValue={isNotebookMode ? cellSqlDraft : undefined}
                            onSqlChange={
                              isNotebookMode ? setCellSqlDraft : undefined
                            }
                            onManualRunNotice={
                              isNotebookMode
                                ? handleManualRunNotice
                                : undefined
                            }
                            onManualRunStateChange={
                              isNotebookMode
                                ? handleManualRunStateChange
                                : undefined
                            }
                            onManualRunSuccess={
                              isNotebookMode
                                ? handleManualRunSuccess
                                : undefined
                            }
                            onManualRun={
                              isNotebookMode
                                ? () => {
                                    pendingManualRunCellIdRef.current =
                                      activeCellIdRef.current;
                                    manualRunSucceededRef.current = false;
                                    manualRunNoticeRef.current = null;
                                    if (
                                      notebookSession &&
                                      activeCellIdRef.current
                                    ) {
                                      void notebookSession.updateCell(
                                        activeCellIdRef.current,
                                        {
                                          status: "running",
                                          selectedDbIdentifier:
                                            selectedDb ?? null,
                                          selectedCatalogContext,
                                        },
                                      );
                                    }
                                  }
                                : undefined
                            }
                          />
                        </div>
                      </div>
                      {notebookSession && (
                        <div className="flex justify-center pb-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-xs font-mono text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                            onClick={() => void notebookSession.addCell()}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            [+ Add Cell]
                          </button>
                        </div>
                      )}
                    </div>
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <Dialog
          open={isDashboardBuilderOpen}
          onOpenChange={setIsDashboardBuilderOpen}
        >
          <DialogContent className="flex max-h-[85vh] min-h-0 w-[calc(100vw-2rem)] max-w-4xl flex-col overflow-hidden">
            <DashboardBuilderPanel
              open={isDashboardBuilderOpen}
              onOpenChange={setIsDashboardBuilderOpen}
              messages={chatSession.thread.messages}
              selectedDbIdentifier={selectedDb}
              selectedSqlBackend={effectiveSqlBackend}
            />
          </DialogContent>
        </Dialog>
      </div>
    </ArtifactMutationProvider>
  );
}
