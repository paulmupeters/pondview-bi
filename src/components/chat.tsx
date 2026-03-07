import { type UIMessage, useChat } from "@ai-sdk/react";
import { type ChatTransport, DirectChatTransport } from "ai";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPondviewAgent } from "@/ai/client/agent";
import { getSelectedAiProviderDisplayName } from "@/ai/gateway-model";
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
import {
  PromptInputWrapper,
  type PromptMode,
} from "@/components/prompt-input-wrapper";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { SqlConsoleApi } from "@/components/sql-console";
import { VisualizationPanel } from "@/components/visualization-panel";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import {
  getRandomVerbAiIsThinking,
  showRandomAnimation,
} from "@/lib/animations";
import { DEFAULT_WASM_DB_IDENTIFIER, resolveSqlBackend } from "@/lib/sql/sql-runtime";
import {
  useBridgeHealthStatus,
  useDuckDbHttpHealthStatus,
  useSqlBackendPreference,
} from "@/lib/sql/use-sql-backend";
import type { Config } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  appendAssistantMessage,
  appendUserMessageTx,
  type DbMessageRow,
  deleteMessageFromChat,
  ensureChat,
  getChatTitleById,
  listMessagesByChatId,
} from "@/lib/workspace/chat-repo";
import { useRouter, useSearchParams } from "@/vite/next-navigation";

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parsePartsOrFallback(
  partsJson: string | null | undefined,
  content: string,
): UIMessage["parts"] {
  const parsed = partsJson ? safeJsonParse(partsJson) : undefined;

  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed as UIMessage["parts"];
  }

  if (parsed && typeof parsed === "object") {
    const maybeParts = (parsed as { parts?: unknown }).parts;
    if (Array.isArray(maybeParts) && maybeParts.length > 0) {
      return maybeParts as UIMessage["parts"];
    }
  }

  return [{ type: "text", text: content }] as UIMessage["parts"];
}

function toUiMessages(rows: DbMessageRow[]): UIMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: parsePartsOrFallback(row.parts, row.content),
  }));
}

function deriveTitleFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.length > 20 ? `${trimmed.slice(0, 20)}...` : trimmed;
}

function toPromptErrorMessage(error: Error): string {
  const message = error.message?.trim() || "Unknown AI chat error.";
  const normalized = message.toLowerCase();
  const providerName = getSelectedAiProviderDisplayName();

  if (normalized.includes("missing ")) {
    return "Missing AI configuration. Open Settings and configure provider, API key, and model.";
  }

  if (
    normalized.includes("header ‘user-agent’ is not allowed") ||
    normalized.includes("header 'user-agent' is not allowed") ||
    (normalized.includes("cors") && normalized.includes("user-agent"))
  ) {
    return "Browser request blocked by CORS (user-agent header). Refresh and retry; if it persists, update to the latest app build.";
  }

  if (
    normalized.includes("networkerror when attempting to fetch resource") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("load failed") ||
    normalized.includes("network request failed")
  ) {
    return `Cannot reach ${providerName} from browser. Check network, ad blocker/proxy, and provider settings.`;
  }

  if (normalized.includes("authentication")) {
    return `${providerName} authentication failed. Verify provider API settings in Settings.`;
  }

  if (normalized.includes("gateway request failed")) {
    return `${providerName} request failed. Check network access and provider settings.`;
  }

  return message;
}

const EMPTY_INITIAL_MESSAGES: UIMessage[] = [];

export default function Chat({
  chatId,
  initialMessages,
}: {
  chatId: string;
  initialMessages?: UIMessage[];
}) {
  const resolvedInitialMessages = initialMessages ?? EMPTY_INITIAL_MESSAGES;
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectedTables = useConnectedTables();
  const sqlBackendPreference = useSqlBackendPreference();
  useBridgeHealthStatus();
  useDuckDbHttpHealthStatus();
  const effectiveSqlBackend = resolveSqlBackend({
    backendPreference: sqlBackendPreference,
  });
  const [promptMode, setPromptMode] = useState<PromptMode>("ai");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const hydratedMessagesRef = useRef(resolvedInitialMessages.length > 0);
  const isAiMode = promptMode === "ai";

  const agent = useMemo(
    () => createPondviewAgent(connectedTables),
    [connectedTables],
  );
  const directTransport = useMemo<ChatTransport<UIMessage>>(
    () =>
      new DirectChatTransport({
        agent,
        sendReasoning: false,
        sendSources: false,
      }) as unknown as ChatTransport<UIMessage>,
    [agent],
  );

  const { messages, setMessages, sendMessage, status } = useChat<UIMessage>({
    id: chatId,
    messages: resolvedInitialMessages,
    transport: directTransport,
    onError: (error) => {
      console.error("AI chat error:", error);
      setPromptError(toPromptErrorMessage(error));
    },
    onFinish: ({ message, isAbort, isError }) => {
      if (isAbort || isError || message.role !== "assistant") {
        return;
      }

      const textPart = Array.isArray(message.parts)
        ? message.parts.find((part) => part.type === "text")
        : undefined;
      const text =
        textPart && "text" in textPart && typeof textPart.text === "string"
          ? textPart.text
          : "";

      void appendAssistantMessage(
        chatId,
        message.id || nanoid(),
        text,
        JSON.stringify(message.parts ?? [{ type: "text", text }]),
      );
    },
  });

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
  const [explorerRefreshToken, setExplorerRefreshToken] = useState(0);
  const [manualChartConfig, setManualChartConfig] = useState<Config | null>(
    null,
  );
  const prevSqlRef = useRef<string | null>(null);
  const [isDashboardBuilderOpen, setIsDashboardBuilderOpen] = useState(false);
  const executeSqlArtifactType = "data-execute-sql";
  const [animationFrame, setAnimationFrame] = useState("");
  const [verbAiIsThinking, setVerbAiIsThinking] = useState("is thinking");
  const {
    visualizations,
    activeVisualizationId,
    handleSelectVisualization,
    getLastSelectableVisualizationIdForMessage,
  } = useVisualizationSelection({
    messages,
    executeSqlArtifactType,
  });

  const {
    rightPanelWidth,
    isResizing,
    resizeHandleRef,
    containerRef,
    handleResizeStart,
  } = useRightPanelResize();

  useEffect(() => {
    let cancelled = false;

    const loadChatTitle = async () => {
      try {
        const title = await getChatTitleById(chatId);
        if (!cancelled) {
          setChatTitle(title);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load chat title:", error);
        }
      }
    };

    void loadChatTitle();

    return () => {
      cancelled = true;
    };
  }, [chatId]);

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
    hydratedMessagesRef.current = resolvedInitialMessages.length > 0;
    if (resolvedInitialMessages.length > 0) {
      setMessages(resolvedInitialMessages);
    } else {
      setMessages([]);
    }
  }, [resolvedInitialMessages, setMessages]);

  useEffect(() => {
    if (hydratedMessagesRef.current) {
      return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      try {
        const rows = await listMessagesByChatId(chatId);
        if (!cancelled) {
          setMessages((previous) =>
            previous.length > 0 ? previous : toUiMessages(rows),
          );
          hydratedMessagesRef.current = true;
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load chat messages:", error);
        }
      }
    };

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [chatId, setMessages]);

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

  const submitAiPrompt = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text?.trim() ?? "";
      const files = message.files;

      if (!text && (!files || files.length === 0)) {
        return;
      }

      setPromptError(null);

      const now = Date.now();
      const messageId = nanoid();
      const userParts: UIMessage["parts"] = [];

      if (text) {
        userParts.push({ type: "text", text });
      }

      if (files && files.length > 0) {
        userParts.push(...(files as unknown as UIMessage["parts"][number][]));
      }

      const persistedContent =
        text || files?.[0]?.filename || "Attachment message";

      await appendUserMessageTx({
        chatId,
        messageId,
        content: persistedContent,
        partsJson: JSON.stringify(userParts),
        titleForNewChat: deriveTitleFromInput(text),
        now,
      });
      const inferredTitle = deriveTitleFromInput(text);
      if (inferredTitle) {
        setChatTitle((previous) => previous || inferredTitle);
      }

      // `sendMessage({ messageId })` expects the user message to already exist in local chat state.
      setMessages((previous) => {
        if (previous.some((message) => message.id === messageId)) {
          return previous;
        }

        const nextMessage: UIMessage = {
          id: messageId,
          role: "user",
          parts: userParts,
        };
        return [...previous, nextMessage];
      });

      if (text) {
        await sendMessage({ text, files, messageId });
        return;
      }

      await sendMessage({
        files: files ?? [],
        messageId,
      });
    },
    [chatId, sendMessage, setMessages],
  );

  const handlePromptSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (promptMode === "manual") {
        const text = message.text?.trim();
        if (text && sqlConsoleApi) {
          sqlConsoleApi.setQuery(text);
          sqlConsoleApi.focus();
        }
        return;
      }

      void submitAiPrompt(message);
    },
    [promptMode, sqlConsoleApi, submitAiPrompt],
  );

  const persistArtifactMessage = useCallback(
    async (
      artifactPart: UIMessage["parts"][number],
      now: number,
      messageId: string,
    ) => {
      const nextMessage: UIMessage = {
        id: messageId,
        role: "assistant",
        parts: [artifactPart],
      };

      setMessages((previous) => [...previous, nextMessage]);

      await ensureChat(chatId, "SQL Query Results", now);
      await appendAssistantMessage(
        chatId,
        messageId,
        "",
        JSON.stringify([artifactPart]),
        now,
      );
    },
    [chatId, setMessages],
  );

  const handleAddVisual = useCallback(async () => {
    const now = Date.now();
    const messageId = `manual-visual-${now}`;
    const artifactId = `manual-artifact-${now}`;
    const first = connectedTables[0];
    const defaultDatabase =
      first?.connectionId ??
      first?.databasePath ??
      first?.attachAs ??
      DEFAULT_WASM_DB_IDENTIFIER;

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

    try {
      await persistArtifactMessage(newArtifactPart, now, messageId);
    } catch (error) {
      console.error("Failed to persist visual placeholder:", error);
    }
  }, [connectedTables, persistArtifactMessage]);

  useChatUrlParams({
    chatId,
    searchParams,
    sendMessage: ({ text }) => {
      setPromptMode("ai");
      void submitAiPrompt({ text });
    },
    router,
    handleAddVisual,
    setPromptMode,
  });
  useEffect(() => {
    if (status === "streaming" || status === "submitted") {
      const animation = showRandomAnimation(
        undefined,
        Number.POSITIVE_INFINITY,
        (frame) => setAnimationFrame(frame),
      );
      return () => animation.stop();
    }
    setAnimationFrame("");
  }, [status]);

  useEffect(() => {
    setVerbAiIsThinking(getRandomVerbAiIsThinking());
  }, []);

  const handleAddSqlResultToChat = useCallback(
    async (payload: SqlAnalysisData) => {
      const now = Date.now();
      const messageId = `sql-${now}`;
      const artifactId = `sql-artifact-${now}`;
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

      try {
        await persistArtifactMessage(artifactPart, now, messageId);
      } catch (error) {
        console.error("Failed to persist SQL result message:", error);
      }
    },
    [persistArtifactMessage],
  );

  const handleRemoveMessage = useCallback(
    async (messageId: string) => {
      setMessages((previous) =>
        previous.filter((message) => message.id !== messageId),
      );
      try {
        await deleteMessageFromChat(chatId, messageId);
      } catch (error) {
        console.error("Failed to delete message:", error);
      }
    },
    [chatId, setMessages],
  );

  const handleReplResultChange = useCallback(
    (
      result: {
        sql: string;
        rows: Record<string, unknown>[];
        columns: { name: string; type?: string }[];
        durationMs: number;
      } | null,
    ) => {
      setSqlResult(result);
      if (result) {
        setExplorerRefreshToken((previous) => previous + 1);
      }

      const newSql = result?.sql ?? null;
      if (newSql !== prevSqlRef.current) {
        setManualChartConfig(null);
        prevSqlRef.current = newSql;
      }
    },
    [],
  );

  const rightPanelContent = (
    <div className="relative h-full w-full overflow-hidden">
      <div className="border-border/70 px-3 py-4">
        <p
          className="truncate text-xs font-medium text-muted-foreground"
          title={chatTitle || "Untitled chat"}
        >
          {chatTitle || "Untitled chat"}
        </p>
      </div>
      <div
        aria-hidden={!isAiMode || isDashboardBuilderOpen}
        className={cn(
          "absolute inset-x-0 bottom-0 top-9 flex flex-col transition-all duration-300 ease-out",
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
          "absolute inset-x-0 bottom-0 top-9 flex flex-col transition-all duration-300 ease-out",
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
          "absolute inset-x-0 bottom-0 top-9 flex flex-col transition-all duration-300 ease-out",
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
      <div className="chat-container flex h-screen flex-col">
        <div className="flex flex-1 min-h-0 w-full flex-col relative">
          <div className="flex-1 overflow-hidden bg-card">
            <div
              ref={containerRef}
              className={cn("flex h-full", isResizing && "select-none")}
            >
              <div
                className="flex flex-col min-w-0 h-full overflow-hidden"
                style={{ width: `${100 - rightPanelWidth}%` }}
              >
                <div className="flex-1 min-h-0 flex overflow-hidden">
                  <ConnectedDataPanel
                    selectedDb={selectedDb}
                    onSelect={setSelectedDb}
                    mode="sidebar"
                    onInsertTable={handleInsertTableIntoSql}
                    refreshToken={explorerRefreshToken}
                    collapsed={isExplorerCollapsed}
                    onToggleCollapse={() =>
                      setIsExplorerCollapsed((prev) => !prev)
                    }
                    className="shrink-0 bg-background"
                    sqlBackend={effectiveSqlBackend}
                  />
                  <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                    {isAiMode ? (
                      <ChatMessageThread
                        messages={messages}
                        status={status}
                        animationFrame={animationFrame}
                        verbAiIsThinking={verbAiIsThinking}
                        executeSqlArtifactType={executeSqlArtifactType}
                        activeVisualizationId={activeVisualizationId}
                        getLastSelectableVisualizationIdForMessage={
                          getLastSelectableVisualizationIdForMessage
                        }
                        onSelectVisualization={handleSelectVisualization}
                        onRemoveMessage={handleRemoveMessage}
                        conversationClassName="flex-1 min-h-0"
                        contentSpacingClassName="space-y-2"
                        messagePaddingClassName="p-3"
                        userResponsePaddingClassName="p-1"
                      />
                    ) : (
                      <div className="flex-1 min-h-0 w-full p-3">
                        <div className="h-full min-h-0 overflow-hidden">
                          <DuckdbRepl
                            className="h-full w-full border-r-0 p-0"
                            selectedDbIdentifier={selectedDb}
                            onConsoleApiChangeAction={setSqlConsoleApi}
                            inlineResults={false}
                            showRunControls={false}
                            chartConfig={manualChartConfig}
                            onResultChangeAction={handleReplResultChange}
                          />
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={handleAddVisual}
                            className="rounded border border-border px-3 py-1 text-xs"
                          >
                            Add Visual
                          </button>
                          <button
                            type="button"
                            onClick={handleOpenDashboardBuilder}
                            className="rounded border border-border px-3 py-1 text-xs"
                          >
                            Build Dashboard
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const latest = messages[messages.length - 1];
                              if (latest) {
                                void handleRemoveMessage(latest.id);
                              }
                            }}
                            className="rounded border border-border px-3 py-1 text-xs"
                            disabled={messages.length === 0}
                          >
                            Remove Last Visual
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                ref={resizeHandleRef}
                onPointerDown={handleResizeStart}
                className={cn(
                  "hidden lg:block w-1 shrink-0 cursor-col-resize transition-colors hover:bg-border",
                  isResizing && "bg-border",
                )}
              />
              <div
                className="hidden lg:flex flex-col min-w-0 h-full border-l border-border"
                style={{ width: `${rightPanelWidth}%` }}
              >
                {rightPanelContent}
              </div>
            </div>
          </div>

          <div className="lg:hidden border-t border-border bg-background">
            <div className="h-[400px] p-6">{rightPanelContent}</div>
          </div>
        </div>
        <div className="border-t border-border bg-background p-3">
          <div className="mx-auto w-full max-w-5xl">
            {promptError ? (
              <p className="mb-2 text-xs text-destructive">{promptError}</p>
            ) : null}
            <PromptInputWrapper
              onSubmit={handlePromptSubmit}
              mode={promptMode}
              onModeChange={setPromptMode}
              pendingMode={
                status === "submitted" || status === "streaming" ? "ai" : null
              }
              status={status}
              compact
              showAiInput
              onCreateDashboard={handleOpenDashboardBuilder}
            />
          </div>
        </div>
      </div>
    </ArtifactMutationProvider>
  );
}
