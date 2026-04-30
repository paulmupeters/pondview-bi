import { useMemo, useState } from "react";
import { InlineChartConfig } from "@/components/inline-chart-config";
import { MetricCard } from "@/components/metric-card";
import { SqlChart } from "@/components/sql-chart";
import type { CardConfig, Config } from "@/lib/types";
import type {
  SelectedForCard,
  SelectedForChart,
  SqlAnalysisData,
} from "../sql-analysis-display.types";
import {
  buildDefaultChartConfig,
  buildSqlAnalysisVisualState,
} from "./shared-visual-options";

interface ChartViewProps {
  data: SqlAnalysisData;
  selectedForChart: SelectedForChart | undefined;
  selectedForCard: SelectedForCard | undefined;
  chartConfig: Config | null;
  cardConfig: CardConfig | null;
  columnsForDialog: { name: string }[];
  onChartConfigChange: (config: Config | null) => void;
  onCardConfigChange: (config: CardConfig | null) => void;
  showVisualOptions: boolean;
  onShowVisualOptionsChange: (open: boolean) => void;
}

export function ChartView({
  data,
  selectedForChart,
  selectedForCard,
  chartConfig,
  cardConfig,
  columnsForDialog,
  onChartConfigChange,
  onCardConfigChange,
  showVisualOptions,
}: ChartViewProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const defaultChartConfig = useMemo(
    () => buildDefaultChartConfig(columnsForDialog),
    [columnsForDialog],
  );
  const { effectiveChartConfig, resolvedCardConfig } = useMemo(
    () =>
      buildSqlAnalysisVisualState({
        data,
        chartConfig,
        cardConfig,
        columnsForDialog,
        selectedForChart,
        selectedForTable: undefined,
      }),
    [cardConfig, chartConfig, columnsForDialog, data, selectedForChart],
  );

  const updateChartMeta = (
    field: "title" | "description" | "takeaway",
    value: string,
  ) => {
    if (field === "title") {
      onChartConfigChange({
        ...effectiveChartConfig,
        title: value,
      });
      return;
    }
    if (field === "description") {
      onChartConfigChange({
        ...effectiveChartConfig,
        description: value,
      });
      return;
    }
    onChartConfigChange({
      ...effectiveChartConfig,
      takeaway: value.trim() ? value : undefined,
    });
  };

  const baseCardConfig: CardConfig = resolvedCardConfig ?? {
    configType: "card",
    title: selectedForCard?.columnName ?? "Value",
    description: "",
  };

  const updateCardMeta = (
    field: "title" | "description" | "takeaway",
    value: string,
  ) => {
    if (field === "title") {
      onCardConfigChange({
        ...baseCardConfig,
        title: value,
      });
      return;
    }
    if (field === "description") {
      onCardConfigChange({
        ...baseCardConfig,
        description: value,
      });
      return;
    }
    onCardConfigChange({
      ...baseCardConfig,
      takeaway: value.trim() ? value : undefined,
    });
  };

  return (
    <div className="flex flex-col bg-background">
      {selectedForCard ? (
        <MetricCard
          value={selectedForCard.value as string | number | boolean | Date}
          title={
            cardConfig?.title ??
            data.cardConfig?.title ??
            selectedForCard.columnName
          }
          description={cardConfig?.description ?? data.cardConfig?.description}
          takeaway={cardConfig?.takeaway ?? data.cardConfig?.takeaway}
          editable={true}
          onTitleChange={(value) => updateCardMeta("title", value)}
          onDescriptionChange={(value) => updateCardMeta("description", value)}
          onTakeawayChange={(value) => updateCardMeta("takeaway", value)}
          className="mx-auto my-2 w-fit border-0 shadow-none py-6"
        />
      ) : selectedForChart && selectedForChart.rows.length > 0 ? (
        <div
          className={
            showVisualOptions ? "flex flex-col lg:flex-row lg:gap-0" : undefined
          }
        >
          {/* Chart on the left */}
          <div className="flex-1 min-w-0">
            <SqlChart
              customChartConfig={effectiveChartConfig}
              dataOverride={selectedForChart}
              onTitleChange={(value) => updateChartMeta("title", value)}
              onDescriptionChange={(value) =>
                updateChartMeta("description", value)
              }
              onTakeawayChange={(value) => updateChartMeta("takeaway", value)}
            />
          </div>

          {/* Options panel on the right */}
          {columnsForDialog.length > 0 && showVisualOptions && (
            <div
              id="chart-visual-options"
              className="w-full shrink-0 lg:w-52 lg:border-l lg:border-border/60 lg:overflow-y-auto lg:max-h-[70vh]"
            >
              <InlineChartConfig
                chartConfig={chartConfig}
                defaultChartConfig={defaultChartConfig}
                onChartConfigChange={onChartConfigChange}
                columns={columnsForDialog}
                rows={selectedForChart?.rows}
                showAdvancedConfig={showAdvanced}
                onToggleAdvanced={() => setShowAdvanced((s) => !s)}
                hideNarrativeFields={true}
                sidebar
              />
            </div>
          )}
        </div>
      ) : !selectedForChart && !selectedForCard ? (
        <div className="min-h-[200px]" />
      ) : null}
    </div>
  );
}
