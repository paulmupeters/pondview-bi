"use client";

import { nanoid } from "nanoid";
import type { UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import {
  PromptInputWrapper,
  type PromptMode,
} from "@/components/prompt-input-wrapper";

const EXAMPLE_COMMANDS = [
  "Show me trends of unicorns over the year in China",
  "Compare revenue across different industries",
  "Create a dashboard for financial metrics",
  "Analyze customer demographics by region",
];

export default function Home() {
  const [mode, setMode] = useState<PromptMode>("ai");
  const router = useRouter();
  const executeSqlArtifactType = `data-artifact-${ExecuteSqlArtifact.id}`;

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text?.trim()) return;

      const chatId = nanoid();
      const encodedQuery = encodeURIComponent(message.text.trim());
      router.push(`/${chatId}?q=${encodedQuery}`);
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
          type: ExecuteSqlArtifact.id,
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
        router.push(`/${chatId}`);
      } catch (error) {
        console.error("Failed to persist message:", error);
      }
    },
    [router, executeSqlArtifactType],
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
        <div className="flex items-center justify-center">

          <h1>Pondview</h1>
        </div>

        <div className="p-2 flex gap-2 py-2 justify-center">
          <div className="flex flex-col items-center justify-center gap-2">
            <p className="text-sm opacity-70" aria-hidden="true">
              ═══════════════════════════════════════════════════════════════
            </p>
            <p className="text-sm opacity-70">
              QUERY DATA AND GENERATE CHARTS WITH NATURAL LANGUAGE QUERIES.
            </p>
            <p className="text-sm opacity-70" aria-hidden="true">
              ═══════════════════════════════════════════════════════════════
            </p>
          </div>
        </div>

        {/* Content Area */}
        <div className="overflow-hidden px-4 py-4 h-full z-30">
          <div className="overflow-hidden flex flex-col items-center justify-start h-full">
            <div className="w-full max-w-5xl">
              <PromptInputWrapper
                onSubmit={handleSubmit}
                onAddSqlResultToChat={handleAddSqlResultToChat}
                className="transition delay-150 duration-300 ease-in-out"
                onHomePage={true}
                mode={mode}
                onModeChange={setMode}
              />
              {/* Example Commands - Only show in AI mode */}
              {mode === "ai" && (
                <div className="flex flex-col items-center justify-start gap-0 mt-12 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
                  <div className="text-sm opacity-70" aria-hidden="true">
                    ═══════════════════════════════════════════════════════════════
                  </div>
                  <div className="text-sm opacity-70">AVAILABLE COMMANDS:</div>
                  <div className="text-sm opacity-70" aria-hidden="true">
                    ═══════════════════════════════════════════════════════════════
                  </div>
                  <div className="pl-4 space-y-1 font-mono mt-2">
                    {EXAMPLE_COMMANDS.map((command) => (
                      <button
                        key={command}
                        type="button"
                        onClick={() => handleExampleClick(command)}
                        className="hover:text-primary cursor-pointer transition-colors text-left w-full block group"
                      >
                        <span className="opacity-50 group-hover:opacity-100 transition-opacity mr-2">{">"}</span>
                        {command}
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
