import type {
  CardConfig,
  Config,
  Result,
  TableConfig,
  TextConfig,
} from "@/lib/types";
import type {
  ChartGroup,
  DashboardChart,
  LayoutRow,
  ResizeMode,
  ResizePreviewItem,
} from "./types";

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

export function isResizableConfig(
  config: Config | CardConfig | TableConfig | TextConfig | null,
): config is Config | TableConfig {
  if (!config) return false;
  return !isCardConfig(config) && !isTextConfig(config);
}

export function parseChartConfig(
  chart: DashboardChart,
): Config | CardConfig | TableConfig | TextConfig | null {
  try {
    return JSON.parse(chart.chartConfigJson) as
      | Config
      | CardConfig
      | TableConfig
      | TextConfig;
  } catch {
    return null;
  }
}

// Group consecutive metric cards together
export function groupConsecutiveMetricCards(
  charts: DashboardChart[],
  chartData: Record<string, Result[]>,
): ChartGroup[] {
  const groups: ChartGroup[] = [];
  let currentMetricGroup: DashboardChart[] = [];

  for (const chart of charts) {
    const config = parseChartConfig(chart);
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
    const parsed = parseChartConfig(chart);
    if (parsed && isResizableConfig(parsed) && "colSpan" in parsed) {
      span = (parsed as Config | TableConfig).colSpan ?? 1;
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
  shrinkRows = true,
): LayoutRow[] {
  const rows: LayoutRow[] = [];
  let currentGroups: ChartGroup[] = [];
  let usedColumns = 0;

  for (const group of groups) {
    const span = getGroupColSpan(group, maxColumns);
    if (currentGroups.length > 0 && usedColumns + span > maxColumns) {
      rows.push({
        columns: shrinkRows
          ? Math.min(maxColumns, Math.max(1, usedColumns))
          : maxColumns,
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
      columns: shrinkRows
        ? Math.min(maxColumns, Math.max(1, usedColumns || 1))
        : maxColumns,
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

export function canEqualizeRow(row: LayoutRow): boolean {
  return (
    row.groups.length > 1 &&
    row.groups.every((group) => {
      if (group.type !== "single") return false;
      const chart = group.items[0];
      return Boolean(chart && isResizableConfig(parseChartConfig(chart)));
    })
  );
}

export function canFitRow(row: LayoutRow): boolean {
  return canEqualizeRow(row);
}

export function getEvenSplit(
  totalColumns: number,
  itemCount: number,
): number[] {
  if (itemCount <= 0) return [];
  const base = Math.floor(totalColumns / itemCount);
  let remainder = totalColumns % itemCount;

  return Array.from({ length: itemCount }, () => {
    const next = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return next;
  });
}

export function getRowBasePreview(
  row: LayoutRow,
  totalColumns: number,
): ResizePreviewItem[] {
  const previewItems = row.groups.map((group, index) => {
    if (group.type === "metric-group") {
      return {
        itemId: `metric-group-${group.items[0]?.id ?? index}`,
        chartId: null,
        colSpan: Math.min(group.items.length, totalColumns),
        kind: group.type,
      };
    }

    const chart = group.items[0];
    const config = chart ? parseChartConfig(chart) : null;
    const explicitColSpan =
      chart && config && isResizableConfig(config)
        ? getChartColSpan(chart, totalColumns)
        : null;

    return {
      itemId: chart?.id ?? `single-${index}`,
      chartId: chart?.id ?? null,
      colSpan: explicitColSpan ?? 0,
      kind: group.type,
    };
  });

  const allocated = previewItems.reduce((sum, item) => sum + item.colSpan, 0);
  const flexibleIndexes = previewItems
    .map((item, index) =>
      item.kind === "single" && item.colSpan === 0 ? index : -1,
    )
    .filter((index) => index >= 0);
  const remaining = Math.max(0, totalColumns - allocated);

  if (flexibleIndexes.length > 0) {
    const split = getEvenSplit(remaining, flexibleIndexes.length);
    flexibleIndexes.forEach((itemIndex, splitIndex) => {
      previewItems[itemIndex] = {
        ...previewItems[itemIndex],
        colSpan: split[splitIndex] ?? 1,
      };
    });
    return previewItems;
  }

  if (remaining > 0 && previewItems.length > 0) {
    const extra = getEvenSplit(remaining, previewItems.length);
    return previewItems.map((item, index) => ({
      ...item,
      colSpan: item.colSpan + (extra[index] ?? 0),
    }));
  }

  return previewItems;
}

export function buildResizePreview(
  row: LayoutRow,
  activeChartId: string,
  mode: ResizeMode,
  totalColumns: number,
  activeColSpan?: number,
): ResizePreviewItem[] {
  if (mode === "fit" && canFitRow(row)) {
    return getRowBasePreview(row, totalColumns);
  }

  const shouldEqualize = mode === "equalize" && canEqualizeRow(row);
  if (shouldEqualize) {
    const evenSplit = getEvenSplit(totalColumns, row.groups.length);

    return row.groups.map((group, index) => {
      if (group.type === "metric-group") {
        return {
          itemId: `metric-group-${group.items[0]?.id ?? index}`,
          chartId: null,
          colSpan: Math.min(group.items.length, totalColumns),
          kind: group.type,
        };
      }

      const chart = group.items[0];
      return {
        itemId: chart?.id ?? `single-${index}`,
        chartId: chart?.id ?? null,
        colSpan: evenSplit[index] ?? 1,
        kind: group.type,
      };
    });
  }

  const basePreview = getRowBasePreview(row, totalColumns);
  const currentColSpan =
    basePreview.find((item) => item.chartId === activeChartId)?.colSpan ?? 1;

  return [
    {
      itemId: activeChartId,
      chartId: activeChartId,
      colSpan: Math.min(
        Math.max(1, activeColSpan ?? currentColSpan),
        totalColumns,
      ),
      kind: "single",
    },
  ];
}

export function findLayoutRowForChart(
  layoutRows: LayoutRow[],
  chartId: string,
): LayoutRow | null {
  return (
    layoutRows.find((row) =>
      row.groups.some((group) =>
        group.items.some((item) => item.id === chartId),
      ),
    ) ?? null
  );
}
