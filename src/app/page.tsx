"use client";

import {
  ArrowTrendingUpIcon,
  ChartBarIcon,
  HandRaisedIcon,
} from "@heroicons/react/24/outline";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { PromptInputWrapper } from "@/components/prompt-input-wrapper";

export default function Home() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (message: PromptInputMessage) => {
    const value = message.text?.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    const id = nanoid();
    router.push(`/${id}?q=${encodeURIComponent(value)}`);
  };

  const handlePromptClick = (prompt: string) => {
    // This will be handled by the PromptInputWrapper component
    // For now, we'll navigate directly to the chat with the prompt
    const id = nanoid();
    router.push(`/${id}?q=${encodeURIComponent(prompt)}`);
  };

  const handleAddManualVisual = () => {
    if (submitting) return;
    const id = nanoid();
    router.push(`/${id}?manual=1`);
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background">
      <div className="w-full max-w-4xl px-6">
        <div className="text-center mb-8">
          <h1 className="text-6xl font-semibold text-foreground mb-2">
            Data Assistant AI
          </h1>
          <p className="text-lg text-muted-foreground">
            Ask me to analyze data and I'll create interactive charts and
            insights
          </p>
        </div>

        <div className="mb-8">
          <PromptInputWrapper
            onSubmit={handleSubmit}
            onAddVisual={handleAddManualVisual}
            placeholder="Ask a question about your data or add it manually..."
            className="relative flex gap-3 rounded-3xl  bg-card transition-all duration-300 hover:shadow-primary dark:shadow-primary/40"
            status={submitting ? "submitted" : undefined}
          />
        </div>

        {/* Example prompts */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            type="button"
            className="group text-left cursor-pointer p-4 bg-card rounded-full border-2 border-border hover:shadow-lg dark:hover:border-primary transition-all duration-200"
            onClick={handleAddManualVisual}
          >
            <div className="flex items-center gap-3">
              <HandRaisedIcon className="h-6 w-6 text-primary group-hover:scale-110 transition-transform duration-200" />
              <div>
                <p className="text-sm text-muted-foreground">
                  Start a chat with a blank visual you can configure yourself.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            className="group text-left cursor-pointer p-4 bg-card rounded-full border-2 border-border hover:shadow-lg dark:hover:border-primary transition-all duration-200"
            onClick={() =>
              handlePromptClick(
                "Show me trends of unicorns over the year in China",
              )
            }
          >
            <div className="flex items-center gap-3">
              <ArrowTrendingUpIcon className="h-6 w-6 text-primary group-hover:scale-110 transition-transform duration-200" />
              <div>
                <p className="text-sm text-muted-foreground">
                  Discover trends and patterns in financial health and growth
                  metrics.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            className="group text-left cursor-pointer p-4 bg-card rounded-full border-2 border-border hover:shadow-lg dark:hover:border-primary transition-all duration-200"
            onClick={() =>
              handlePromptClick(
                "Execute SQL: SELECT Company, Valuation, Industry FROM unicorns WHERE Country = 'United States' ORDER BY Valuation DESC LIMIT 10",
              )
            }
          >
            <div className="flex items-center gap-3">
              <ChartBarIcon className="h-6 w-6 text-primary group-hover:scale-110 transition-transform duration-200" />
              <div>
                <p className="text-sm text-muted-foreground">
                  Execute SQL query and display results in an interactive table.
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
