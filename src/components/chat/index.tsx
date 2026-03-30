import type { UIMessage } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArtifactMutationProvider } from "@/components/artifact-mutation-context";
import { ChatMessageThread } from "@/components/chat/chat-message-thread";
import { ChatTitleBar } from "@/components/chat/chat-title-bar";
import { useChatSession } from "@/components/chat/hooks/use-chat-session";
import {
  MANUAL_REPL_VISUALIZATION_ID,
  useManualVisualization,
} from "@/components/chat/hooks/use-manual-visualization";
import { useChatUrlParams } from "@/components/chat/hooks/use-chat-url-params";
import { useRightPanelResize } from "@/components/chat/hooks/use-right-panel-resize";
import { useSqlRepl } from "@/components/chat/hooks/use-sql-repl";
import { useVisualizationSelection } from "@/components/chat/hooks/use-visualization-selection";
import { PromptErrorBanner } from "@/components/chat/prompt-error-banner";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { DashboardBuilderPanel } from "@/components/dashboard-builder-panel";
import {
  type ManualShellVariant,
  PromptInputWrapper,
  type PromptMode,
} from "@/components/prompt-input-wrapper";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { VisualizationPanel } from "@/components/visualization-panel";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import { useIsLg, useIsMobile } from "@/hooks/use-mobile";
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
import { useResolvedSqlBackend } from "@/lib/sql/use-sql-backend";
import { cn } from "@/lib/utils";
import { useRouter, useSearchParams } from "@/vite/next-navigation";

const CHAT_MANUAL_SHELL_VARIANT: ManualShellVariant = "minimal";
const EXECUTE_SQL_ARTIFACT_TYPE = "data-execute-sql";

export default function Chat({
  chatId,
  initialMessages,
}: {
  chatId: string;
  initialMessages?: UIMessage[];
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
  const isLgScreen = useIsLg();
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(true);
  const [isDashboardBuilderOpen, setIsDashboardBuilderOpen] = useState(false);
  const showToolCalls = useShowToolCallsPreference();
  const showExecuteSqlRawOutput = useExecuteSqlRawOutputPreference();
  const {
    rightPanelWidth,
    isResizing,
    resizeHandleRef,
    containerRef,
    handleResizeStart,
  } = useRightPanelResize();

  const chatSession = useChatSession({
    chatId,
    initialMessages,
    executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
  });
  const sqlRepl = useSqlRepl({
    chatId,
    setMessages: chatSession.thread.setMessages,
    executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
  });
  const { manualVisualization, supplementalVisualizations } =
    useManualVisualization({
      sqlResult: sqlRepl.result,
      setSqlResult: sqlRepl.setResult,
      selectedCatalogContext,
    });

  const {
    visualizations,
    activeVisualizationId,
    handleSelectVisualization,
    getLastSelectableVisualizationIdForMessage,
  } = useVisualizationSelection({
    messages: chatSession.thread.messages,
    executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
    supplementalVisualizations,
  });

  const manualVisualizationController = useMemo(
    () => ({
      ...manualVisualization,
      handleReplResultChange: (result: typeof sqlRepl.result) => {
        manualVisualization.handleReplResultChange(result);
        if (result) {
          handleSelectVisualization(MANUAL_REPL_VISUALIZATION_ID);
        }
      },
      focusManualVisualization: () => {
        if (!sqlRepl.result) {
          return;
        }
        handleSelectVisualization(MANUAL_REPL_VISUALIZATION_ID);
      },
    }),
    [handleSelectVisualization, manualVisualization, sqlRepl.result],
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

    await sqlRepl.persistVisualPlaceholder(defaultPayload);
  }, [connectedTables, effectiveSqlBackend, sqlRepl]);

  useChatUrlParams({
    chatId,
    searchParams,
    sendMessage: ({ text }) => {
      setPromptMode("ai");
      void chatSession.composer.submitPrompt({ text });
    },
    router,
    handleAddVisual,
    setPromptMode,
    loadManualSql: ({ sql, autorun }) => {
      setPromptMode("manual");
      sqlRepl.queueSqlLoad({ sql, autorun });
    },
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

  const rightPanelContent = (
    <div className="relative h-full w-full overflow-hidden bg-card">
      <ChatTitleBar model={chatSession.titleBar} />
      <div className="absolute inset-x-0 bottom-0 top-[45px] flex flex-col">
        <VisualizationPanel
          visualizations={visualizations}
          selectedVisualizationId={activeVisualizationId}
        />
      </div>
    </div>
  );

  return (
    <ArtifactMutationProvider {...chatSession.artifactProvider}>
      <div className="chat-container relative flex h-full flex-col">
        <div className="relative flex h-full w-full flex-1 flex-col">
          <div className="flex-1 overflow-hidden bg-card">
            <div
              ref={containerRef}
              className={cn("flex h-full", isResizing && "select-none")}
            >
              <div
                className={cn(
                  "flex h-full min-w-0 flex-col overflow-hidden",
                  !isLgScreen && "w-full",
                )}
                style={
                  isLgScreen ? { width: `${100 - rightPanelWidth}%` } : undefined
                }
              >
                <div className="flex min-h-0 flex-1 overflow-hidden">
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
                    <ChatMessageThread
                      messages={chatSession.thread.messages}
                      status={chatSession.thread.status}
                      animationFrame={chatSession.thread.animationFrame}
                      verbAiIsThinking={chatSession.thread.verbAiIsThinking}
                      executeSqlArtifactType={EXECUTE_SQL_ARTIFACT_TYPE}
                      activeVisualizationId={activeVisualizationId}
                      getLastSelectableVisualizationIdForMessage={
                        getLastSelectableVisualizationIdForMessage
                      }
                      onSelectVisualization={handleSelectVisualization}
                      onRemoveMessage={chatSession.thread.removeMessage}
                      conversationClassName="flex-1 min-h-0"
                      contentSpacingClassName={cn(
                        "space-y-2",
                        promptMode === "manual"
                          ? "pb-[16rem] md:pb-[28rem] lg:pb-[32rem]"
                          : "pb-24 md:pb-32 lg:pb-36",
                      )}
                      messagePaddingClassName="p-3"
                      userResponsePaddingClassName="p-1"
                      showToolCalls={showToolCalls}
                      showExecuteSqlRawOutput={showExecuteSqlRawOutput}
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50">
                      <div className="h-12 bg-gradient-to-t from-card via-card/80 to-transparent" />
                      <div className="pointer-events-auto w-full bg-card px-4 pb-4">
                        <PromptErrorBanner
                          message={chatSession.composer.promptError}
                        />
                        <PromptInputWrapper
                          chatComposer={chatSession.composer}
                          sqlRepl={sqlRepl}
                          manualVisualization={manualVisualizationController}
                          mode={promptMode}
                          onModeChange={setPromptMode}
                          compact
                          showAiInput
                          onCreateDashboard={handleOpenDashboardBuilder}
                          selectedDb={selectedDb}
                          selectedCatalogContext={selectedCatalogContext}
                          manualShellVariant={CHAT_MANUAL_SHELL_VARIANT}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                ref={resizeHandleRef}
                onPointerDown={handleResizeStart}
                className={cn(
                  "group/resize hidden w-2 shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-border/40 lg:flex",
                  isResizing && "bg-border/60",
                )}
              >
                <div
                  className={cn(
                    "h-8 w-0.5 rounded-full bg-border/60 transition-all group-hover/resize:h-12 group-hover/resize:bg-primary/40",
                    isResizing && "h-12 bg-primary/50",
                  )}
                />
              </div>
              <div
                className="hidden h-full min-w-0 flex-col border-l border-border lg:flex"
                style={{ width: `${rightPanelWidth}%` }}
              >
                {rightPanelContent}
              </div>
            </div>
          </div>

          <div className="border-t border-border/50 bg-card lg:hidden">
            <div className="h-[250px]">{rightPanelContent}</div>
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
