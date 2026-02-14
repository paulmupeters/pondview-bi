"use client";

import { type UIMessage, useChat } from "@ai-sdk/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { DefaultChatTransport } from "ai";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import { ArtifactMutationProvider } from "@/components/artifact-mutation-context";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { DashboardBuilderPanel } from "@/components/dashboard-builder-panel";
import { DuckdbRepl } from "@/components/duckdb-shell/repl";
import { ManualModeResultsPanel } from "@/components/manual-mode-results-panel";
import { PromptInputWrapper } from "@/components/prompt-input-wrapper";
import type {
  SqlAnalysisData,
  SqlAnalysisStage,
} from "@/components/sql-analysis-display.types";
import type { SqlConsoleApi } from "@/components/sql-console";
import { Button } from "@/components/ui/button";
import { VisualizationPanel } from "@/components/visualization-panel";
import type { ArtifactStatus } from "@/hooks/types";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import {
  getRandomVerbAiIsThinking,
  showRandomAnimation,
} from "@/lib/animations";
import type { Config } from "@/lib/types";
import { cn } from "@/lib/utils";

const AUTO_SENT_FLAG_PREFIX = "autoSent:";
const AUTO_SENT_STALE_MS = 5 * 60 * 1000;
const AUTO_SENT_CLEANUP_DELAY_MS = 3_000;
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
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);
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

  // Right panel resize state
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 40; // Default 40% of container
    const saved = window.localStorage.getItem("chat-right-panel-width");
    return saved ? parseFloat(saved) : 40;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [pointerId, setPointerId] = useState<number | null>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
  const [autoSentFromQuery, setAutoSentFromQuery] = useState(false);
  const [manualVisualHandled, setManualVisualHandled] = useState(false);
  const [animationFrame, setAnimationFrame] = useState("");
  const [verbAiIsThinking, setVerbAiIsThinking] = useState("is thinking");
  const [isDashboardBuilderOpen, setIsDashboardBuilderOpen] = useState(false);
  const executeSqlArtifactType = "data-execute-sql";

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

  // Cleanup any stale auto-send markers that may be leftover from previous sessions
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const now = Date.now();
    const keysToRemove: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(AUTO_SENT_FLAG_PREFIX)) {
        continue;
      }

      const rawValue = window.localStorage.getItem(key);
      if (!rawValue) {
        keysToRemove.push(key);
        continue;
      }

      try {
        const parsed = JSON.parse(rawValue) as { timestamp?: number };
        if (
          typeof parsed.timestamp !== "number" ||
          now - parsed.timestamp > AUTO_SENT_STALE_MS
        ) {
          keysToRemove.push(key);
        }
      } catch {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  }, []);

  // Auto-send initial message from ?q= when opening a fresh chat URL
  useEffect(() => {
    const q = searchParams?.get("q") || "";
    if (q.trim().length > 0 && !autoSentFromQuery) {
      if (typeof window === "undefined") return;
      const sanitizedQuery = q.trim();
      const flagKey = `${AUTO_SENT_FLAG_PREFIX}${chatId}`;
      const rawFlagValue = window.localStorage.getItem(flagKey);

      if (rawFlagValue) {
        const now = Date.now();
        let shouldSkipAutoSend = false;

        try {
          const parsed = JSON.parse(rawFlagValue) as { timestamp?: number };
          if (
            typeof parsed.timestamp === "number" &&
            now - parsed.timestamp <= AUTO_SENT_STALE_MS
          ) {
            shouldSkipAutoSend = true;
          } else {
            window.localStorage.removeItem(flagKey);
          }
        } catch {
          window.localStorage.removeItem(flagKey);
        }

        if (shouldSkipAutoSend) {
          setAutoSentFromQuery(true);
          return;
        }
      }

      // Drop the query param to avoid duplicate sends on remounts
      router.replace(`/chat/${chatId}`);
      window.localStorage.setItem(
        flagKey,
        JSON.stringify({ timestamp: Date.now() }),
      );
      setAutoSentFromQuery(true);
      sendMessage({ text: sanitizedQuery });
    }
  }, [chatId, searchParams, autoSentFromQuery, router, sendMessage]);

  useEffect(() => {
    const manual = searchParams?.get("manual");
    if (manual === "1" && !manualVisualHandled) {
      handleAddVisual();
      setManualVisualHandled(true);
      router.replace(`/chat/${chatId}`);
    }
  }, [searchParams, manualVisualHandled, handleAddVisual, router, chatId]);

  useEffect(() => {
    const modeParam = searchParams?.get("mode");
    if (modeParam === "manual") {
      setPromptMode("manual");
      router.replace(`/chat/${chatId}`);
    }
  }, [searchParams, router, chatId]);

  // Remove the auto-send marker after it served its purpose to avoid storage build-up
  useEffect(() => {
    if (!autoSentFromQuery || typeof window === "undefined") {
      return;
    }

    const flagKey = `${AUTO_SENT_FLAG_PREFIX}${chatId}`;
    const timeoutId = window.setTimeout(() => {
      try {
        window.localStorage.removeItem(flagKey);
      } catch {
        // no-op
      }
    }, AUTO_SENT_CLEANUP_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoSentFromQuery, chatId]);

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

  // Persist right panel width to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "chat-right-panel-width",
        rightPanelWidth.toString(),
      );
    }
  }, [rightPanelWidth]);

  // Resize handlers
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      setResizeStartX(e.clientX);
      setPointerId(e.pointerId);
      if (containerRef.current) {
        const containerWidth =
          containerRef.current.getBoundingClientRect().width;
        const currentRightWidth = (rightPanelWidth / 100) * containerWidth;
        setResizeStartWidth(currentRightWidth);
      }
      if (resizeHandleRef.current) {
        resizeHandleRef.current.setPointerCapture(e.pointerId);
      }
    },
    [rightPanelWidth],
  );

  const handleResizeMove = useCallback(
    (e: PointerEvent) => {
      if (!isResizing || !containerRef.current) return;

      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const deltaX = resizeStartX - e.clientX; // Negative because we're dragging left
      const newRightWidth = resizeStartWidth + deltaX;
      const newRightWidthPercent = (newRightWidth / containerWidth) * 100;

      // Constrain between 20% and 60%
      const constrainedPercent = Math.max(
        20,
        Math.min(60, newRightWidthPercent),
      );
      setRightPanelWidth(constrainedPercent);
    },
    [isResizing, resizeStartX, resizeStartWidth],
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    if (resizeHandleRef.current && pointerId !== null) {
      resizeHandleRef.current.releasePointerCapture(pointerId);
    }
    setPointerId(null);
  }, [pointerId]);

  useEffect(() => {
    if (isResizing) {
      const handleMove = (e: PointerEvent) => handleResizeMove(e);
      const handleEnd = () => void handleResizeEnd();

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);

      return () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // Extract visualizations from messages
  const visualizations = useMemo(() => {
    const vizList: Array<{
      id: string;
      data: SqlAnalysisData | null;
      stage?: SqlAnalysisStage;
      progress?: number;
    }> = [];

    messages.forEach((message) => {
      if (message.parts) {
        message.parts.forEach((part) => {
          if (part.type === executeSqlArtifactType) {
            const artifactPart = part as {
              data?: {
                id?: string;
                status?: ArtifactStatus;
                progress?: number;
                error?: string;
                payload?: SqlAnalysisData;
              };
            };
            const artifactData = artifactPart.data;

            if (artifactData && artifactData.status !== "error") {
              const payload = (artifactData.payload ??
                null) as SqlAnalysisData | null;
              const artifactStatus = artifactData.status;
              const derivedStage = (payload?.stage ??
                (artifactStatus === "complete"
                  ? "complete"
                  : "loading")) as SqlAnalysisStage;
              const progressValue =
                typeof artifactData.progress === "number"
                  ? artifactData.progress
                  : (payload?.progress ?? 0);

              // Include if it has visualization data or is in progress with a query
              // Include charts/cards, tables with data, or artifacts being processed
              if (
                payload &&
                (payload.visualType === "chart" ||
                  payload.visualType === "card" ||
                  (payload.visualType === "table" &&
                    payload.rows &&
                    payload.rows.length > 0) ||
                  (payload.query && derivedStage !== "complete"))
              ) {
                vizList.push({
                  id: artifactData.id ?? `${message.id}-${vizList.length}`,
                  data: payload,
                  stage: derivedStage,
                  progress: progressValue,
                });
              }
            }
          }
        });
      }
    });

    return vizList;
  }, [messages]);

  const isConversationEmpty = messages.length === 0;

  const manualWorkspace = (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <Conversation className="flex-1 min-h-0 h-full">
          <ConversationContent className="max-w-full mx-auto w-full space-y-6 overflow-y-auto">
            {isConversationEmpty && (
              <Message from="assistant" key="assistant-ready">
                <MessageContent>
                  <Response key="assistant-ready-response">
                    Ready to help...
                  </Response>
                </MessageContent>
              </Message>
            )}
            {messages.map((message, messageIndex) => {
              const isLastMessage = messageIndex === messages.length - 1;
              const isEmptyAssistantMessage =
                isLastMessage &&
                message.role === "assistant" &&
                (status === "streaming" || status === "submitted") &&
                (!message.parts ||
                  message.parts.length === 0 ||
                  message.parts.every(
                    (part) =>
                      (part.type === "text" &&
                        (!(part as { text?: string }).text ||
                          (part as { text?: string }).text?.trim() === "")) ||
                      (part.type === executeSqlArtifactType &&
                        !(part as { data?: unknown }).data),
                  ));

              if (isEmptyAssistantMessage) {
                return (
                  <Message from="assistant" key={message.id}>
                    <MessageContent className="relative w-full group-[.is-assistant]:bg-sidebar group-[.is-assistant]:border border-border rounded-lg group-[.is-assistant]:shadow-sm p-4">
                      <span>
                        {animationFrame} {verbAiIsThinking}
                      </span>
                    </MessageContent>
                  </Message>
                );
              }

              return (
                <Message from={message.role} key={message.id}>
                  <MessageContent className="relative w-full group-[.is-user]:bg-card group-[.is-assistant]:bg-sidebar group-[.is-assistant]:border border-border rounded-lg group-[.is-assistant]:shadow-sm p-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 z-30"
                      onClick={() => handleRemoveMessage(message.id)}
                      aria-label="Remove message"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                    {message.parts?.map((part, partIndex) => {
                      if (status === "submitted") {
                        return (
                          <span
                            key={`${message.id}-part-${partIndex}-submitted`}
                          >
                            {animationFrame}
                          </span>
                        );
                      }
                      if (part.type === "text") {
                        return (
                          <Response
                            key={`${message.id}-part-${partIndex}`}
                            className="p-4 rounded-lg group-[.is-user]:bg-primary/60 group-[.is-user]:shadow-md"
                          >
                            {part.text}
                          </Response>
                        );
                      }

                      if (part.type === executeSqlArtifactType) {
                        const artifactPart = part as {
                          data?: {
                            status?: ArtifactStatus;
                            progress?: number;
                            error?: string;
                            payload?: SqlAnalysisData;
                          };
                        };
                        const artifactData = artifactPart.data;

                        if (!artifactData) {
                          return null;
                        }

                        if (artifactData.status === "error") {
                          return (
                            <div
                              key={`${message.id}-part-${partIndex}`}
                              className="mt-4 max-w-full text-sm text-red-500"
                            >
                              {artifactData.error ?? "SQL analysis failed."}
                            </div>
                          );
                        }

                        const payload = (artifactData.payload ??
                          null) as SqlAnalysisData | null;

                        if (payload?.query) {
                          return (
                            <div
                              key={`${message.id}-part-${partIndex}`}
                              className="mt-4 w-full"
                            >
                              <div className="flex gap-4">
                                <div className="bg-sidebar p-4 rounded-2xl rounded-tl-none max-w-[90%]">
                                  <p className="font-mono text-xs text-muted-foreground mb-2">
                                    GENERATED SQL
                                  </p>
                                  <code className="font-mono text-sm text-foreground whitespace-pre-wrap block bg-card p-3 rounded border border-border">
                                    {payload.query}
                                  </code>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return null;
                      }

                      if (part.type === "tool-getTableSchema") {
                        return (
                          <span key={`${message.id}-part-${partIndex}`}>
                            Getting table schema
                          </span>
                        );
                      }

                      if (part.type === "tool-generateChartConfig") {
                        return (
                          <span key={`${message.id}-part-${partIndex}`}>
                            Generating chart config...
                            {animationFrame}
                          </span>
                        );
                      }

                      if (part.type === "tool-executeSql") {
                        return (
                          <span key={`${message.id}-part-${partIndex}`}>
                            Processing...
                          </span>
                        );
                      }

                      return null;
                    })}
                  </MessageContent>
                </Message>
              );
            })}

            {status === "streaming" &&
              !(
                messages.length > 0 &&
                messages[messages.length - 1]?.role === "assistant" &&
                (!messages[messages.length - 1]?.parts ||
                  messages[messages.length - 1]?.parts.length === 0 ||
                  messages[messages.length - 1]?.parts.every(
                    (part) =>
                      (part.type === "text" &&
                        (!(part as { text?: string }).text ||
                          (part as { text?: string }).text?.trim() === "")) ||
                      (part.type === executeSqlArtifactType &&
                        !(part as { data?: unknown }).data),
                  ))
              ) && (
                <Message from="assistant" key="assistant-streaming">
                  <MessageContent className="relative w-full group-[.is-assistant]:bg-sidebar group-[.is-assistant]:border border-border rounded-lg group-[.is-assistant]:shadow-sm p-4">
                    <span>
                      {animationFrame} {verbAiIsThinking}
                    </span>
                  </MessageContent>
                </Message>
              )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>
    </div>
  );

  const rightPanelContent = (
    <div className="relative h-full w-full overflow-hidden">
      <div
        aria-hidden={!isAiMode}
        className={cn(
          "absolute inset-0 flex flex-col transition-all duration-300 ease-out",
          isAiMode
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-2 pointer-events-none",
        )}
      >
        <VisualizationPanel visualizations={visualizations} />
      </div>
      <div
        aria-hidden={isAiMode}
        className={cn(
          "absolute inset-0 flex flex-col transition-all duration-300 ease-out",
          isAiMode
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
        } ${isDashboardBuilderOpen ? "mr-[50vw]" : ""}`}
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
                <div className="flex-1 min-h-0 flex overflow-hidden">
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
                      <Conversation className="flex-1 min-h-0 h-full">
                        <ConversationContent className="max-w-full mx-auto w-full space-y-6 overflow-y-auto">
                          {isConversationEmpty && (
                            <Message from="assistant" key="assistant-ready">
                              <MessageContent>
                                <Response key="assistant-ready-response">
                                  Ready to help...
                                </Response>
                              </MessageContent>
                            </Message>
                          )}
                          {messages.map((message, messageIndex) => {
                            // Check if this is the last message, it's an assistant message, streaming is active, and it has no meaningful content
                            const isLastMessage =
                              messageIndex === messages.length - 1;
                            const isEmptyAssistantMessage =
                              isLastMessage &&
                              message.role === "assistant" &&
                              (status === "streaming" ||
                                status === "submitted") &&
                              (!message.parts ||
                                message.parts.length === 0 ||
                                message.parts.every(
                                  (part) =>
                                    (part.type === "text" &&
                                      (!(part as { text?: string }).text ||
                                        (
                                          part as { text?: string }
                                        ).text?.trim() === "")) ||
                                    (part.type === executeSqlArtifactType &&
                                      !(part as { data?: unknown }).data),
                                ));

                            // If it's an empty assistant message during streaming, show animation instead
                            if (isEmptyAssistantMessage) {
                              return (
                                <Message from="assistant" key={message.id}>
                                  <MessageContent className="relative w-full group-[.is-assistant]:bg-sidebar group-[.is-assistant]:border border-border rounded-lg group-[.is-assistant]:shadow-sm p-4">
                                    <span>
                                      {animationFrame} {verbAiIsThinking}
                                    </span>
                                  </MessageContent>
                                </Message>
                              );
                            }

                            return (
                              <Message from={message.role} key={message.id}>
                                <MessageContent className="relative w-full group-[.is-user]:bg-card group-[.is-assistant]:bg-sidebar group-[.is-assistant]:border border-border rounded-lg group-[.is-assistant]:shadow-sm p-4">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-2 right-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 z-30"
                                    onClick={() =>
                                      handleRemoveMessage(message.id)
                                    }
                                    aria-label="Remove message"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </Button>
                                  {message.parts?.map((part, partIndex) => {
                                    if (status === "submitted") {
                                      return (
                                        <span
                                          key={`${message.id}-part-${partIndex}-submitted`}
                                        >
                                          {animationFrame}
                                        </span>
                                      );
                                    }
                                    if (part.type === "text") {
                                      return (
                                        <Response
                                          key={`${message.id}-part-${partIndex}`}
                                          className="p-4 rounded-lg group-[.is-user]:bg-primary/60 group-[.is-user]:shadow-md"
                                        >
                                          {part.text}
                                        </Response>
                                      );
                                    }

                                    if (part.type === executeSqlArtifactType) {
                                      const artifactPart = part as {
                                        data?: {
                                          status?: ArtifactStatus;
                                          progress?: number;
                                          error?: string;
                                          payload?: SqlAnalysisData;
                                        };
                                      };
                                      const artifactData = artifactPart.data;

                                      if (!artifactData) {
                                        return null;
                                      }

                                      if (artifactData.status === "error") {
                                        return (
                                          <div
                                            key={`${message.id}-part-${partIndex}`}
                                            className="mt-4 max-w-full text-sm text-red-500"
                                          >
                                            {artifactData.error ??
                                              "SQL analysis failed."}
                                          </div>
                                        );
                                      }

                                      const payload = (artifactData.payload ??
                                        null) as SqlAnalysisData | null;

                                      // Show SQL query inline in messages
                                      if (payload?.query) {
                                        return (
                                          <div
                                            key={`${message.id}-part-${partIndex}`}
                                            className="mt-4 w-full"
                                          >
                                            <div className="flex gap-4">
                                              <div className="bg-sidebar p-4 rounded-2xl rounded-tl-none max-w-[90%]">
                                                <p className="font-mono text-xs text-muted-foreground mb-2">
                                                  GENERATED SQL
                                                </p>
                                                <code className="font-mono text-sm text-foreground whitespace-pre-wrap block bg-card p-3 rounded border border-border">
                                                  {payload.query}
                                                </code>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      }

                                      return null;
                                    }

                                    if (part.type === "tool-getTableSchema") {
                                      return (
                                        <span
                                          key={`${message.id}-part-${partIndex}`}
                                        >
                                          Getting table schema
                                        </span>
                                      );
                                    }

                                    if (
                                      part.type === "tool-generateChartConfig"
                                    ) {
                                      return (
                                        <span
                                          key={`${message.id}-part-${partIndex}`}
                                        >
                                          Generating chart config...
                                          {animationFrame}
                                        </span>
                                      );
                                    }

                                    if (part.type === "tool-executeSql") {
                                      return (
                                        <span
                                          key={`${message.id}-part-${partIndex}`}
                                        >
                                          Processing...
                                        </span>
                                      );
                                    }

                                    return null;
                                  })}
                                </MessageContent>
                              </Message>
                            );
                          })}

                          {status === "streaming" &&
                            !(
                              messages.length > 0 &&
                              messages[messages.length - 1]?.role ===
                                "assistant" &&
                              (!messages[messages.length - 1]?.parts ||
                                messages[messages.length - 1]?.parts.length ===
                                  0 ||
                                messages[messages.length - 1]?.parts.every(
                                  (part) =>
                                    (part.type === "text" &&
                                      (!(part as { text?: string }).text ||
                                        (
                                          part as { text?: string }
                                        ).text?.trim() === "")) ||
                                    (part.type === executeSqlArtifactType &&
                                      !(part as { data?: unknown }).data),
                                ))
                            ) && (
                              <Message
                                from="assistant"
                                key="assistant-streaming"
                              >
                                <MessageContent className="relative w-full group-[.is-assistant]:bg-sidebar group-[.is-assistant]:border border-border rounded-lg group-[.is-assistant]:shadow-sm p-4">
                                  <span>
                                    {animationFrame} {verbAiIsThinking}
                                  </span>
                                </MessageContent>
                              </Message>
                            )}
                          {/* empty space to push the input area to the bottom */}
                          <div className="h-[10vh]" />
                        </ConversationContent>
                        <ConversationScrollButton />
                      </Conversation>
                    ) : (
                      manualWorkspace
                    )}
                  </div>
                </div>

                {/* Input Area - aligned with messages */}
                {isAiMode ? (
                  <div className="flex-shrink-0 w-full mx-auto max-h-[20vh] overflow-hidden shadow-md z-10 grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out grid-rows-[1fr] opacity-100 translate-y-0">
                    <PromptInputWrapper
                      onSubmit={handleSubmit}
                      showHeader
                      showAiInput
                      className="transition delay-150 duration-300 ease-in-out bg-card"
                      status={status}
                      onCreateDashboard={handleOpenDashboardBuilder}
                      onAddVisual={handleAddVisual}
                      mode={promptMode}
                      onModeChange={setPromptMode}
                      pendingMode={promptPendingMode}
                    />
                  </div>
                ) : (
                  <div className="flex-shrink-0 w-full mx-auto max-h-[56vh] overflow-hidden shadow-md z-10 transition-[max-height,opacity,transform] duration-300 ease-out opacity-100 translate-y-0">
                    <div className="w-full overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                      <PromptInputWrapper
                        onSubmit={handleSubmit}
                        showHeader
                        showAiInput={false}
                        className="bg-card transition delay-150 duration-300 ease-in-out"
                        status={status}
                        onCreateDashboard={handleOpenDashboardBuilder}
                        onAddVisual={handleAddVisual}
                        mode={promptMode}
                        onModeChange={setPromptMode}
                        pendingMode={promptPendingMode}
                      />
                      <div className="h-[44vh] min-h-[320px] overflow-hidden border-t border-border">
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
                  </div>
                )}
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
      <DashboardBuilderPanel
        open={isDashboardBuilderOpen}
        onOpenChange={setIsDashboardBuilderOpen}
        messages={messages}
      />
      {/* <AIDevtools /> */}
    </ArtifactMutationProvider>
  );
}
