import {
  ChartBar,
  CheckCircle2,
  Database,
  Loader2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageIndicatorProps } from "../sql-analysis-display.types";

export function StageIndicator({
  currentStage,
  progress = 0,
}: StageIndicatorProps) {
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
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <div
          className="bg-primary h-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }}
        />
      </div>

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
                isPending && "opacity-40",
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300",
                  isActive && "border-primary bg-primary/10 scale-110",
                  isCompleted && "border-green-500 bg-green-500/10",
                  isPending && "border-muted-foreground/30 bg-muted",
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 transition-all duration-300",
                    isActive && "text-primary animate-pulse",
                    isCompleted && "text-green-500",
                    isPending && "text-muted-foreground",
                  )}
                />
              </div>
              <div className="text-center">
                <div
                  className={cn(
                    "text-xs font-medium transition-colors duration-300",
                    isActive && "text-primary",
                    isCompleted && "text-green-500",
                    isPending && "text-muted-foreground",
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
