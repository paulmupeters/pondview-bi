"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";

import { BarChartArtifact } from "@/ai/artifacts/bar-chart";
import { BarChartComponent } from "@/components/bar-chart";

export function AnalysisPanel() {
  const barchartData = useArtifact(BarChartArtifact);

  if (!barchartData?.data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <BarChartComponent />
    </div>
  );
}
