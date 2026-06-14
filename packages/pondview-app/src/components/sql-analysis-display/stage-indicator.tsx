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
  progress: _progress = 0,
}: StageIndicatorProps) {
  const stages = [
    {
      id: "loading" as const,
      label: "Preparing",
      icon: Loader2,
    },
    {
      id: "processing" as const,
      label: "Processing",
      icon: Database,
    },
    {
      id: "analyzing" as const,
      label: "Analyzing",
      icon: Search,
    },
    {
      id: "visualizing" as const,
      label: "Visualizing",
      icon: ChartBar,
    },
    {
      id: "complete" as const,
      label: "Complete",
      icon: CheckCircle2,
    },
  ];

  const currentStageIndex = stages.findIndex((s) => s.id === currentStage);

  return (
    <div className="flex items-center justify-between gap-1 py-2">
      {stages.map((stage, index) => {
        const Icon = stage.icon;
        const isActive = stage.id === currentStage;
        const isCompleted = index < currentStageIndex;
        const isPending = index > currentStageIndex;

        return (
          <div
            key={stage.id}
            className={cn(
              "flex flex-col items-center gap-1 flex-1",
              isPending && "opacity-40",
            )}
          >
            <Icon
              className={cn(
                "w-4 h-4",
                isActive && "text-primary",
                isCompleted && "text-green-500",
                isPending && "text-muted-foreground",
              )}
            />
            <div
              className={cn(
                "text-xs",
                isActive && "text-primary font-medium",
                isCompleted && "text-green-500",
                isPending && "text-muted-foreground",
              )}
            >
              {stage.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
