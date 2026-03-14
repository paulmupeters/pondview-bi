import type { SqlBackend } from "@/lib/sql/sql-runtime";
import type {
  CardConfig,
  Config,
  Result,
  TableConfig,
  TextConfig,
} from "@/lib/types";

export type Dashboard = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type DashboardChart = {
  id: string;
  title: string | null;
  description: string | null;
  sql: string;
  dbIdentifier: string | null;
  sqlBackend?: SqlBackend | null;
  chartConfigJson: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  filtersApplied?: boolean;
  appliedFiltersCount?: number;
  skippedFilters?: Array<{ field: string; reason: string }>;
};

export type ChartGroup = {
  type: "metric-group" | "single";
  items: DashboardChart[];
};

export type LayoutRow = {
  columns: number;
  groups: ChartGroup[];
};

export type ResizeMode = "single" | "equalize" | "fit";

export type ResizePreviewItem = {
  itemId: string;
  chartId: string | null;
  colSpan: number;
  kind: ChartGroup["type"];
};

export type ResizeState = {
  chartId: string;
  mode: ResizeMode;
  previewSpans: ResizePreviewItem[];
  canFit: boolean;
  canEqualize: boolean;
} | null;

export type SortableChartCardProps = {
  chart: DashboardChart & { filtersApplied?: boolean };
  config: Config | CardConfig | TableConfig | TextConfig | null;
  rows: Result[];
  onConfigChange: (newChartJson: string) => Promise<void>;
  onDelete: () => Promise<void>;
  expandedSqlChartId: string | null;
  onToggleSql: (chartId: string) => void;
  onSqlUpdate: (chartId: string, newSql: string) => Promise<void>;
  totalColumns: number;
  isInGroup?: boolean;
  onResizeOpen?: (chartId: string, currentColSpan: number) => void;
  previewColSpan?: number | null;
  isSelected?: boolean;
  onSelect?: (chartId: string) => void;
  onPreviewChart?: (chartId: string) => void;
};

export type MetricCardGroupProps = {
  charts: DashboardChart[];
  chartData: Record<string, Result[]>;
  onConfigChange: (chartId: string, newJson: string) => Promise<void>;
  onDelete: (chartId: string) => Promise<void>;
  expandedSqlChartId: string | null;
  onToggleSql: (chartId: string) => void;
  onSqlUpdate: (chartId: string, newSql: string) => Promise<void>;
  totalColumns: number;
  selectedChartId: string | null;
  onChartSelect: (chartId: string) => void;
};

export type MetricCardInGroupProps = {
  chart: DashboardChart;
  chartData: Record<string, Result[]>;
  onConfigChange: (chartId: string, newJson: string) => Promise<void>;
  onDelete: (chartId: string) => Promise<void>;
  expandedSqlChartId: string | null;
  onToggleSql: (chartId: string) => void;
  onSqlUpdate: (chartId: string, newSql: string) => Promise<void>;
  isFirst: boolean;
  isLast: boolean;
  isSelected: boolean;
  onSelect: (chartId: string) => void;
};

export type MetricCardSqlEditorProps = {
  chart: DashboardChart;
  expandedSqlChartId: string | null;
  onToggleSql: (chartId: string) => void;
  onSqlUpdate: (chartId: string, newSql: string) => Promise<void>;
};
