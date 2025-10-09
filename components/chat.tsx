"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";
import { AIDevtools } from "@ai-sdk-tools/devtools";
import { useChat } from "@ai-sdk-tools/store";
import {
  ArrowTrendingUpIcon,
  BanknotesIcon,
  ChartBarIcon,
  FireIcon,
  LanguageIcon,
  PaperAirplaneIcon,
  PlusIcon,
  ShoppingBagIcon,
  SparklesIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChartArtifact } from "@/ai/artifacts/bar-chart";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";
import { AnalysisPanel } from "@/components/analysis-panel";
import { SqlAnalysisPanel } from "@/components/sql-analysis-panel";
import { SqlLoading } from "@/components/sql-loading";

export default function Chat({
  chatId,
  // initialMessages = [],
}: {
  chatId: string;
  initialMessages?: UIMessage[];
}) {
  const { messages, sendMessage, status } = useChat({
    id: chatId,
    // initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/chat/${chatId}`,
    }),
  });
  const [input, setInput] = useState("");

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
                  <h2 className="text-7xl font-medium text-foreground animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
                    Good evening
                  </h2>
                  <p className="text-lg text-muted-foreground max-w-2xl mx-auto animate-in fade-in-0 slide-in-from-bottom-7 duration-800">
                    Ask me to analyze data and I'll create interactive charts
                    and insights
                  </p>
                </div>

                {/* Example prompts */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
                  <button
                    type="button"
                    className="group text-left cursor-pointer p-6 bg-card rounded-xl border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200"
                    onClick={() =>
                      setInput(
                        "Analyze burn rate for TechCorp with 6 months of data: Jan 2024: $50k revenue, $80k expenses, $200k cash. Feb: $55k revenue, $85k expenses, $170k cash. Mar: $60k revenue, $90k expenses, $140k cash. Apr: $65k revenue, $88k expenses, $117k cash. May: $70k revenue, $92k expenses, $95k cash. Jun: $75k revenue, $95k expenses, $75k cash.",
                      )
                    }
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-destructive/80 rounded-lg flex items-center justify-center">
                        <span className="text-destructive-foreground text-sm font-bold">
                          {" "}
                          <FireIcon className="h-4 w-4" />{" "}
                        </span>
                      </div>
                      <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                        Analyze TechCorp Burn Rate
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Generate financial analysis with 6 months of revenue,
                      expenses, and cash flow data.
                    </p>
                  </button>

                  <button
                    type="button"
                    className="group text-left cursor-pointer p-6 bg-card rounded-xl border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200"
                    onClick={() =>
                      setInput(
                        "Create a bar chart showing monthly sales data: January: $12000, February: $15000, March: $18000, April: $14000, May: $20000, June: $22000",
                      )
                    }
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-chart-2 rounded-lg flex items-center justify-center">
                        <span className="text-primary-foreground text-sm font-bold">
                          {" "}
                          <BanknotesIcon className="h-4 w-4" />{" "}
                        </span>
                      </div>
                      <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                        Monthly Sales Chart
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Visualize monthly sales performance with interactive bar
                      charts.
                    </p>
                  </button>

                  <button
                    type="button"
                    className="group text-left cursor-pointer p-6 bg-card rounded-xl border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200"
                    onClick={() =>
                      setInput(
                        "Generate a bar chart comparing programming languages: JavaScript: 85, Python: 92, Java: 78, C++: 65, Go: 71",
                      )
                    }
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-chart-3 rounded-lg flex items-center justify-center">
                        <span className="text-primary-foreground text-sm font-bold">
                          {" "}
                          <LanguageIcon className="h-4 w-4" />{" "}
                        </span>
                      </div>
                      <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                        Language Comparison
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Compare programming language usage and performance
                      metrics.
                    </p>
                  </button>

                  <button
                    type="button"
                    className="group text-left cursor-pointer p-6 bg-card rounded-xl border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200"
                    onClick={() =>
                      setInput(
                        "Create a bar chart for product sales: Product A: 150 units, Product B: 230 units, Product C: 180 units, Product D: 95 units",
                      )
                    }
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-chart-4 rounded-lg flex items-center justify-center">
                        <span className="text-primary-foreground text-sm font-bold">
                          {" "}
                          <ShoppingBagIcon className="h-4 w-4" />{" "}
                        </span>
                      </div>
                      <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                        Product Sales
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Analyze product performance and sales distribution across
                      categories.
                    </p>
                  </button>

                  <button
                    type="button"
                    className="group text-left cursor-pointer p-6 bg-card rounded-xl border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200"
                    onClick={() =>
                      setInput(
                        "Show a bar chart of team scores: Team Alpha: 340, Team Beta: 285, Team Gamma: 425, Team Delta: 310",
                      )
                    }
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-chart-5 rounded-lg flex items-center justify-center">
                        <span className="text-primary-foreground text-sm font-bold">
                          {" "}
                          <TrophyIcon className="h-4 w-4" />{" "}
                        </span>
                      </div>
                      <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                        Team Performance
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Track and compare team performance metrics and
                      achievements.
                    </p>
                  </button>

                  <button
                    type="button"
                    className="group text-left cursor-pointer p-6 bg-card rounded-xl border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200"
                    onClick={() =>
                      setInput(
                        "Show me trends for a company with improving financial health",
                      )
                    }
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                        <span className="text-primary-foreground text-sm font-bold">
                          {" "}
                          <ArrowTrendingUpIcon className="h-4 w-4" />{" "}
                        </span>
                      </div>
                      <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                        Trend Analysis
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Discover trends and patterns in financial health and
                      growth metrics.
                    </p>
                  </button>

                  <button
                    type="button"
                    className="group text-left cursor-pointer p-6 bg-card rounded-xl border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200"
                    onClick={() =>
                      setInput(
                        "Execute SQL: SELECT Company, Valuation, Industry FROM unicorns WHERE Country = 'United States' ORDER BY Valuation DESC LIMIT 10",
                      )
                    }
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-secondary rounded-lg flex items-center justify-center">
                        <span className="text-secondary-foreground text-sm font-bold">
                          {" "}
                          <ChartBarIcon className="h-4 w-4" />{" "}
                        </span>
                      </div>
                      <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                        SQL Query
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Execute custom SQL queries and display results in an
                      interactive table.
                    </p>
                  </button>
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
