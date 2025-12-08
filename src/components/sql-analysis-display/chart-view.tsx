import { Squares2X2Icon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  AddToDashboardDialog,
  type AddToDashboardVisualOption,
} from "@/components/add-to-dashboard-dialog";
import { InlineChartConfig } from "@/components/inline-chart-config";
import { MetricCard } from "@/components/metric-card";
import { SqlChart } from "@/components/sql-chart";
import { Button } from "@/components/ui/button";
import type { CardConfig, Config, TableConfig } from "@/lib/types";
import type {
  SelectedForCard,
  SelectedForChart,
  SelectedForTable,
  SqlAnalysisData,
} from "../sql-analysis-display.types";

interface ChartViewProps {
  data: SqlAnalysisData;
  selectedForChart: SelectedForChart | undefined;
  selectedForCard: SelectedForCard | undefined;
  selectedForTable: SelectedForTable | undefined;
  chartConfig: Config | null;
  cardConfig: CardConfig | null;
  columnsForDialog: { name: string }[];
  onChartConfigChange: (config: Config | null) => void;
  onCardConfigChange: (config: CardConfig | null) => void;
  renderSqlControls: (
    extraControls?: ReactNode,
    editorId?: string,
  ) => ReactNode;
  renderSqlEditor: (editorId?: string) => ReactNode;
}

export function ChartView({
  data,
  selectedForChart,
  selectedForCard,
  selectedForTable,
  chartConfig,
  cardConfig,
  columnsForDialog,
  onChartConfigChange,
  onCardConfigChange,
  renderSqlControls,
  renderSqlEditor,
}: ChartViewProps) {
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  const defaultChartConfig = useMemo<Config>(() => {
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
  }, [columnsForDialog]);

  const effectiveChartConfig =
    chartConfig ?? data.chartConfig ?? defaultChartConfig;

  const resolvedColumns = useMemo(
    () =>
      selectedForTable?.columns ??
      data.columns ??
      columnsForDialog.map((column) => ({ name: column.name })),
    [columnsForDialog, data.columns, selectedForTable?.columns],
  );

  const resolvedRows = useMemo<Record<string, unknown>[]>(
    () =>
      selectedForTable?.rows ??
      (selectedForChart?.rows as Record<string, unknown>[] | undefined) ??
      (data.rows as Record<string, unknown>[] | undefined) ??
      [],
    [data.rows, selectedForChart?.rows, selectedForTable?.rows],
  );

  const resolvedTableConfig = useMemo<TableConfig | null>(() => {
    if (data.tableConfig) return data.tableConfig;
    if (!resolvedColumns.length) return null;
    const querySnippet = data.query ?? "";
    const truncatedQuery =
      querySnippet.length > 50
        ? `${querySnippet.slice(0, 50)}...`
        : querySnippet;
    return {
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
        (data.tableConfig as unknown as TableConfig)?.description ??
        "Query results",
    };
  }, [
    data.chartConfig?.title,
    data.summary?.insights,
    data.tableConfig,
    data.query,
    effectiveChartConfig.title,
    resolvedColumns.length,
  ]);

  const resolvedCardConfig = useMemo<CardConfig | null>(() => {
    if (cardConfig) return cardConfig;
    if (data.cardConfig) return data.cardConfig;
    if (!resolvedColumns.length) return null;
    const firstColumnName = resolvedColumns[0]?.name ?? "Value";
    return {
      configType: "card",
      title: firstColumnName,
      description:
        data.summary?.insights?.[0] ?? `First value from ${firstColumnName}`,
      takeaway: (data.cardConfig as unknown as CardConfig)?.takeaway,
    };
  }, [cardConfig, data.cardConfig, data.summary?.insights, resolvedColumns]);

  const visualOptions = useMemo<AddToDashboardVisualOption[]>(() => {
    const options: AddToDashboardVisualOption[] = [];
    if (effectiveChartConfig) {
      options.push({
        type: "chart",
        config: effectiveChartConfig,
        columns: resolvedColumns,
        rows: resolvedRows,
      });
    }
    if (resolvedTableConfig && resolvedColumns.length > 0) {
      options.push({
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
      options.push({
        type: "card",
        config: resolvedCardConfig,
        columns: resolvedColumns,
        rows: resolvedRows,
      });
    }
    return options;
  }, [
    effectiveChartConfig,
    resolvedCardConfig,
    resolvedColumns,
    resolvedRows,
    resolvedTableConfig,
  ]);

  return (
    <div className="group relative flex flex-col bg-card border border-border">
      {selectedForCard ? (
        <>
          {renderSqlControls(
            visualOptions.length > 0 ? (
              <AddToDashboardDialog
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Add to dashboard"
                    title="Add to dashboard"
                  >
                    <Squares2X2Icon className="h-4 w-4" />
                  </button>
                }
                sql={data.query ?? ""}
                dbIdentifier={data.dbIdentifier}
                defaultTitle={cardConfig?.title ?? data.cardConfig?.title}
                tooltip="Add to dashboard"
                visualOptions={visualOptions}
                defaultVisualType="card"
              />
            ) : undefined,
            "sql-editor-analysis-card",
          )}
          {columnsForDialog.length > 0 && (
            <InlineChartConfig
              chartConfig={null}
              defaultChartConfig={defaultChartConfig}
              onChartConfigChange={() => { }}
              columns={columnsForDialog}
              rows={selectedForChart?.rows}
              cardConfig={cardConfig}
              onCardConfigChange={onCardConfigChange}
              isCardMode={true}
            />
          )}
          <MetricCard
            value={selectedForCard.value as string | number | boolean | Date}
            title={
              cardConfig?.title ??
              data.cardConfig?.title ??
              selectedForCard.columnName
            }
            description={
              cardConfig?.description ?? data.cardConfig?.description
            }
            takeaway={cardConfig?.takeaway ?? data.cardConfig?.takeaway}
            className="mx-auto w-fit border-0 shadow-none"
          />
          {renderSqlEditor("sql-editor-analysis-card")}
        </>
      ) : (
        <>
          {renderSqlControls(
            <>
              {columnsForDialog.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs font-mono"
                  onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
                >
                  Advanced config
                </Button>
              )}
              {visualOptions.length > 0 && (
                <AddToDashboardDialog
                  trigger={
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Add to dashboard"
                      title="Add to dashboard"
                    >
                      <Squares2X2Icon className="h-4 w-4" />
                    </button>
                  }
                  sql={data.query ?? ""}
                  defaultTitle={effectiveChartConfig.title}
                  tooltip="Add to dashboard"
                  dbIdentifier={data.dbIdentifier}
                  visualOptions={visualOptions}
                  defaultVisualType="chart"
                />
              )}
            </>,
            "sql-editor-analysis-chart",
          )}
            {columnsForDialog.length > 0 && (
              <InlineChartConfig
                chartConfig={chartConfig}
                defaultChartConfig={defaultChartConfig}
                onChartConfigChange={onChartConfigChange}
                columns={columnsForDialog}
                rows={selectedForChart?.rows}
                showAdvancedConfig={showAdvancedConfig}
                onToggleAdvancedConfig={() =>
                  setShowAdvancedConfig(!showAdvancedConfig)
                }
              />
            )}
            {selectedForChart && selectedForChart.rows.length > 0 ? (
              <SqlChart
                customChartConfig={effectiveChartConfig}
                dataOverride={selectedForChart}
              />
            ) : !selectedForChart && !selectedForCard ? (
              // When there's no data, the SQL editor will be shown via renderSqlEditor
              // This empty div ensures the layout is maintained
              <div className="min-h-[200px]" />
            ) : null}
          {renderSqlEditor("sql-editor-analysis-chart")}
        </>
      )}
    </div>
  );
}
