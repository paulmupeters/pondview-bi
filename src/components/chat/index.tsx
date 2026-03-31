import type { UIMessage } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArtifactMutationProvider } from "@/components/artifact-mutation-context";
import { ChatMessageThread } from "@/components/chat/chat-message-thread";
import { ChatTitleBar } from "@/components/chat/chat-title-bar";
import { useChatSession } from "@/components/chat/hooks/use-chat-session";
import { useManualVisualization } from "@/components/chat/hooks/use-manual-visualization";
import { useChatUrlParams } from "@/components/chat/hooks/use-chat-url-params";
import { useSqlRepl } from "@/components/chat/hooks/use-sql-repl";
import { useVisualizationSelection } from "@/components/chat/hooks/use-visualization-selection";
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useConnectedTables } from "@/hooks/use-connected-tables";
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
import { useResolvedSqlBackend } from "@/lib/sql/use-sql-backend";
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
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(true);
  const [isDashboardBuilderOpen, setIsDashboardBuilderOpen] = useState(false);
  const showToolCalls = useShowToolCallsPreference();
  const showExecuteSqlRawOutput = useExecuteSqlRawOutputPreference();

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

  const { visualizationMap } = useVisualizationSelection({
    messages: chatSession.thread.messages,
    executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
    supplementalVisualizations,
  });

  const manualVisualizationController = useMemo(
    () => ({
      ...manualVisualization,
      handleReplResultChange: (result: typeof sqlRepl.result) => {
        manualVisualization.handleReplResultChange(result);
      },
      focusManualVisualization: () => {},
    }),
    [manualVisualization],
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
                  onRemoveMessage={chatSession.thread.removeMessage}
                  conversationClassName="flex-1 min-h-0"
                  contentSpacingClassName="space-y-3 pb-4"
                  messagePaddingClassName="p-3"
                  userResponsePaddingClassName="p-1"
                  showToolCalls={showToolCalls}
                  showExecuteSqlRawOutput={showExecuteSqlRawOutput}
                  footerContent={
                    <div className="w-full rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                      {promptMode === "manual" &&
                        sqlRepl.result &&
                        (() => {
                          const manualPayload =
                            manualVisualization.createPayload({
                              result: sqlRepl.result,
                              selectedCatalogContext,
                            });
                          return manualPayload ? (
                            <div className="max-h-[50vh] overflow-y-auto border-b border-border">
                              <SqlAnalysisDisplay
                                data={manualPayload}
                                stage="complete"
                                progress={1}
                                showStageIndicator={false}
                                className="w-full"
                                onConfigChange={
                                  manualVisualization.handleConfigChange
                                }
                                onVisualTypeChange={
                                  manualVisualization.handleVisualTypeChange
                                }
                              />
                            </div>
                          ) : null;
                        })()}
                      <PromptErrorBanner
                        message={chatSession.composer.promptError}
                      />
                      <div className="px-4 py-3">
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
