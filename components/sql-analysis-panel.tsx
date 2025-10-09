"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, Table } from "lucide-react";
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
import type { Config } from "@/lib/types";

export function SqlAnalysisPanel() {
  const sqlData = useArtifact(ExecuteSqlArtifact);
  const [activeView, setActiveView] = useState<"table" | "chart">("table");
  const [customConfig, setCustomConfig] = useState<Config | null>(null);
  const [history, setHistory] = useState<
    Array<{
      stage?: "loading" | "processing" | "analyzing" | "complete";
      query?: string;
      executionTime?: number;
      rowCount?: number;
      columns: { name: string; type?: string }[];
      rows: Record<string, unknown>[];
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

  // Append new completed results to history
  useEffect(() => {
    const payload = sqlData?.data;
    if (!payload || payload.stage !== "complete") return;

    const fingerprint = `${payload.query ?? ""}|${payload.executionTime ?? 0}|${payload.rowCount ?? 0}|${payload.columns?.length ?? 0}|${payload.summary?.totalRows ?? 0}`;
    if (lastFingerprintRef.current === fingerprint) return;

    lastFingerprintRef.current = fingerprint;
    const snapshot = {
      stage: payload.stage,
      query: payload.query,
      executionTime: payload.executionTime,
      rowCount: payload.rowCount,
      columns: payload.columns ?? [],
      rows: payload.rows ?? [],
      visualType: payload.visualType,
      chartConfig: payload.chartConfig,
      summary: payload.summary,
    };
    setHistory((prev) => [...prev, snapshot]);
    setCurrentIndex((prev) => (prev === -1 ? 0 : prev + 1));
  }, [sqlData?.data]);

  const hasHistory = history.length > 0 && currentIndex >= 0;
  const selected = hasHistory ? history[currentIndex] : sqlData?.data ?? null;
  if (!sqlData?.data) {
    return null;
  }

  return (
    <div className="space-y-6">
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
            <BarChart3 className="w-4 h-4" />
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
              config={customConfig}
              columns={selected?.columns ?? sqlData.data.columns}
              onConfigChange={setCustomConfig}
            />
          </div>

          {/* Chart content */}
          {customConfig ? (
            <SqlChart customChartConfig={customConfig} dataOverride={selected ?? undefined} />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Add configuration first
            </div>
          )}
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
            {selected?.query || sqlData.data.query || "No query available"}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
