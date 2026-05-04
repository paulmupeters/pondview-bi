import { InfoIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { transformDataForMultiLineChart } from "@/lib/rechart-format";
import type { Config, Result } from "@/lib/types";
import { cn, getChartColors } from "@/lib/utils";

function toTitleCase(value: unknown): string {
  const str =
    typeof value === "string" ? value : value == null ? "" : String(value);
  if (str.length === 0) return "";
  return str
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function coerceChartRows(chartData: Result[]): Result[] {
  return chartData.map((item) => {
    const parsedItem: { [key: string]: string | number | boolean | Date } = {};
    for (const [key, value] of Object.entries(item)) {
      parsedItem[key] = Number.isNaN(Number(value)) ? value : Number(value);
    }
    return parsedItem;
  });
}

function legendEntriesToChartConfig(
  legendEntries: string[],
): Record<string, { label: string; color: string }> {
  return legendEntries.reduce(
    (acc, key, index) => {
      acc[key] = {
        label: key,
        color: `var(--chart-${(index % 8) + 1})`,
      };
      return acc;
    },
    {} as Record<string, { label: string; color: string }>,
  );
}

export function DynamicChart({
  chartData,
  chartConfig,
  className,
  showMetadata = true,
}: {
  chartData: Result[];
  chartConfig: Config;
  className?: string;
  showMetadata?: boolean;
}) {
  const defaultColors = useMemo(() => getChartColors(), []);
  const normalizedChartData = useMemo(
    () => coerceChartRows(chartData),
    [chartData],
  );
  const processedChartData = useMemo(() => {
    let nextChartData =
      chartConfig.type === "pie" && normalizedChartData.length > 8
        ? normalizedChartData.slice(0, 20)
        : normalizedChartData;

    if (!chartConfig.countMode) {
      return nextChartData;
    }

    const countsMap = new Map<
      string,
      { xValue: string | number | boolean | Date; count: number }
    >();

    for (const row of nextChartData) {
      const xValue = row[chartConfig.xKey];
      if (xValue === undefined || xValue === null) continue;
      const key = String(xValue);
      const existing = countsMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        countsMap.set(key, { xValue, count: 1 });
      }
    }

    nextChartData = Array.from(countsMap.values()).map((entry) => ({
      [chartConfig.xKey]: entry.xValue,
      count: entry.count,
    }));

    const allNumericXValues = nextChartData.every(
      (item) => typeof item[chartConfig.xKey] === "number",
    );
    return allNumericXValues
      ? [...nextChartData].sort(
          (a, b) =>
            (a[chartConfig.xKey] as number) - (b[chartConfig.xKey] as number),
        )
      : nextChartData;
  }, [
    chartConfig.countMode,
    chartConfig.type,
    chartConfig.xKey,
    normalizedChartData,
  ]);
  const resolvedYKeys = useMemo(
    () => (chartConfig.countMode ? ["count"] : chartConfig.yKeys),
    [chartConfig.countMode, chartConfig.yKeys],
  );
  const chartContainerConfig = useMemo(
    () =>
      chartConfig.countMode
        ? { count: { label: "Count", color: "var(--chart-1)" } }
        : legendEntriesToChartConfig(resolvedYKeys),
    [chartConfig.countMode, resolvedYKeys],
  );
  const lineChartState = useMemo(() => {
    if (chartConfig.type !== "line") {
      return null;
    }

    const transformed = transformDataForMultiLineChart(
      processedChartData,
      chartConfig,
    );
    const useTransformedData =
      !chartConfig.countMode &&
      chartConfig.multipleLines &&
      chartConfig.measurementColumn &&
      chartConfig.yKeys.includes(chartConfig.measurementColumn);

    return {
      ...transformed,
      useTransformedData,
      data: useTransformedData ? transformed.data : processedChartData,
      yAxisKey: useTransformedData
        ? (chartConfig.measurementColumn ?? resolvedYKeys[0])
        : resolvedYKeys[0],
      lineKeys: useTransformedData ? transformed.lineFields : resolvedYKeys,
    };
  }, [chartConfig, processedChartData, resolvedYKeys]);

  // Use custom colors from chartConfig if available, otherwise use default colors
  const getColorForKey = useCallback(
    (key: string, index: number): string => {
      if (chartConfig.colors?.[key]) {
        return chartConfig.colors[key];
      }
      return defaultColors[index % defaultColors.length];
    },
    [chartConfig.colors, defaultColors],
  );

  const renderChart = () => {
    if (!processedChartData || !chartConfig) return <div>No chart data</div>;

    const showGrid = chartConfig.showGrid ?? true;
    const showXAxis = chartConfig.showXAxis ?? true;
    const showYAxis = chartConfig.showYAxis ?? true;
    const showDots = chartConfig.showDots ?? true;
    const showLine = chartConfig.showLine ?? true;
    const showTooltip = chartConfig.showTooltip ?? true;
    const lineSize = chartConfig.lineSize ?? 2;
    const labelYAngle = chartConfig.labelYAngle ?? -90;
    const suffixLabelY = chartConfig.suffixLabelY ?? "";

    switch (chartConfig.type) {
      case "line": {
        if (!lineChartState) {
          return null;
        }
        const formattedYAxisLabel = (() => {
          const base = toTitleCase(lineChartState.yAxisKey ?? "");
          return suffixLabelY ? `${base} (${suffixLabelY})` : base;
        })();
        return (
          <LineChart data={lineChartState.data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={chartConfig.xKey} hide={!showXAxis}>
              {showXAxis && (
                <Label
                  value={toTitleCase(
                    lineChartState.useTransformedData
                      ? lineChartState.xAxisField
                      : chartConfig.xKey,
                  )}
                  offset={0}
                  position="insideBottom"
                />
              )}
            </XAxis>
            <YAxis hide={!showYAxis} unit={suffixLabelY || undefined}>
              {showYAxis && (
                <Label
                  value={formattedYAxisLabel}
                  angle={labelYAngle}
                  position="insideLeft"
                />
              )}
            </YAxis>
            {showTooltip && <ChartTooltip content={<ChartTooltipContent />} />}
            {chartConfig.legend && (
              <ChartLegend content={<ChartLegendContent />} />
            )}
            {lineChartState.lineKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={getColorForKey(key, index)}
                strokeWidth={showLine ? lineSize : 0}
                dot={showDots}
                activeDot={showDots}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        );
      }
      case "area":
        return (
          <AreaChart data={processedChartData}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={chartConfig.xKey} hide={!showXAxis} />
            <YAxis hide={!showYAxis} unit={suffixLabelY || undefined}>
              {showYAxis && (
                <Label
                  value={(() => {
                    const base = toTitleCase(resolvedYKeys[0] ?? "");
                    return suffixLabelY ? `${base} (${suffixLabelY})` : base;
                  })()}
                  angle={labelYAngle}
                  position="insideLeft"
                />
              )}
            </YAxis>
            {showTooltip && <ChartTooltip content={<ChartTooltipContent />} />}
            {chartConfig.legend && (
              <ChartLegend content={<ChartLegendContent />} />
            )}
            {resolvedYKeys.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                fill={getColorForKey(key, index)}
                stroke={getColorForKey(key, index)}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        );
      case "bar":
        return (
          <BarChart data={processedChartData}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={chartConfig.xKey} hide={!showXAxis}>
              {showXAxis && (
                <Label
                  value={toTitleCase(chartConfig.xKey)}
                  offset={0}
                  position="insideBottom"
                />
              )}
            </XAxis>
            <YAxis hide={!showYAxis} unit={suffixLabelY || undefined}>
              {showYAxis && (
                <Label
                  value={(() => {
                    const base = toTitleCase(resolvedYKeys[0] ?? "");
                    return suffixLabelY ? `${base} (${suffixLabelY})` : base;
                  })()}
                  angle={labelYAngle}
                  position="insideLeft"
                />
              )}
            </YAxis>
            {showTooltip && <ChartTooltip content={<ChartTooltipContent />} />}
            {chartConfig.legend && (
              <ChartLegend content={<ChartLegendContent />} />
            )}
            {resolvedYKeys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                fill={getColorForKey(key, index)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        );
      case "pie":
        return (
          <PieChart>
            <Pie
              data={processedChartData}
              dataKey={resolvedYKeys[0]}
              nameKey={chartConfig.xKey}
              cx="50%"
              cy="50%"
              outerRadius={120}
              isAnimationActive={false}
            >
              {processedChartData.map((entry, index) => (
                <Cell
                  // biome-ignore lint/suspicious/noArrayIndexKey: we need to use the index as a key
                  key={`cell-${index}`}
                  fill={getColorForKey(String(entry[chartConfig.xKey]), index)}
                />
              ))}
            </Pie>
            {showTooltip && <ChartTooltip content={<ChartTooltipContent />} />}
            {chartConfig.legend && (
              <ChartLegend
                content={
                  <ChartLegendContent className="translate-y-6 flex-wrap gap-2 *:basis-1/4 *:justify-center" />
                }
              />
            )}
          </PieChart>
        );
      default:
        return <div>Unsupported chart type: {chartConfig.type}</div>;
    }
  };

  const hasYData = resolvedYKeys.length > 0;

  return (
    <div
      className={cn(
        "w-full flex flex-col justify-center items-stretch",
        className,
      )}
    >
      {showMetadata && (
        <h2 className="text-lg font-bold mb-2">{chartConfig.title}</h2>
      )}
      {chartConfig && processedChartData.length > 0 && hasYData && (
        <ChartContainer
          config={chartContainerConfig}
          className="w-full h-[320px] sm:h-[380px] lg:h-[420px]"
        >
          {renderChart()}
        </ChartContainer>
      )}
      {showMetadata && (chartConfig.description || chartConfig.takeaway) && (
        <HoverCard>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="mt-4 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Chart information"
            >
              <InfoIcon className="h-5 w-5" />
            </button>
          </HoverCardTrigger>
          <HoverCardContent className="w-80">
            {chartConfig.description && (
              <p className="text-sm mb-2">{chartConfig.description}</p>
            )}
            {chartConfig.takeaway && (
              <p className="text-sm text-muted-foreground">
                {chartConfig.takeaway}
              </p>
            )}
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  );
}
