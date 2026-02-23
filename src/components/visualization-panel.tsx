"use client";

import { useMemo } from "react";
import { SqlAnalysisDisplay } from "@/components/sql-analysis-display";
import type {
  SqlAnalysisData,
  SqlAnalysisStage,
} from "@/components/sql-analysis-display.types";
import { cn } from "@/lib/utils";

export interface VisualizationPanelProps {
  visualizations: Array<{
    id: string;
    data: SqlAnalysisData | null;
    stage?: SqlAnalysisStage;
    progress?: number;
  }>;
  selectedVisualizationId?: string | null;
  className?: string;
}

export function VisualizationPanel({
  visualizations,
  selectedVisualizationId,
  className,
}: VisualizationPanelProps) {
  const currentViz = useMemo(() => {
    if (visualizations.length === 0) {
      return null;
    }

    if (selectedVisualizationId) {
      const selectedVisualization = visualizations.find(
        (visualization) => visualization.id === selectedVisualizationId,
      );
      if (selectedVisualization) {
        return selectedVisualization;
      }
    }

    return visualizations[visualizations.length - 1] ?? null;
  }, [selectedVisualizationId, visualizations]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Empty State */}
      {visualizations.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-muted/30 rounded-2xl bg-muted/5">
          <div className="w-16 h-16 rounded-full bg-muted/10 flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-muted-foreground/50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            Waiting for visualization...
          </p>
        </div>
      )}

      {/* Visualization Content */}
      {currentViz && (
        <div className="flex-1 flex flex-col min-h-0 bg-background border border-border shadow-xl">
          {/* Visualization Display */}
          <div className="flex-1 overflow-y-auto p-0 min-h-0">
            <SqlAnalysisDisplay
              key={currentViz.id}
              data={currentViz.data}
              stage={currentViz.stage}
              progress={currentViz.progress}
              showStageIndicator={true}
              className="w-full"
              artifactId={currentViz.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}
