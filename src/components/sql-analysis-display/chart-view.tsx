import { Cog6ToothIcon, PlusIcon } from "@heroicons/react/24/outline";
import { type ReactNode } from "react";
import { AddToDashboardDialog } from "@/components/add-to-dashboard-dialog";
import { CardConfigDialog } from "@/components/card-config-dialog";
import { ChartConfigDialog } from "@/components/chart-config-dialog";
import { SqlChart } from "@/components/sql-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
                    <PlusIcon className="h-4 w-4" />
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
          <Card className="mx-auto w-fit border-0 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-medium text-muted-foreground">
                {cardConfig?.title ??
                  data.cardConfig?.title ??
                  selectedForCard.columnName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground">
                {typeof selectedForCard.value === "number"
                  ? selectedForCard.value.toLocaleString()
                  : typeof selectedForCard.value === "boolean"
                    ? selectedForCard.value.toString()
                    : selectedForCard.value instanceof Date
                      ? selectedForCard.value.toLocaleString()
                      : String(selectedForCard.value)}
              </div>
              {(cardConfig?.description ?? data.cardConfig?.description) && (
                <div className="text-sm text-muted-foreground mt-2">
                  {cardConfig?.description ?? data.cardConfig?.description}
                </div>
              )}
              {(cardConfig?.takeaway ?? data.cardConfig?.takeaway) && (
                <div className="text-xs text-muted-foreground mt-2 italic">
                  {cardConfig?.takeaway ?? data.cardConfig?.takeaway}
                </div>
              )}
            </CardContent>
          </Card>
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
                    <PlusIcon className="h-4 w-4" />
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

          {selectedForChart && (
            <SqlChart
              customChartConfig={chartConfig ?? undefined}
              dataOverride={selectedForChart}
            />
          )}
          {renderSqlEditor("sql-editor-analysis-chart")}
        </>
      )}
    </div>
  );
}
