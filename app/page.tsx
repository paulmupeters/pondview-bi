"use client";

import {
  ArrowTrendingUpIcon,
  BanknotesIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { PromptInputWrapper } from "@/components/prompt-input-wrapper";
import { useConnectedTables } from "@/hooks/use-connected-tables";

export default function Home() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const connections = useConnectedTables();

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

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background">
      <div className="w-full max-w-4xl px-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-semibold text-foreground mb-2">
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
            placeholder="Ask a question about your data..."
            className="relative flex gap-3 rounded-2xl border-2 border-primary/20 bg-card p-2 shadow-2xl shadow-primary/40 transition-all duration-300 hover:shadow-primary dark:shadow-primary/40"
            status={submitting ? "submitted" : undefined}
          />
        </div>

        {/* Example prompts */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            type="button"
            className="group text-left cursor-pointer p-6 bg-card rounded-xl border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200"
            onClick={() =>
              handlePromptClick("Show me top 10 contires with most unicorns")
            }
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-chart-2 rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground text-sm font-bold">
                  <BanknotesIcon className="h-4 w-4" />
                </span>
              </div>
              <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                Top 10 countries with most unicorns
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Visualize top 10 countries with most unicorns.
            </p>
          </button>

          <button
            type="button"
            className="group text-left cursor-pointer p-6 bg-card rounded-xl border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200"
            onClick={() =>
              handlePromptClick(
                "Show me trends of unicorns over the year in China",
              )
            }
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground text-sm font-bold">
                  <ArrowTrendingUpIcon className="h-4 w-4" />
                </span>
              </div>
              <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                Trend Analysis
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Discover trends and patterns in financial health and growth
              metrics.
            </p>
          </button>

          <button
            type="button"
            className="group text-left cursor-pointer p-6 bg-card rounded-xl border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200"
            onClick={() =>
              handlePromptClick(
                "Execute SQL: SELECT Company, Valuation, Industry FROM unicorns WHERE Country = 'United States' ORDER BY Valuation DESC LIMIT 10",
              )
            }
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-secondary rounded-lg flex items-center justify-center">
                <span className="text-secondary-foreground text-sm font-bold">
                  <ChartBarIcon className="h-4 w-4" />
                </span>
              </div>
              <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                SQL Query
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Execute custom SQL queries and display results in an interactive
              table.
            </p>
          </button>
        </div>

        {connections.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              Connected Data
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connections.map((entry, idx) => (
                <div
                  key={`${entry.type}-${entry.databasePath}-${entry.schema ?? entry.table ?? idx}`}
                  className="rounded-xl border border-border p-4 bg-card"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {entry.type.toUpperCase()}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {entry.databasePath}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {entry.schema ?? entry.table ?? "Unknown"}
                  </div>
                  {Array.isArray(entry.tables) && entry.tables.length > 0 && (
                    <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                      {entry.tables.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  )}
                  {entry.description && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {entry.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
