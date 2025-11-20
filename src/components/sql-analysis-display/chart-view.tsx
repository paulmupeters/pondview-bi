import {
  Cog6ToothIcon,
  PlusIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { AddToDashboardDialog } from "@/components/add-to-dashboard-dialog";
import { CardConfigDialog, CardConfigForm } from "@/components/card-config-dialog";
import { ChartConfigDialog, ChartConfigForm } from "@/components/chart-config-dialog";
import { MetricCard } from "@/components/metric-card";
import { SqlChart } from "@/components/sql-chart";
import type { CardConfig, Config } from "@/lib/types";
import type {
  SelectedForCard,
  SelectedForChart,
} from "../sql-analysis-display.types";

interface ChartViewProps {
  data: any;
  selectedForChart: SelectedForChart | undefined;
  selectedForCard: SelectedForCard | undefined;
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
  chartConfig,
  cardConfig,
  columnsForDialog,
  onChartConfigChange,
  onCardConfigChange,
  renderSqlControls,
  renderSqlEditor,
}: ChartViewProps) {
  return (
    <div className="group relative flex flex-col rounded-xl bg-card p-4 md:p-2">
      {selectedForCard ? (
        <>
          {renderSqlControls(
            <>
              <CardConfigDialog
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Configure card"
                    title="Configure card"
                  >
                    <Cog6ToothIcon className="h-4 w-4" />
                  </button>
                }
                config={cardConfig}
                onConfigChange={onCardConfigChange}
                tooltip="Configure card"
              />
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
                cardConfig={cardConfig ?? data.cardConfig ?? undefined}
                defaultTitle={cardConfig?.title ?? data.cardConfig?.title}
                tooltip="Add to dashboard"
              />
            </>,
            "sql-editor-analysis-card",
          )}
          {cardConfig ? (
            <MetricCard
              value={selectedForCard.value as string | number | boolean | Date}
              title={
                cardConfig?.title ??
                data.cardConfig?.title ??
                selectedForCard.columnName
              }
              description={cardConfig?.description ?? data.cardConfig?.description}
              takeaway={cardConfig?.takeaway ?? data.cardConfig?.takeaway}
              className="mx-auto w-fit border-0 shadow-none"
            />
          ) : (
            <div className="mb-4">
              <div className="p-6 max-h-[400px] overflow-y-auto border rounded-lg">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold mb-2">Card Configuration</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure your card to display the value
                  </p>
                </div>
                <CardConfigForm
                  config={cardConfig}
                  onConfigChange={onCardConfigChange}
                  inline={true}
                />
              </div>
            </div>
          )}
          {renderSqlEditor("sql-editor-analysis-card")}
        </>
      ) : (
        <>
          {renderSqlControls(
            <>
              <ChartConfigDialog
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Configure chart"
                    title="Configure chart"
                  >
                    <Cog6ToothIcon className="h-4 w-4" />
                  </button>
                }
                config={chartConfig}
                columns={columnsForDialog}
                rows={selectedForChart?.rows ?? []}
                onConfigChange={onChartConfigChange}
                tooltip="Configure chart"
              />
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
                chartConfig={
                  chartConfig ??
                  data.chartConfig ?? {
                    description: "",
                    type: "bar",
                    title: "",
                    xKey: "",
                    yKeys: [],
                    multipleLines: false,
                    legend: false,
                    countMode: false,
                  }
                }
                defaultTitle={chartConfig?.title ?? data.chartConfig?.title}
                tooltip="Add to dashboard"
              />
            </>,
            "sql-editor-analysis-chart",
          )}

            {selectedForChart && selectedForChart.rows.length > 0 ? (
              chartConfig ? (
                <SqlChart
                  customChartConfig={chartConfig ?? undefined}
                  dataOverride={selectedForChart}
                />
              ) : (
                <div className="mb-4">
                  <div className="p-6 max-h-[400px] overflow-y-auto border rounded-lg">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold mb-2">Chart Configuration</h3>
                    </div>
                    <ChartConfigForm
                      config={chartConfig}
                      columns={columnsForDialog}
                      rows={selectedForChart.rows}
                      onConfigChange={onChartConfigChange}
                      inline={true}
                    />
                  </div>
                </div>
              )
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
