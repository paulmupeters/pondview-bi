"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";
import { BarChart3, Table } from "lucide-react";
import { useState } from "react";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";
import { SqlChart } from "@/components/sql-chart";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";

export function SqlAnalysisPanel() {
  const sqlData = useArtifact(ExecuteSqlArtifact);
  const [activeView, setActiveView] = useState<"table" | "chart">("table");

  if (!sqlData?.data) {
    return null;
  }

  // Determine available views based on the data
  const hasChartConfig =
    sqlData.data.chartConfig && sqlData.data.visualType === "chart";

  return (
    <div className="space-y-6">
      {/* View Toggle Buttons */}
      {hasChartConfig && (
        <div className="flex gap-2 p-4 border-b">
          <Button
            variant={activeView === "table" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveView("table")}
            className="flex items-center gap-2"
          >
            <Table className="w-4 h-4" />
            Table
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
      )}

      {/* Render appropriate view */}
      {activeView === "chart" && hasChartConfig ? (
        <SqlChart />
      ) : (
        <SqlResultsTable />
      )}
    </div>
  );
}
