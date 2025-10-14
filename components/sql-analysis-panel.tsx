"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import {
  ChartBar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Table,
  Loader2,
  Database,
  Search,
  CheckCircle2
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";
import { ChartConfigDialog } from "@/components/chart-config-dialog";
import { SqlChart } from "@/components/sql-chart";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";

type Stage = "loading" | "processing" | "analyzing" | "visualizing" | "complete";

interface StageIndicatorProps {
  currentStage: Stage;
  progress?: number;
}

function StageIndicator({ currentStage, progress = 0 }: StageIndicatorProps) {
  const stages = [
    {
      id: "loading" as const,
      label: "Preparing",
      icon: Loader2,
      description: "Initializing query execution",
    },
    {
      id: "processing" as const,
      label: "Processing",
      icon: Database,
      description: "Executing SQL query",
    },
    {
      id: "analyzing" as const,
      label: "Analyzing",
      icon: Search,
      description: "Processing results and generating insights",
    },
    {
      id: "visualizing" as const,
      label: "Visualizing",
      icon: ChartBar,
      description: "Generating chart visualization",
    },
    {
      id: "complete" as const,
      label: "Complete",
      icon: CheckCircle2,
      description: "Ready to view",
    },
  ];

  const currentStageIndex = stages.findIndex((s) => s.id === currentStage);

  return (
    <div className="bg-muted/30 border rounded-lg p-4 space-y-3">
      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <div
          className="bg-primary h-full transition-all duration-500 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Stage indicators */}
      <div className="flex items-center justify-between gap-2">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const isActive = stage.id === currentStage;
          const isCompleted = index < currentStageIndex;
          const isPending = index > currentStageIndex;

          return (
            <div
              key={stage.id}
              className={cn(
                "flex flex-col items-center gap-2 flex-1",
                "transition-opacity duration-300",
                isPending && "opacity-40"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300",
                  isActive && "border-primary bg-primary/10 scale-110",
                  isCompleted && "border-green-500 bg-green-500/10",
                  isPending && "border-muted-foreground/30 bg-muted"
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 transition-all duration-300",
                    isActive && "text-primary animate-pulse",
                    isCompleted && "text-green-500",
                    isPending && "text-muted-foreground"
                  )}
                />
              </div>
              <div className="text-center">
                <div
                  className={cn(
                    "text-xs font-medium transition-colors duration-300",
                    isActive && "text-primary",
                    isCompleted && "text-green-500",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {stage.label}
                </div>
                {isActive && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {stage.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SqlAnalysisPanel({ storeId }: { storeId?: string }) {
  const sqlData: any = useArtifact(ExecuteSqlArtifact, undefined, storeId);
  const latestPayload: any | null = sqlData?.data ?? null;
  const [activeView, setActiveView] = useState<"table" | "chart">("table");
  const [chartConfig, setChartConfig] = useState<Config | null>(null);
  const [history, setHistory] = useState<
    Array<{
      stage?: "loading" | "processing" | "analyzing" | "visualizing" | "complete";
      query?: string;
      executionTime?: number;
      rowCount?: number;
      columns: { name: string; type?: string }[];
      rows: Result[];
      visualType?: "table" | "chart";
      chartConfig?: Config;
      summary?: {
        totalRows: number;
        executionTimeMs?: number;
        insights: string[];
        queryType?: string;
      };
    }>
  >([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const lastFingerprintRef = useRef<string | null>(null);
  const lastAutoSwitchQueryRef = useRef<string | null>(null);

  console.log("rendering sql analysis panel", latestPayload);

  // Append completed payloads to history based on fingerprint; ignore store churn
  useEffect(() => {
    const p = latestPayload;
    if (!p || p.stage !== "complete") return;

    const fingerprint = `${p.query ?? ""}|${p.executionTime ?? 0}|${p.rowCount ?? 0}|${p.columns?.length ?? 0}|${p.summary?.totalRows ?? 0}`;
    if (lastFingerprintRef.current === fingerprint) return;
    lastFingerprintRef.current = fingerprint;

    const snapshot = {
      stage: p.stage,
      query: p.query,
      executionTime: p.executionTime,
      rowCount: p.rowCount,
      columns: (p.columns as { name: string; type?: string }[]) ?? [],
      rows: (p.rows as Result[] | undefined) ?? [],
      visualType: p.visualType,
      chartConfig: p.chartConfig,
      summary: p.summary,
    };

    setHistory((prev) => {
      const exists = prev.some(
        (s) =>
          (s.query ?? "") === (snapshot.query ?? "") &&
          (s.executionTime ?? 0) === (snapshot.executionTime ?? 0) &&
          (s.summary?.totalRows ?? 0) === (snapshot.summary?.totalRows ?? 0),
      );
      if (exists) return prev;
      return [...prev, snapshot];
    });

    setCurrentIndex((prev) => (prev < 0 ? 0 : prev));
  }, [latestPayload]);

  const hasHistory = history.length > 0 && currentIndex >= 0;
  const selected = hasHistory ? history[currentIndex] : latestPayload ?? null;

  // Set chart config when it becomes available and auto-switch to chart view once per query
  useEffect(() => {
    const q = selected?.query ?? null;
    if (selected?.chartConfig && !chartConfig && q && lastAutoSwitchQueryRef.current !== q) {
      setChartConfig(selected.chartConfig);
      setActiveView("chart");
      lastAutoSwitchQueryRef.current = q;
    }
  }, [selected?.chartConfig, selected?.query, chartConfig]);
  if (!latestPayload && !hasHistory) {
    return null;
  }

  const currentStage = ((latestPayload?.stage) || "loading") as Stage;
  const currentProgress = (latestPayload?.progress ?? 0) as number;
  const isProcessing = currentStage !== "complete";

  console.log("rendering sql analysis panel");


  return (
    <div className="space-y-6">
      {/* Stage Indicator - Show when processing or always for context */}
      {isProcessing && (
        <div className="p-4">
          <StageIndicator currentStage={currentStage} progress={currentProgress} />
        </div>
      )}

      {/* View Toggle + History Navigation */}
      <div className="flex items-center justify-between gap-2 p-4 border-b">
        <div className="flex gap-2">
          <Button
            variant={activeView === "table" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveView("table")}
            className="flex items-center gap-2"
          >
            <Table className="w-4 h-4" />
            Data
          </Button>
          <Button
            variant={activeView === "chart" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveView("chart")}
            className="flex items-center gap-2"
          >
            <ChartBar className="w-4 h-4" />
            Chart
          </Button>
        </div>
        {history.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex <= 0}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[60px] text-center">
              {currentIndex + 1} / {history.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentIndex((i) => Math.min(history.length - 1, i + 1))
              }
              disabled={currentIndex >= history.length - 1}
              className="flex items-center gap-2"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Render appropriate view */}
      {activeView === "chart" ? (
        <div className="relative">
          {/* Configuration button in top right */}
          <div className="absolute top-0 right-0 z-10">
            <ChartConfigDialog
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Cog6ToothIcon className="w-4 h-4" />
                  Configure
                </Button>
              }
              config={chartConfig}
              columns={selected?.columns ?? latestPayload?.columns}
              onConfigChange={setChartConfig}
            />
          </div>

          {/* Chart content */}
          <SqlChart customChartConfig={chartConfig ?? undefined} dataOverride={selected ?? undefined} />
        </div>
      ) : (
          <SqlResultsTable dataOverride={selected ?? undefined} />
      )}

      {/* Query Collapsible */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-4 border-t hover:bg-muted/50 cursor-pointer">
          <span className="text-sm font-medium">SQL Query</span>
          <ChevronDown className="w-4 h-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t">
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
            {selected?.query || latestPayload?.query || "No query available"}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
