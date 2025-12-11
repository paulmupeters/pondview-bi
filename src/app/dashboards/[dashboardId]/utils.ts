import type {
  CardConfig,
  Config,
  Result,
  TableConfig,
  TextConfig,
} from "@/lib/types";
import type { ChartGroup, DashboardChart, LayoutRow } from "./types";

// Helper function to check if config is a card config
export function isCardConfig(
  config: Config | CardConfig | TableConfig | TextConfig | null,
): config is CardConfig {
  if (!config) return false;
  // Check if it has the configType discriminator
  if ("configType" in config) {
    return config.configType === "card";
  }
  // Backwards compatibility: check if it looks like a card config
  // Cards have title and description but no chart-specific fields
  return (
    !("yKeys" in config) &&
    !("type" in config) &&
    !("xKey" in config) &&
    "title" in config &&
    "description" in config
  );
}

// Helper function to check if config is a table config
export function isTableConfig(
  config: Config | CardConfig | TableConfig | TextConfig | null,
): config is TableConfig {
  if (!config) return false;
  // Check if it has the configType discriminator
  if ("configType" in config) {
    return config.configType === "table";
  }
  // New table configs will always have configType, so if it doesn't have it,
  // it's not a table (it's either a card or chart)
  return false;
}

export function isTextConfig(
  config: Config | CardConfig | TableConfig | TextConfig | null,
): config is TextConfig {
  if (!config) return false;
  return "configType" in config && config.configType === "text";
}

// Group consecutive metric cards together
export function groupConsecutiveMetricCards(
  charts: DashboardChart[],
  chartData: Record<string, Result[]>,
): ChartGroup[] {
  const groups: ChartGroup[] = [];
  let currentMetricGroup: DashboardChart[] = [];

  for (const chart of charts) {
    let config: Config | CardConfig | TableConfig | TextConfig | null = null;
    try {
      const parsed = JSON.parse(chart.chartConfigJson);
      config = parsed as Config | CardConfig | TableConfig | TextConfig;
    } catch {
      config = null;
    }

    const rows = chartData[chart.id] || [];
    const isMetricCard = config && rows.length > 0 && isCardConfig(config);

    if (isMetricCard) {
      // Add to current metric group
      currentMetricGroup.push(chart);
    } else {
      // If we have a pending metric group, finalize it
      if (currentMetricGroup.length > 0) {
        // Only group if there are 2+ cards, otherwise treat as single
        if (currentMetricGroup.length > 1) {
          groups.push({ type: "metric-group", items: [...currentMetricGroup] });
        } else {
          groups.push({ type: "single", items: [...currentMetricGroup] });
        }
        currentMetricGroup = [];
      }
      // Add non-metric card as single item
      groups.push({ type: "single", items: [chart] });
    }
  }

  // Finalize any remaining metric group
  if (currentMetricGroup.length > 0) {
    // Only group if there are 2+ cards, otherwise treat as single
    if (currentMetricGroup.length > 1) {
      groups.push({ type: "metric-group", items: currentMetricGroup });
    } else {
      groups.push({ type: "single", items: currentMetricGroup });
    }
  }

  return groups;
}

// Determine desired colSpan for a single chart (defaults to 1)
export function getChartColSpan(
  chart: DashboardChart,
  maxColumns: number,
): number {
  let span = 1;
  try {
    const parsed = JSON.parse(chart.chartConfigJson) as
      | Config
      | CardConfig
      | TableConfig
      | TextConfig;
    const isChartConfig =
      parsed &&
      !isCardConfig(parsed) &&
      !isTableConfig(parsed) &&
      !isTextConfig(parsed) &&
      "colSpan" in parsed;
    if (isChartConfig) {
      span = (parsed as Config).colSpan ?? 1;
    }
  } catch {
    span = 1;
  }
  return Math.min(Math.max(1, span), maxColumns);
}

// Determine how many columns a chart group wants to occupy
export function getGroupColSpan(group: ChartGroup, maxColumns: number): number {
  if (group.type === "metric-group") {
    return Math.min(group.items.length, maxColumns);
  }
  const chart = group.items[0];
  if (!chart) return 1;
  return getChartColSpan(chart, maxColumns);
}

// Build rows so each row knows the columns it actually needs (up to max)
export function buildRows(
  groups: ChartGroup[],
  maxColumns: number,
): LayoutRow[] {
  const rows: LayoutRow[] = [];
  let currentGroups: ChartGroup[] = [];
  let usedColumns = 0;

  for (const group of groups) {
    const span = getGroupColSpan(group, maxColumns);
    if (currentGroups.length > 0 && usedColumns + span > maxColumns) {
      rows.push({
        columns: Math.min(maxColumns, Math.max(1, usedColumns)),
        groups: currentGroups,
      });
      currentGroups = [];
      usedColumns = 0;
    }
    currentGroups.push(group);
    usedColumns = Math.min(maxColumns, usedColumns + span);
  }

  if (currentGroups.length > 0) {
    rows.push({
      columns: Math.min(maxColumns, Math.max(1, usedColumns || 1)),
      groups: currentGroups,
    });
  }

  return rows;
}

// Get col-span class based on displayColSpan
export function getColSpanClass(span: number, totalColumns: number): string {
  if (totalColumns <= 1 || span === 1) return "";
  const colSpanMap: Record<number, Record<number, string>> = {
    2: {
      2: "md:col-span-2",
    },
    3: {
      2: "lg:col-span-2",
      3: "lg:col-span-3",
    },
    4: {
      2: "lg:col-span-2",
      3: "lg:col-span-3",
      4: "lg:col-span-4",
    },
    5: {
      2: "lg:col-span-2",
      3: "lg:col-span-3",
      4: "lg:col-span-4",
      5: "lg:col-span-5",
    },
    6: {
      2: "lg:col-span-2",
      3: "lg:col-span-3",
      4: "lg:col-span-4",
      5: "lg:col-span-5",
      6: "lg:col-span-6",
    },
  };
  return colSpanMap[totalColumns]?.[span] || "";
}

export function getGridColsClass(cols: number): string {
  const colMap: Record<number, string> = {
    1: "grid-cols-1",
    2: "md:grid-cols-2",
    3: "md:grid-cols-2 lg:grid-cols-3",
    4: "md:grid-cols-2 lg:grid-cols-4",
    5: "md:grid-cols-2 lg:grid-cols-5",
    6: "md:grid-cols-2 lg:grid-cols-6",
  };
  return colMap[cols] || colMap[3];
}
