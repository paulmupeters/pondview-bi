"use client";

import { PlusIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { DuckdbRepl } from "@/components/duckdb-shell/repl";
import {
  type SqlAnalysisData,
  SqlAnalysisDisplay,
} from "@/components/sql-analysis-display";
import { TerminalInput } from "@/components/terminal-input";
import { Button } from "@/components/ui/button";
import { useConnectedTables } from "@/hooks/use-connected-tables";

export default function Home() {
  const [activePanel, setActivePanel] = useState<"ai" | "sql" | "manual">("ai");
  const [manualVisual, setManualVisual] = useState<SqlAnalysisData | null>(
    null,
  );
  const connectedTables = useConnectedTables();

  const handleAddManualVisual = useCallback(() => {
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

    setManualVisual(defaultPayload);
  }, [connectedTables]);

  const handleDeleteManualVisual = useCallback(() => {
    setManualVisual(null);
  }, []);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background p-4 overflow-hidden ml-6">

      <div className="w-full max-w-7xl h-[90vh] flex flex-col font-mono justify-between">
        <div className="border-b-2 border-primary/60 p-4 bg-background/50">
          <div className="flex items-center justify-center">
            <h1 className="text-5xl font-bold tracking-wider">
              Data Assistant
            </h1>
          </div>
        </div>

        <div className="border-b border-border p-2 bg-background/30 flex gap-2 py-4 justify-center">
          <button
            type="button"
            onClick={() => setActivePanel("ai")}
            className={`px-4 py-1 text-background-foreground text-sm font-mono transition-all rounded-sm ${activePanel === "ai"
              ? "border border-primary bg-primary/20"
              : "border border-border bg-transparent hover:shadow-xl"
              }`}
          >
            AI ASSISTANT
          </button>
          <button
            type="button"
            onClick={() => setActivePanel("sql")}
            className={`px-4 py-1 text-background-foreground text-sm font-mono transition-all rounded-sm ${activePanel === "sql"
              ? "border border-primary bg-primary/20"
              : "border border-border bg-transparent hover:shadow-xl"
              }`}
          >
            SQL SHELL
          </button>
          <button
            type="button"
            onClick={() => setActivePanel("manual")}
            className={`px-4 py-1 text-background-foreground text-sm font-mono transition-all rounded-sm ${activePanel === "manual"
              ? "border border-primary bg-primary/20"
              : "border border-border bg-transparent hover:shadow-xl"
              }`}
          >
            MANUAL VISUALS
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col p-4">
          {activePanel === "ai" ? (
            <div className="flex-1 overflow-hidden flex flex-col items-center justify-evenly h-full">
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
              {/* Terminal Input */}
              <div className="w-full max-w-3xl">
                <TerminalInput />
                {/* Example Commands */}
                <div className="flex flex-col items-center justify-center gap-0 mt-8">
                  <div className="text-sm opacity-70">
                    ═══════════════════════════════════════════════════════════════
                  </div>
                  <div className="text-sm opacity-70">
                    AVAILABLE COMMANDS:
                  </div>
                  <div className="text-sm opacity-70">
                    ═══════════════════════════════════════════════════════════════
                  </div>
                  <div className="pl-4 space-y-1 font-mono">
                    <div className="hover:text-primary cursor-default transition-colors">
                      {">"} Show me trends of unicorns over the year in China
                    </div>
                    <div className="hover:text-primary cursor-default transition-colors">
                      {">"} Compare revenue across different industries
                    </div>
                    <div className="hover:text-primary cursor-default transition-colors">
                      {">"} Create a dashboard for financial metrics
                    </div>
                    <div className="hover:text-primary cursor-default transition-colors">
                      {">"} Analyze customer demographics by region
                    </div>
                  </div>
                </div>
              </div>


            </div>
          ) : activePanel === "sql" ? (
            <div className="flex-1 overflow-hidden flex flex-col items-center justify-evenly h-full gap-8 w-full">
              <div className="flex flex-col items-center justify-center gap-2">
                <p className="text-sm opacity-70">
                  ═══════════════════════════════════════════════════════════════
                </p>
                <p className="text-sm opacity-70">
                  RUN SQL QUERIES AND GENERATE CHARTS WITH NATURAL LANGUAGE QUERIES.
                </p>
                <p className="text-sm opacity-70">
                  ═══════════════════════════════════════════════════════════════
                </p>
              </div>
                {/* SQL REPL */}
                <div className="flex-1 overflow-y-auto w-full">
                  <DuckdbRepl className="" />
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden flex flex-col items-center justify-evenly h-full gap-8 w-full">
                {/* Manual Visual Panel */}
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="text-sm opacity-70">
                    ═══════════════════════════════════════════════════════════════
                  </div>
                  <div className="text-sm opacity-70">
                    Manual Visual Builder active. Create and configure
                    custom visualizations.
                  </div>
                  <div className="text-sm opacity-70">
                    ═══════════════════════════════════════════════════════════════
                  </div>
                  </div>

                  {/* Manual Visual Content */}
                  <div className="flex-1 overflow-y-auto space-y-4 w-full">
                    {manualVisual ? (
                      <div className="border-2 border-primary/60 bg-background/50 rounded-xl p-4">
                        <SqlAnalysisDisplay
                          data={manualVisual}
                          stage="complete"
                          progress={1}
                          showStageIndicator={false}
                          onDelete={handleDeleteManualVisual}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Button
                          type="button"
                            onClick={handleAddManualVisual}
                            className="border border-primary bg-primary/20 hover:bg-primary/30 px-6 py-3 text-lg"
                          >
                          <PlusIcon className="h-5 w-5 mr-2" />
                          CREATE NEW VISUAL
                        </Button>
                      </div>
                    )}
              </div>
            </div>
          )}
        </div>

        {/* Terminal Footer */}
        <div className="border-t-2 border-primary/60 p-2 bg-background/50">
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
