import type { DashboardSourceDescriptor } from "@/lib/dashboard/source-descriptor";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import type {
  CardConfig,
  Config,
  Result,
  TableConfig,
  TextConfig,
} from "@/lib/types";

export type SqlAnalysisStage =
  | "initial"
  | "loading"
  | "processing"
  | "analyzing"
  | "visualizing"
  | "complete";

export type SqlAnalysisData = {
  stage?: SqlAnalysisStage;
  progress?: number;
  query?: string;
  dbIdentifier?: string;
  catalogContext?: string | null;
  sqlBackend?: SqlBackend;
  sourceDescriptor?: DashboardSourceDescriptor | null;
  executionTime?: number;
  rowCount?: number;
  columns?: { name: string; type?: string }[];
  rows?: Result[];
  visualType?: "table" | "chart" | "card" | "text";
  isSqlExpandedInitial?: boolean;
  chartConfig?: Config;
  cardConfig?: CardConfig;
  tableConfig?: TableConfig;
  textConfig?: TextConfig;
  summary?: {
    totalRows: number;
    executionTimeMs?: number;
    insights: string[];
    queryType?: string;
  };
};

export interface SqlAnalysisDisplayProps {
  data: SqlAnalysisData | null;
  stage?: SqlAnalysisStage;
  progress?: number;
  showStageIndicator?: boolean;
  history?: {
    currentIndex: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
  };
  className?: string;
  onDelete?: () => void;
  selectedDbLabel?: string;
  onAddToChat?: (payload: SqlAnalysisData) => void;
  canAddToChat?: boolean;
  artifactId?: string;
  onConfigChange?: (config: {
    chartConfig?: Config;
    cardConfig?: CardConfig;
  }) => void;
  onVisualTypeChange?: (visualType: "table" | "chart" | "card") => void;
}

export interface StageIndicatorProps {
  currentStage: SqlAnalysisStage;
  progress?: number;
}

export type ActiveView = "table" | "chart";

export interface SelectedForChart {
  stage: "complete";
  rows: Result[];
  chartConfig?: Config;
  summary?: SqlAnalysisData["summary"];
}

export interface SelectedForTable {
  stage: "complete";
  columns: { name: string; type?: string }[];
  rows: Record<string, unknown>[];
  summary?: SqlAnalysisData["summary"];
}

export interface SelectedForCard {
  stage: "complete";
  columnName: string;
  value: unknown;
}
