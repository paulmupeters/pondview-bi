import type {
  SqlAnalysisData,
  SqlAnalysisStage,
} from "@/components/sql-analysis-display.types";
import type { CardConfig, Config } from "@/lib/types";

export type VisualizationEntry = {
  id: string;
  data: SqlAnalysisData | null;
  stage?: SqlAnalysisStage;
  progress?: number;
  artifactId?: string;
  canAddToChat?: boolean;
  onConfigChange?: (config: {
    chartConfig?: Config;
    cardConfig?: CardConfig;
  }) => void;
  onVisualTypeChange?: (visualType: "table" | "chart" | "card") => void;
  source?: "artifact" | "manual-repl";
};
