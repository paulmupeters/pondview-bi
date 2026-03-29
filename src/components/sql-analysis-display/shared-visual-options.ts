import type { AddToDashboardVisualOption } from "@/components/add-to-dashboard-dialog";
import type {
  ActiveView,
  SelectedForCard,
  SelectedForChart,
  SelectedForTable,
  SqlAnalysisData,
} from "@/components/sql-analysis-display.types";
import type { CardConfig, Config, TableConfig, VisualType } from "@/lib/types";

export interface SqlAnalysisVisualState {
  defaultChartConfig: Config;
  effectiveChartConfig: Config;
  resolvedColumns: { name: string; type?: string }[];
  resolvedRows: Record<string, unknown>[];
  resolvedTableConfig: TableConfig | null;
  resolvedCardConfig: CardConfig | null;
  visualOptions: AddToDashboardVisualOption[];
}

export function buildDefaultChartConfig(
  columnsForDialog: { name: string }[],
): Config {
  const xKey = columnsForDialog[0]?.name ?? "";
  const fallbackYKey = columnsForDialog[1]?.name;

  return {
    visualType: "chart",
    description: "",
    title: "",
    type: "line",
    xKey,
    yKeys: fallbackYKey ? [fallbackYKey] : [],
    legend: false,
    multipleLines: false,
    countMode: false,
    showGrid: true,
    showXAxis: true,
    showYAxis: true,
    showDots: true,
    showTooltip: true,
    lineSize: 2,
    labelYAngle: -90,
  };
}

export function buildSqlAnalysisVisualState({
  data,
  chartConfig,
  cardConfig,
  columnsForDialog,
  selectedForChart,
  selectedForTable,
}: {
  data: SqlAnalysisData;
  chartConfig: Config | null;
  cardConfig: CardConfig | null;
  columnsForDialog: { name: string }[];
  selectedForChart: SelectedForChart | undefined;
  selectedForTable: SelectedForTable | undefined;
}): SqlAnalysisVisualState {
  const defaultChartConfig = buildDefaultChartConfig(columnsForDialog);
  const effectiveChartConfig =
    chartConfig ?? data.chartConfig ?? defaultChartConfig;

  const resolvedColumns =
    selectedForTable?.columns ??
    data.columns ??
    columnsForDialog.map((column) => ({ name: column.name }));

  const resolvedRows =
    selectedForTable?.rows ??
    (selectedForChart?.rows as Record<string, unknown>[] | undefined) ??
    (data.rows as Record<string, unknown>[] | undefined) ??
    [];

  let resolvedTableConfig: TableConfig | null = data.tableConfig ?? null;
  if (!resolvedTableConfig && resolvedColumns.length > 0) {
    const querySnippet = data.query ?? "";
    const truncatedQuery =
      querySnippet.length > 50
        ? `${querySnippet.slice(0, 50)}...`
        : querySnippet;

    resolvedTableConfig = {
      configType: "table",
      title:
        data.chartConfig?.title ||
        (truncatedQuery
          ? `Table: ${truncatedQuery}`
          : effectiveChartConfig.title
            ? `${effectiveChartConfig.title} (table)`
            : "Data table"),
      description:
        data.summary?.insights?.[0] ??
        (data.tableConfig as TableConfig | undefined)?.description ??
        "Query results",
    };
  }

  let resolvedCardConfig: CardConfig | null =
    cardConfig ?? data.cardConfig ?? null;
  if (!resolvedCardConfig && resolvedColumns.length > 0) {
    const firstColumnName = resolvedColumns[0]?.name ?? "Value";
    resolvedCardConfig = {
      configType: "card",
      title: firstColumnName,
      description:
        data.summary?.insights?.[0] ?? `First value from ${firstColumnName}`,
      takeaway: data.cardConfig?.takeaway,
    };
  }

  const visualOptions: AddToDashboardVisualOption[] = [];

  if (effectiveChartConfig) {
    visualOptions.push({
      type: "chart",
      config: effectiveChartConfig,
      columns: resolvedColumns,
      rows: resolvedRows,
    });
  }

  if (resolvedTableConfig && resolvedColumns.length > 0) {
    visualOptions.push({
      type: "table",
      config: resolvedTableConfig,
      columns: resolvedColumns,
      rows: resolvedRows,
    });
  }

  if (
    resolvedCardConfig &&
    resolvedColumns.length > 0 &&
    resolvedRows.length > 0
  ) {
    visualOptions.push({
      type: "card",
      config: resolvedCardConfig,
      columns: resolvedColumns,
      rows: resolvedRows,
    });
  }

  return {
    defaultChartConfig,
    effectiveChartConfig,
    resolvedColumns,
    resolvedRows,
    resolvedTableConfig,
    resolvedCardConfig,
    visualOptions,
  };
}

export function resolveDefaultDashboardVisualType({
  activeView,
  selectedForCard,
}: {
  activeView: ActiveView;
  selectedForCard: SelectedForCard | undefined;
}): VisualType {
  if (activeView === "table") {
    return "table";
  }

  if (selectedForCard) {
    return "card";
  }

  return "chart";
}
