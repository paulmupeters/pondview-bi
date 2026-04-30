import { useMemo } from "react";
import { InlineChartConfig } from "@/components/inline-chart-config";
import { MetricCard } from "@/components/metric-card";
import { SqlChart } from "@/components/sql-chart";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
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
  onShowVisualOptionsChange,
}: ChartViewProps) {
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
          className="mx-auto w-fit border-0 shadow-none py-6"
        />
      ) : (
        <>
          {columnsForDialog.length > 0 && (
            <Collapsible
              open={showVisualOptions}
              onOpenChange={onShowVisualOptionsChange}
            >
              <CollapsibleContent
                id="chart-visual-options"
                className="px-4 pt-4"
              >
                <InlineChartConfig
                  chartConfig={chartConfig}
                  defaultChartConfig={defaultChartConfig}
                  onChartConfigChange={onChartConfigChange}
                  columns={columnsForDialog}
                  rows={selectedForChart?.rows}
                  showAdvancedConfig={true}
                  hideNarrativeFields={true}
                />
              </CollapsibleContent>
            </Collapsible>
          )}
          {selectedForChart && selectedForChart.rows.length > 0 ? (
            <SqlChart
              customChartConfig={effectiveChartConfig}
              dataOverride={selectedForChart}
              onTitleChange={(value) => updateChartMeta("title", value)}
              onDescriptionChange={(value) =>
                updateChartMeta("description", value)
              }
              onTakeawayChange={(value) => updateChartMeta("takeaway", value)}
            />
          ) : !selectedForChart && !selectedForCard ? (
            // Keep layout stable when no chart/card data can be rendered yet.
            <div className="min-h-[200px]" />
          ) : null}
        </>
      )}
    </div>
  );
}
