import { ArrowRightIcon } from "@heroicons/react/24/outline";
import type { UIMessage } from "ai";
import { nanoid } from "nanoid";
import { useRouter } from '@/vite/next-navigation';
import { useCallback, useState } from "react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInputWrapper,
  type PromptMode,
} from "@/components/prompt-input-wrapper";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";

const EXAMPLE_COMMANDS = [
  "Show me trends of unicorns over the year in China",
  "Compare revenue across different industries",
  "Create a dashboard for financial metrics",
  "Analyze customer demographics by region",
];

export default function Home() {
  const [mode, setMode] = useState<PromptMode>("ai");
  const router = useRouter();
  const executeSqlArtifactType = "data-execute-sql";

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text?.trim()) return;

      const chatId = nanoid();
      const encodedQuery = encodeURIComponent(message.text.trim());
      router.push(`/chat?id=${chatId}&q=${encodedQuery}`);
    },
    [router],
  );

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

      const chatId = nanoid();
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
        // Navigate to the new chat after persisting
        router.push(`/chat?id=${chatId}`);
      } catch (error) {
        console.error("Failed to persist message:", error);
      }
    },
    [router],
  );

  const handleModeChange = useCallback(
    (newMode: PromptMode) => {
      if (newMode === "manual") {
        const chatId = nanoid();
        router.push(`/chat?id=${chatId}&mode=manual`);
      } else {
        setMode(newMode);
      }
    },
    [router],
  );

  const handleExampleClick = useCallback(
    (command: string) => {
      handleSubmit({ text: command });
    },
    [handleSubmit],
  );

  return (
    <div className="h-full w-full flex items-center justify-center bg-background p-4 overflow-hidden">
      <div className="w-full max-w-7xl h-full flex flex-col font-mono justify-between py-4">
        <div className="p-2 flex gap-2 py-2 justify-center">
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="relative">
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 1280 792"
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              xmlnsXlink="http://www.w3.org/1999/xlink"
              style={{
                fillRule: "evenodd",
                clipRule: "evenodd",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                strokeMiterlimit: 1.5,
              }}
                className="h-44 w-44"
              aria-label="DataChat"
            >
              <title>Pondview</title>
              <g id="water1">
                <path
                  d="M804.167,291.667l87.5,0l0,16.667l62.5,0l0,16.667l33.333,0l0,20.833l29.167,0l0,12.5l33.333,0l0,16.667l16.667,0l0,20.833l16.667,0l0,83.333l-16.667,0l0,16.667l-12.5,0l0,16.667l-20.833,0l0,16.667l-16.667,0l0,12.5l-29.167,0l0,16.667l-50,0l0,12.5l-50,0l0,12.5l-100,0l0,20.833l-316.667,0l0,-20.833l-95.833,0l0,-16.667l-50,0l0,-16.667l-50,0l0,-16.667l-29.167,0l0,-16.667l-20.833,0l0,-12.5l-12.5,0l0,-16.667l-16.667,0l0,-16.667l-16.667,0l0,-79.167l16.667,0l0,-16.667l16.667,0l0,-16.667l33.333,0l0,-16.667l29.167,0l0,-16.667l33.333,0l0,-16.667l66.667,0l0,-16.667l75,0l0,16.667l-62.5,0l0,12.5l-54.167,0l0,16.667l-45.833,0l0,16.667l-12.5,0l0,16.667l-16.667,0l0,16.667l-16.667,0l0,66.667l12.5,0l0,20.833l33.333,0l0,20.833l33.333,0l0,16.667l45.833,0l0,16.667l66.667,0l0,20.833l387.5,0l0,-20.833l62.5,0l0,-16.667l50,0l0,-16.667l33.333,0l0,-20.833l33.333,0l0,-16.667l16.667,0l0,-62.5l-16.667,0l0,-16.667l-12.5,0l0,-12.5l-20.833,0l0,-20.833l-37.5,0l0,-16.667l-54.167,0l0,-20.833l-70.833,0l0,-16.667Z"
                  style={{
                    fill: "var(--accent)",
                    stroke: "var(--accent)",
                    strokeWidth: "4.17px",
                  }}
                />
              </g>
              <g id="drop">
                <path
                  d="M550,325c0.218,35.525 0,-50 0,-50l0,-4.167l16.667,0l0,-45.833l16.667,0l0,-25l16.667,0l0,-33.333l20.833,0l0,-16.667l20.833,0l0,16.667l16.667,0l0,33.333l20.833,0l0,29.167l16.667,0l0,45.833l16.667,0l0,83.333l-16.667,0l0,33.333l-16.667,0l0,16.667l-37.5,0l0,4.167l-29.167,0l0,-4.167l-25,0l0,-16.667l-20.833,0l0,-33.333l-16.667,0c0,0 -0.218,-68.858 0,-33.333Z"
                  style={{
                    fill: "var(--accent)",
                    stroke: "var(--accent)",
                    strokeWidth: "4.17px",
                  }}
                />
                <path
                  d="M675,304.167l0,37.5l-16.667,0l0,16.667l-25,0l0,20.833l25,0l0,-20.833l16.667,0l0,-16.667l16.667,0l0,-37.5l-16.667,0Z"
                  style={{ fill: "var(--background)" }}
                />
              </g>
              <g id="water2">
                <path
                  d="M450,358.333l-45.833,0l0,16.667l-29.167,0l0,16.667l-20.833,0l0,45.833l20.833,0l0,16.667l29.167,0l0,16.667l33.333,0l0,16.667l66.667,0l0,20.833l254.167,0l0,-20.833l62.5,0l0,-12.5l37.5,0l0,-20.833l25,0l0,-12.5l20.833,0l0,-45.833l-20.833,0l0,-16.667l-29.167,0l0,-16.667l-45.833,0l0,16.667l33.333,0l0,12.5l16.667,0l0,33.333l-16.667,0l0,16.667l-33.333,0l0,16.667l-66.667,0l0,20.833l-225,0l0,-20.833l-66.667,0l0,-16.667l-33.333,0l0,-16.667l-16.667,0l0,-37.5l16.667,0l0,-12.5l33.333,0l0,-16.667"
                  style={{
                    fill: "var(--accent)",
                    stroke: "var(--accent)",
                    strokeWidth: "4.17px",
                  }}
                />
                <rect
                  x="454.167"
                  y="341.667"
                  width="45.833"
                  height="16.667"
                  style={{
                    fill: "var(--accent)",
                    stroke: "var(--accent)",
                    strokeWidth: "4.17px",
                  }}
                />
                <rect
                  x="762.5"
                  y="341.667"
                  width="45.833"
                  height="16.667"
                  style={{
                    fill: "var(--accent)",
                    stroke: "var(--accent)",
                    strokeWidth: "4.17px",
                  }}
                />
              </g>
            </svg>
              <div className="absolute inset-x-0 top-[30%] flex justify-center pointer-events-none z-10">
                <span className="text-primary font-bold text-3xl font-mono">POND</span>
                <span className="text-3xl font-mono font-semibold text-sidebar-foreground">VIEW</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="overflow-hidden px-4 py-4 h-full z-30">
          <div className="overflow-hidden flex flex-col items-center justify-start h-full">
            <div className="w-full max-w-5xl">
              <PromptInputWrapper
                onSubmit={handleSubmit}
                className="transition delay-150 duration-300 ease-in-out"
                onHomePage={true}
                mode={mode}
                onModeChange={handleModeChange}
              />
              {mode === "ai" && (
                <div className="mt-8 animate-in fade-in duration-500 fill-mode-both">
                  <p className="text-xs text-muted-foreground mb-3 text-center">Try asking...</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {EXAMPLE_COMMANDS.map((command, i) => (
                      <button
                        key={command}
                        type="button"
                        onClick={() => handleExampleClick(command)}
                        className="group text-left px-4 py-3 rounded-md border border-border/30 bg-card/40 text-sm text-foreground/80 transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 hover:text-foreground cursor-pointer animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
                        style={{ animationDelay: `${150 + i * 75}ms`, animationDuration: "400ms" }}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span>{command}</span>
                          <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-primary" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Terminal Footer */}
        <div className="hidden">
          <div className="text-xs flex items-center justify-between opacity-50 hover:opacity-100 transition-opacity">
            <div className="flex gap-4">
              <span>CMD+K: Command Palette</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
