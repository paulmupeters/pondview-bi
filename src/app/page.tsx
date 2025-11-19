"use client";

import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInputWrapper,
  type PromptMode,
} from "@/components/prompt-input-wrapper";

export default function Home() {
  const [mode, setMode] = useState<PromptMode>("ai");
  const router = useRouter();

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text?.trim()) return;

      const chatId = nanoid();
      const encodedQuery = encodeURIComponent(message.text.trim());
      router.push(`/${chatId}?q=${encodedQuery}`);
    },
    [router],
  );

  const exampleCommands = [
    "Show me trends of unicorns over the year in China",
    "Compare revenue across different industries",
    "Create a dashboard for financial metrics",
    "Analyze customer demographics by region",
  ];

  const handleExampleClick = useCallback(
    (command: string) => {
      handleSubmit({ text: command });
    },
    [handleSubmit],
  );

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background p-4 overflow-hidden ml-6">
      <div className="w-full max-w-7xl h-[90vh] flex flex-col font-mono justify-between">
        <div className="flex items-center justify-center">
          <h1 className="text-5xl font-bold tracking-wider">Data Assistant</h1>
        </div>

        <div className="p-2 flex gap-2 py-2 justify-center">
          <div className="flex flex-col items-center justify-center gap-2">
            <p className="text-sm opacity-70">
              ═══════════════════════════════════════════════════════════════
            </p>
            <p className="text-sm opacity-70">
              QUERY DATA AND GENERATE CHARTS WITH NATURAL LANGUAGE QUERIES.
            </p>
            <p className="text-sm opacity-70">
              ═══════════════════════════════════════════════════════════════
            </p>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col p-4">
          <div className="flex-1 overflow-hidden flex flex-col items-center justify-evenly h-full">
            <div className="w-full max-w-3xl">
              <PromptInputWrapper
                onSubmit={handleSubmit}
                className="transition delay-150 duration-300 ease-in-out max-h-56"
                onHomePage={true}
                mode={mode}
                onModeChange={setMode}
              />
              {/* Example Commands - Only show in AI mode */}
              {mode === "ai" && (
                <div className="flex flex-col items-center justify-start gap-0 mt-12">
                  <div className="text-sm opacity-70">
                    ═══════════════════════════════════════════════════════════════
                  </div>
                  <div className="text-sm opacity-70">AVAILABLE COMMANDS:</div>
                  <div className="text-sm opacity-70">
                    ═══════════════════════════════════════════════════════════════
                  </div>
                  <div className="pl-4 space-y-1 font-mono">
                    {exampleCommands.map((command) => (
                      <button
                        key={command}
                        type="button"
                        onClick={() => handleExampleClick(command)}
                        className="hover:text-primary cursor-pointer transition-colors text-left w-full"
                      >
                        {">"} {command}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Terminal Footer */}
        <div className="">
          <div className="text-xs flex items-center justify-between">
            <div className="flex gap-4">
              <span>CMD+K: Command Palette</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
