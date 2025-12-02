"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { SqlAnalysisDisplay } from "@/components/sql-analysis-display";
import type {
  SqlAnalysisData,
  SqlAnalysisStage,
} from "@/components/sql-analysis-display.types";
import { Button } from "@/components/ui/button";
import type { CardConfig, Config } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface VisualizationPanelProps {
  visualizations: Array<{
    id: string;
    data: SqlAnalysisData | null;
    stage?: SqlAnalysisStage;
    progress?: number;
  }>;
  className?: string;
  onConfigChange?: (
    artifactId: string,
    config: {
      chartConfig?: Config;
      cardConfig?: CardConfig;
    },
  ) => void;
}

export function VisualizationPanel({
  visualizations,
  className,
  onConfigChange,
}: VisualizationPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset to latest visualization when new ones are added
  useEffect(() => {
    if (visualizations.length > 0) {
      setCurrentIndex(visualizations.length - 1);
    }
  }, [visualizations.length]);

  const currentViz = visualizations[currentIndex];
  const hasMultiple = visualizations.length > 1;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < visualizations.length - 1;

  const handlePrev = () => {
    if (canGoPrev) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

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
        <div className="flex-1 flex flex-col min-h-0 bg-background rounded-2xl border border-border shadow-xl">
          {/* Navigation Header */}
          {hasMultiple && (
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  disabled={!canGoPrev}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground min-w-[60px] text-center font-mono">
                  {currentIndex + 1} / {visualizations.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={!canGoNext}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Visualization Display */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            <SqlAnalysisDisplay
              data={currentViz.data}
              stage={currentViz.stage}
              progress={currentViz.progress}
              showStageIndicator={true}
              className="w-full"
              onConfigChange={
                onConfigChange
                  ? (config) => onConfigChange(currentViz.id, config)
                  : undefined
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
