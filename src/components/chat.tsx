"use client";

import { type UIMessage, useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { ArtifactMutationProvider } from "@/components/artifact-mutation-context";
import { ChatMessageThread } from "@/components/chat/chat-message-thread";
import { useChatUrlParams } from "@/components/chat/hooks/use-chat-url-params";
import { useRightPanelResize } from "@/components/chat/hooks/use-right-panel-resize";
import { useVisualizationSelection } from "@/components/chat/hooks/use-visualization-selection";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { DashboardBuilderPanel } from "@/components/dashboard-builder-panel";
import { DuckdbRepl } from "@/components/duckdb-shell/repl";
import { ManualModeResultsPanel } from "@/components/manual-mode-results-panel";
import { PromptInputWrapper } from "@/components/prompt-input-wrapper";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { SqlConsoleApi } from "@/components/sql-console";
import { VisualizationPanel } from "@/components/visualization-panel";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import {
  getRandomVerbAiIsThinking,
  showRandomAnimation,
} from "@/lib/animations";
import type { Config } from "@/lib/types";
import { cn } from "@/lib/utils";

type PromptMode = "ai" | "manual";

export default function Chat({
  chatId,
  initialMessages = [],
}: {
  chatId: string;
  initialMessages?: UIMessage[];
}) {
  const connectedTables = useConnectedTables();
  const [promptMode, setPromptMode] = useState<PromptMode>("ai");
  const [promptPendingMode, setPromptPendingMode] = useState<PromptMode | null>(
    null,
  );
  const isAiMode = promptMode === "ai";

  // Manual mode state
  const [selectedDb, setSelectedDb] = useState<string | undefined>();
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(true);
  const [sqlConsoleApi, setSqlConsoleApi] = useState<SqlConsoleApi | null>(
    null,
  );
  const [sqlResult, setSqlResult] = useState<{
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
  } | null>(null);
  const [manualChartConfig, setManualChartConfig] = useState<Config | null>(
    null,
  );
  const prevSqlRef = useRef<string | null>(null);
  const {
    rightPanelWidth,
    isResizing,
    resizeHandleRef,
    containerRef,
    handleResizeStart,
  } = useRightPanelResize();

  // Initialize selectedDb with first connected table's database if available
  useEffect(() => {
    if (!selectedDb && connectedTables.length > 0) {
      setSelectedDb(connectedTables[0]?.databasePath);
    }
  }, [connectedTables, selectedDb]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/${"api/chat"}/${chatId}`,
        fetch: (() => {
          const customFetch = (async (
            url: RequestInfo | URL,
            options?: RequestInit,
          ) => {
            // Add connected tables to the request body
            if (options?.body) {
              const body = JSON.parse(options.body as string);
              return fetch(url, {
                ...options,
                body: JSON.stringify({
                  ...body,
                  connectedTables,
                }),
              });
            }
            return fetch(url, options);
          }) as typeof fetch;
          // Preserve Next.js augmented fetch.preconnect to satisfy typeof fetch
          type FetchWithPreconnect = typeof fetch & {
            preconnect?: (...args: unknown[]) => unknown;
          };
          const fetchWithPreconnect = fetch as FetchWithPreconnect;
          const customFetchWithPreconnect = customFetch as FetchWithPreconnect;
          customFetchWithPreconnect.preconnect =
            fetchWithPreconnect.preconnect?.bind(fetch) ?? (() => {});
          return customFetch;
        })(),
      }),
    [chatId, connectedTables],
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const { messages, sendMessage, status, setMessages } = useChat({
    id: chatId,
    messages: initialMessages.length > 0 ? initialMessages : undefined,
    transport,
  });
  const [animationFrame, setAnimationFrame] = useState("");
  const [verbAiIsThinking, setVerbAiIsThinking] = useState("is thinking");
  const [isDashboardBuilderOpen, setIsDashboardBuilderOpen] = useState(false);
  const executeSqlArtifactType = "data-execute-sql";
  const {
    visualizations,
    activeVisualizationId,
    handleSelectVisualization,
    getFirstSelectableVisualizationIdForMessage,
  } = useVisualizationSelection({
    messages,
    executeSqlArtifactType,
  });

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);

    if (!hasText) {
      return;
    }
    sendMessage({
      text: message.text ?? "",
    });
  };

  const handleOpenDashboardBuilder = () => {
    setIsDashboardBuilderOpen(true);
  };

  const handleInsertTableIntoSql = (tableName: string) => {
    if (!sqlConsoleApi) return;
    const current = sqlConsoleApi.getQuery() ?? "";
    const lastChar = current.length > 0 ? current[current.length - 1] : "";
    const needsSpace = current.length > 0 && !/\s/.test(lastChar);
    sqlConsoleApi.insertText(`${needsSpace ? " " : ""}${tableName}`);
    sqlConsoleApi.focus();
  };

  const handleAddVisual = useCallback(async () => {
    setPromptPendingMode("manual");
    const now = Date.now();
    const messageId = `manual-visual-${now}`;
    const artifactId = `manual-artifact-${now}`;
    const defaultDatabase = connectedTables[0]?.databasePath ?? "md:my_db";

    const defaultPayload: SqlAnalysisData = {
      stage: "complete",
      progress: 1,
      query: "",
      dbIdentifier: defaultDatabase,
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

    const newArtifactPart = {
      type: executeSqlArtifactType as `data-${string}`,
      data: {
        id: artifactId,
        version: 1,
        status: "complete",
        progress: 1,
        payload: defaultPayload,
        createdAt: now,
        updatedAt: now,
      },
    } as unknown as UIMessage["parts"][number];

    const newMessage: UIMessage = {
      id: messageId,
      role: "assistant",
      parts: [newArtifactPart],
    };

    // Update local state immediately for responsive UI
    setMessages((prevMessages) => [...prevMessages, newMessage]);
    setPromptPendingMode((current) => (current === "manual" ? null : current));

    // Persist to database
    try {
      await fetch(`/api/chat/${chatId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          content: "",
          parts: [newArtifactPart],
          createdAt: now,
        }),
      });
    } catch (error) {
      console.error("Failed to persist message:", error);
    }
  }, [chatId, connectedTables, setMessages]);

  const handleAddSqlResultToChat = useCallback(
    async (payload: SqlAnalysisData) => {
      const now = Date.now();
      const normalizedPayload: SqlAnalysisData = {
        stage: payload.stage ?? "complete",
        progress: payload.progress ?? 1,
        query: payload.query ?? "",
        dbIdentifier: payload.dbIdentifier,
        executionTime: payload.executionTime,
        rowCount:
          payload.rowCount ??
          payload.rows?.length ??
          payload.summary?.totalRows ??
          0,
        columns: payload.columns ?? [],
        rows: payload.rows ?? [],
        visualType: payload.visualType ?? "table",
        chartConfig: payload.chartConfig,
        cardConfig: payload.cardConfig,
        summary: payload.summary ?? {
          totalRows: payload.rows?.length ?? 0,
          executionTimeMs: payload.executionTime,
          insights: [],
        },
      };

      const messageId = `sql-${now}`;
      const artifactId = `sql-artifact-${now}`;
      const artifactPart = {
        type: executeSqlArtifactType as `data-${string}`,
        data: {
          id: artifactId,
          version: 1,
          status: "complete",
          progress: 1,
          payload: normalizedPayload,
          createdAt: now,
          updatedAt: now,
        },
      } as unknown as UIMessage["parts"][number];

      const newMessage: UIMessage = {
        id: messageId,
        role: "assistant",
        parts: [artifactPart],
      };

      // Update local state immediately for responsive UI
      setMessages((prev) => [...prev, newMessage]);

      // Persist to database
      try {
        await fetch(`/api/chat/${chatId}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId,
            content: "",
            parts: [artifactPart],
            createdAt: now,
          }),
        });
      } catch (error) {
        console.error("Failed to persist message:", error);
      }
    },
    [chatId, setMessages],
  );

  const handleRemoveMessage = useCallback(
    async (messageId: string) => {
      // Optimistically remove from UI
      setMessages((prev) => prev.filter((message) => message.id !== messageId));

      // Attempt to delete, then always reload from server to avoid rehydration
      try {
        await fetch(`/api/chat/${chatId}/message/${messageId}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.error("Failed to delete message:", error);
      } finally {
        try {
          const reload = await fetch(`/api/chat/${chatId}`, {
            cache: "no-store",
          });
          if (reload.ok) {
            const data = (await reload.json()) as { messages: UIMessage[] };
            setMessages(data.messages ?? []);
          }
        } catch {
          // Ignore reload errors
        }
      }
    },
    [chatId, setMessages],
  );

  useChatUrlParams({
    chatId,
    searchParams,
    sendMessage,
    router,
    handleAddVisual,
    setPromptMode,
  });

  // Animation effect for streaming status
  useEffect(() => {
    if (status === "streaming" || status === "submitted") {
      const animation = showRandomAnimation(
        undefined,
        Number.POSITIVE_INFINITY, // Run indefinitely
        (frame) => setAnimationFrame(frame),
      );
      return () => animation.stop();
    }
    setAnimationFrame("");
  }, [status]);

  useEffect(() => {
    setVerbAiIsThinking(getRandomVerbAiIsThinking());
  }, []);

  const isConversationEmpty = messages.length === 0;

  const manualWorkspace = (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <ChatMessageThread
          messages={messages}
          status={status}
          animationFrame={animationFrame}
          verbAiIsThinking={verbAiIsThinking}
          executeSqlArtifactType={executeSqlArtifactType}
          activeVisualizationId={activeVisualizationId}
          getFirstSelectableVisualizationIdForMessage={
            getFirstSelectableVisualizationIdForMessage
          }
          onSelectVisualization={handleSelectVisualization}
          onRemoveMessage={handleRemoveMessage}
          conversationClassName="flex-1 min-h-0 h-full"
          contentSpacingClassName="space-y-6"
          messagePaddingClassName="p-4"
          userResponsePaddingClassName="p-4"
        />
      </div>
    </div>
  );

  const rightPanelContent = (
    <div className="relative h-full w-full overflow-hidden">
      <div
        aria-hidden={!isAiMode || isDashboardBuilderOpen}
        className={cn(
          "absolute inset-0 flex flex-col transition-all duration-300 ease-out",
          isAiMode && !isDashboardBuilderOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-2 pointer-events-none",
        )}
      >
        <VisualizationPanel
          visualizations={visualizations}
          selectedVisualizationId={activeVisualizationId}
        />
      </div>
      <div
        aria-hidden={isAiMode || isDashboardBuilderOpen}
        className={cn(
          "absolute inset-0 flex flex-col transition-all duration-300 ease-out",
          isAiMode || isDashboardBuilderOpen
            ? "opacity-0 translate-y-2 pointer-events-none"
            : "opacity-100 translate-y-0 pointer-events-auto",
        )}
      >
        <ManualModeResultsPanel
          sqlResult={sqlResult}
          onSwitchToAiMode={() => setPromptMode("ai")}
          chartConfig={manualChartConfig}
          onChartConfigChange={setManualChartConfig}
          onAddToChatAction={handleAddSqlResultToChat}
          selectedDbIdentifier={selectedDb}
        />
      </div>
      <div
        aria-hidden={!isDashboardBuilderOpen}
        className={cn(
          "absolute inset-0 flex flex-col transition-all duration-300 ease-out",
          isDashboardBuilderOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-2 pointer-events-none",
        )}
      >
        <DashboardBuilderPanel
          open={isDashboardBuilderOpen}
          onOpenChange={setIsDashboardBuilderOpen}
          messages={messages}
          embedded
        />
      </div>
    </div>
  );

  return (
    <ArtifactMutationProvider
      chatId={chatId}
      messages={messages}
      setMessages={setMessages}
      executeSqlArtifactType={executeSqlArtifactType}
    >
      <div
        className={`chat-container flex h-screen transition-all duration-300 ${
          isConversationEmpty
            ? "flex-col items-center justify-center"
            : "flex-col"
        }`}
      >
        <div className="flex h-full w-full flex-col relative">
          {/* Two-column layout: Messages on left, Visualizations on right */}
          <div className="flex-1 overflow-hidden bg-card">
            <div ref={containerRef} className="flex h-full">
              {/* Left Panel */}
              <div
                className="flex flex-col min-w-0 h-full overflow-hidden"
                style={{
                  width: `calc(100% - ${rightPanelWidth}% - ${isResizing ? "0px" : "4px"})`,
                  transition: isResizing ? "none" : "width 0.2s ease-out",
                }}
              >
                <div
                  className={cn(
                    "flex-1 min-h-0 flex overflow-hidden",
                    isAiMode && "h-full",
                  )}
                >
                  <ConnectedDataPanel
                    selectedDb={selectedDb}
                    onSelect={setSelectedDb}
                    mode="sidebar"
                    onInsertTable={handleInsertTableIntoSql}
                    collapsed={isExplorerCollapsed}
                    onToggleCollapse={() =>
                      setIsExplorerCollapsed((prev) => !prev)
                    }
                    className="shrink-0 bg-background"
                  />
                  <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                    {promptMode === "ai" ? (
                      <>
                        <ChatMessageThread
                          messages={messages}
                          status={status}
                          animationFrame={animationFrame}
                          verbAiIsThinking={verbAiIsThinking}
                          executeSqlArtifactType={executeSqlArtifactType}
                          activeVisualizationId={activeVisualizationId}
                          getFirstSelectableVisualizationIdForMessage={
                            getFirstSelectableVisualizationIdForMessage
                          }
                          onSelectVisualization={handleSelectVisualization}
                          onRemoveMessage={handleRemoveMessage}
                          conversationClassName="flex-1 min-h-0"
                          contentSpacingClassName="space-y-2"
                          messagePaddingClassName="p-3"
                          userResponsePaddingClassName="p-1"
                        />
                        <div className="shrink-0 w-full px-3 pb-2 pt-1 border-t border-border/20 bg-card">
                          <PromptInputWrapper
                            onSubmit={handleSubmit}
                            showHeader
                            showAiInput
                            className="transition delay-150 duration-300 ease-in-out"
                            status={status}
                            onCreateDashboard={handleOpenDashboardBuilder}
                            onAddVisual={handleAddVisual}
                            mode={promptMode}
                            onModeChange={setPromptMode}
                            pendingMode={promptPendingMode}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        {manualWorkspace}
                        <div className="shrink-0 w-full px-3 pb-2 pt-1 border-t border-border/20 bg-card">
                          <PromptInputWrapper
                            onSubmit={handleSubmit}
                            showHeader
                            showAiInput={false}
                            compact
                            className="transition delay-150 duration-300 ease-in-out"
                            status={status}
                            onCreateDashboard={handleOpenDashboardBuilder}
                            onAddVisual={handleAddVisual}
                            mode={promptMode}
                            onModeChange={setPromptMode}
                            pendingMode={promptPendingMode}
                          />
                          <div className="h-[44vh] min-h-[280px] overflow-hidden rounded-md border border-border/30 mt-1">
                            <DuckdbRepl
                              className="h-full w-full border-r-0 p-0"
                              selectedDbIdentifier={selectedDb}
                              onConsoleApiChangeAction={setSqlConsoleApi}
                              inlineResults={false}
                              showRunControls={false}
                              chartConfig={manualChartConfig}
                              onResultChangeAction={(result) => {
                                setSqlResult(result);
                                const newSql = result?.sql ?? null;
                                if (newSql !== prevSqlRef.current) {
                                  setManualChartConfig(null);
                                  prevSqlRef.current = newSql;
                                }
                              }}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Resize Handle */}
              <div
                ref={resizeHandleRef}
                onPointerDown={handleResizeStart}
                className={cn(
                  "hidden lg:block w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors relative z-10",
                  "hover:w-1.5",
                  isResizing && "bg-primary w-1.5",
                )}
                style={{
                  touchAction: "none",
                }}
              />

              {/* Right: Visualization Panel or Manual Results */}
              <div
                className="hidden lg:flex flex-col min-w-0 h-full"
                style={{
                  width: `${rightPanelWidth}%`,
                  transition: isResizing ? "none" : "width 0.2s ease-out",
                }}
              >
                {rightPanelContent}
              </div>
            </div>
          </div>

          {/* Visualization Panel for Mobile (below messages) */}
          <div className="lg:hidden border-t border-border bg-background">
            <div className="h-[400px] p-6">{rightPanelContent}</div>
          </div>
        </div>
      </div>
      {/* <AIDevtools /> */}
    </ArtifactMutationProvider>
  );
}
