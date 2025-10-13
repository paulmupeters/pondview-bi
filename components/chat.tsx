"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";
import { AIDevtools } from "@ai-sdk-tools/devtools";
import { useChat } from "@ai-sdk-tools/store";
import {
  PaperAirplaneIcon,
  PlusIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BarChartArtifact } from "@/ai/artifacts/bar-chart";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";
import { AnalysisPanel } from "@/components/analysis-panel";
import { SqlAnalysisPanel } from "@/components/sql-analysis-panel";
import { SqlLoading } from "@/components/sql-loading";

export default function Chat({
  chatId,
  initialMessages = [],
}: {
  chatId: string;
  initialMessages?: UIMessage[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { messages, sendMessage, status } = useChat({
    id: chatId,
    messages: initialMessages.length > 0 ? initialMessages : undefined,
    transport: new DefaultChatTransport({
      api: `/api/chat/${chatId}`,
    }),
  });
  const [input, setInput] = useState("");
  const [autoSentFromQuery, setAutoSentFromQuery] = useState(false);

  const [clearedChat, setClearedChat] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(75); // percentage - 2/3 of screen
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: Event) => {
      if (!isResizing) return;
      const mouseEvent = e as MouseEvent;
      const container = document.querySelector(".chat-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = ((rect.right - mouseEvent.clientX) / rect.width) * 100;
      const clampedWidth = Math.max(20, Math.min(80, newWidth));
      setRightPanelWidth(clampedWidth);
    },
    [isResizing],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Auto-send initial message from ?q= when opening a fresh chat URL
  useEffect(() => {
    const q = searchParams?.get("q") || "";
    if (autoSentFromQuery) return;
    if (typeof window === "undefined") return;
    const flagKey = `autoSent:${chatId}`;
    if (window.localStorage.getItem(flagKey)) {
      setAutoSentFromQuery(true);
      return;
    }
    if (q.trim().length > 0) {
      // Drop the query param to avoid duplicate sends on remounts
      router.replace(`/${chatId}`);
      window.localStorage.setItem(flagKey, "1");
      setAutoSentFromQuery(true);
      sendMessage({ text: q });
    }
  }, [chatId, searchParams, sendMessage, autoSentFromQuery, router]);

  // Use the SQL artifact with event listeners
  const sqlData = useArtifact(ExecuteSqlArtifact, {
    onStatusChange: (newStatus, oldStatus) => {
      if (newStatus === "loading" && oldStatus === "idle") {
        toast.loading("Executing SQL query...", {
          id: "sql-execution",
        });
      } else if (newStatus === "complete" && oldStatus === "streaming") {
        const rowCount = sqlData?.data?.summary?.totalRows || 0;
        toast.success(`Query complete! Retrieved ${rowCount} rows.`, {
          id: "sql-execution",
        });
      }
    },
    onUpdate: (newData, oldData) => {
      if (newData.stage === "processing" && oldData?.stage === "loading") {
        toast.loading("Processing query...", {
          id: "sql-execution",
        });
      } else if (
        newData.stage === "analyzing" &&
        oldData?.stage === "processing"
      ) {
        toast.loading("Analyzing results...", {
          id: "sql-execution",
        });
      }
    },
    onError: (error) => {
      toast.error(`Query failed: ${error}`, {
        id: "sql-execution",
      });
    },
  });

  // Use the bar chart artifact with event listeners
  const barChartData = useArtifact(BarChartArtifact, {
    onStatusChange: (newStatus, oldStatus) => {
      if (newStatus === "loading" && oldStatus === "idle") {
        toast.loading("Creating bar chart...", {
          id: "bar-chart",
        });
      } else if (newStatus === "complete" && oldStatus === "streaming") {
        const insights = barChartData?.data?.summary?.insights?.length || 0;
        toast.success(`Bar chart complete! Generated ${insights} insights.`, {
          id: "bar-chart",
        });
      }
    },
    onUpdate: (newData, oldData) => {
      // Show different toasts based on stage changes
      if (newData.stage === "processing" && oldData?.stage === "loading") {
        toast.loading("Processing chart data...", {
          id: "bar-chart",
        });
      } else if (
        newData.stage === "analyzing" &&
        oldData?.stage === "processing"
      ) {
        toast.loading("Analyzing data and generating insights...", {
          id: "bar-chart",
        });
      }
    },
    onError: (error) => {
      toast.error(`Chart creation failed: ${error}`, {
        id: "bar-chart",
      });
    },
  });

  // Track when we have data to trigger animation unless user closed panel
  const hasBarChartData =
    barChartData?.data && barChartData.data.stage === "complete";
  const hasSqlData = sqlData?.data && sqlData.data.stage === "complete";
  const visibleMessages = clearedChat
    ? []
    : messages.filter((message) =>
        Array.isArray(message.parts)
          ? message.parts.some(
              (part) =>
                part?.type === "text" &&
                typeof part.text === "string" &&
                part.text.trim().length > 0,
            )
          : false,
      );

  return (
    <>
      <div
        className={`chat-container h-screen flex transition-all duration-200 ease-in-out ${
          hasBarChartData || hasSqlData ? "flex-row" : "flex-col items-center justify-center"
        }`}
      >
        {/* Left Panel - Chat */}
        <div
          className={`${hasBarChartData || hasSqlData ? "" : "w-full"} transition-all duration-200 ease-in-out flex flex-col h-full`}
          style={hasBarChartData || hasSqlData ? { width: `${100 - rightPanelWidth}%` } : {}}
        >
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-8 space-y-6 flex flex-col items-start mx-auto bg-background">
            {visibleMessages.length === 0 && !hasBarChartData && !hasSqlData && (
              <div className="text-center space-y-8 max-w-4xl mx-auto">
                <div className="space-y-4">
                  <h2 className="text-4xl font-medium text-foreground animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
                    Ready to help
                  </h2>
                  <p className="text-lg text-muted-foreground max-w-2xl mx-auto animate-in fade-in-0 slide-in-from-bottom-7 duration-800">
                    Ask me anything about data analysis, charts, or SQL queries
                  </p>
                </div>
              </div>
            )}

            {visibleMessages.map((message) => (
              <div
                key={message.id}
                className={`flex w-full ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`rounded-xl flex items-center gap-2 max-w-[80%] ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground px-1"
                      : "bg-muted p-2 shadow-md"
                  }`}
                >
                  <div className="font-medium text-sm">
                    {message.role === "user" ? "" : <SparklesIcon />}
                  </div>
                  <div className="space-y-0 mr-2">
                    {message.parts.map((part, partIndex) => {
                      if (part.type === "text") {
                        return (
                          <span key={`${message.id}-part-${partIndex}`}>
                            {part.text}
                          </span>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              </div>
            ))}
            {/* Status indicator */}
            {status !== "ready" && (
              <div className="text-center text-sm text-muted-foreground bg-muted p-2 rounded-xl shadow-md">
                {status === "streaming" && "AI is thinking..."}
                {status === "submitted" && "Processing..."}
              </div>
            )}
          </div>

          {/* Input Form */}
          <div className="p-4 border-t border-border mx-12 mb-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) {
                  sendMessage({ text: input });
                  setInput("");
                  setClearedChat(false);
                }
              }}
              className="flex space-x-2"
            >
              <div className="flex-1 relative">
                <button
                  type="button"
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-accent rounded transition-colors"
                >
                  <PlusIcon className="h-4 w-4 text-muted-foreground" />
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={status !== "ready"}
                  placeholder="Ask anything"
                  className="w-full pl-10 pr-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                />
              </div>
              <button
                type="submit"
                disabled={status !== "ready" || !input.trim()}
                className="px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Panel - Analysis */}
        {hasBarChartData || hasSqlData && (
          // biome-ignore lint/a11y/noStaticElementInteractions: needed for resizing
          <div
            className="w-2 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors"
            onMouseDown={handleMouseDown}
          />
        )}
        {hasBarChartData || hasSqlData && (
          <div
            className="border-l border-border flex flex-col h-full"
            style={{ width: `${rightPanelWidth}%` }}
          >
            {/* Analysis Header */}
            <div className="flex items-center justify-between p-0 mx-2">
              <h2 className="text-md font-semibold text-foreground ml-1">
                Analysis
              </h2>
            </div>

            {/* Analysis Content */}
            <div className="flex-1 overflow-y-auto">

              {hasBarChartData && barChartData.data ? (
                <AnalysisPanel />
              ) : hasSqlData && sqlData.data ? (
                <SqlAnalysisPanel />
              ) : sqlData?.data ? (
                <SqlLoading />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-gray-500">No analysis data available</p>
                  </div>
                </div>
              )
              }
            </div>
          </div>
        )}
      </div>
      <AIDevtools />
    </>
  );
}
