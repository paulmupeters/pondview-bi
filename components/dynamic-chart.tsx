"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { transformDataForMultiLineChart } from "@/lib/rechart-format";
import type { Config, Result } from "@/lib/types";
import { getChartColors } from "@/lib/utils";

function toTitleCase(str: string): string {
  return str
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function DynamicChart({
  chartData,
  chartConfig,
}: {
  chartData: Result[];
  chartConfig: Config;
}) {
  const renderChart = () => {
    if (!chartData || !chartConfig) return <div>No chart data</div>;

    const parsedChartData = chartData.map((item) => {
      const parsedItem: { [key: string]: any } = {};
      for (const [key, value] of Object.entries(item)) {
        parsedItem[key] = isNaN(Number(value)) ? value : Number(value);
      }
      return parsedItem;
    });

    chartData = parsedChartData;

    const processChartData = (data: Result[], chartType: string) => {
      if (chartType === "bar" || chartType === "pie") {
        if (data.length <= 8) {
          return data;
        }

        const subset = data.slice(0, 20);
        return subset;
      }
      return data;
    };
    console.log(chartConfig, "chartConfig");
    console.log(colors, "colors array");
    chartData = processChartData(chartData, chartConfig.type);
    // console.log({ chartData, chartConfig });

    switch (chartConfig.type) {
      case "bar": {
        let dataToUse = chartData;
        if (chartConfig.countMode) {
          // Aggregate by xKey and count
          const countMap = new Map<string, number>();
          for (const item of chartData) {
            const key = String(item[chartConfig.xKey]);
            countMap.set(key, (countMap.get(key) || 0) + 1);
          }
          dataToUse = Array.from(countMap.entries()).map(([key, count]) => ({
            [chartConfig.xKey]: key,
            count,
          }));
        }
        return (
          <BarChart data={dataToUse}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={chartConfig.xKey}>
              <Label
                value={toTitleCase(chartConfig.xKey)}
                offset={0}
                position="insideBottom"
              />
            </XAxis>
            <YAxis>
              <Label
                value={
                  chartConfig.countMode
                    ? "Count"
                    : toTitleCase(chartConfig.yKeys[0])
                }
                angle={-90}
                position="insideLeft"
              />
            </YAxis>
            <ChartTooltip content={<ChartTooltipContent />} />
            {chartConfig.legend && <Legend />}
            {chartConfig.countMode ? (
              <Bar key="count" dataKey="count" fill={colors[0]} />
            ) : (
              chartConfig.yKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={colors[index % colors.length]}
                />
              ))
            )}
          </BarChart>
        );
      }
      case "line": {
        const { data, xAxisField, lineFields } = transformDataForMultiLineChart(
          chartData,
          chartConfig,
        );
        const useTransformedData =
          chartConfig.multipleLines &&
          chartConfig.measurementColumn &&
          chartConfig.yKeys.includes(chartConfig.measurementColumn);
        // console.log(useTransformedData, "useTransformedData");
        // const useTransformedData = false;
        return (
          <LineChart data={useTransformedData ? data : chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey={useTransformedData ? chartConfig.xKey : chartConfig.xKey}
            >
              <Label
                value={toTitleCase(
                  useTransformedData ? xAxisField : chartConfig.xKey,
                )}
                offset={0}
                position="insideBottom"
              />
            </XAxis>
            <YAxis>
              <Label
                value={toTitleCase(chartConfig.yKeys[0])}
                angle={-90}
                position="insideLeft"
              />
            </YAxis>
            <ChartTooltip content={<ChartTooltipContent />} />
            {chartConfig.legend && <Legend />}
            {useTransformedData
              ? lineFields.map((key, index) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={colors[index % colors.length]}
                  />
                ))
              : chartConfig.yKeys.map((key, index) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={colors[index % colors.length]}
                  />
                ))}
          </LineChart>
        );
      }
      case "area":
        return (
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={chartConfig.xKey} />
            <YAxis />
            <ChartTooltip content={<ChartTooltipContent />} />
            {chartConfig.legend && <Legend />}
            {chartConfig.yKeys.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                fill={colors[index % colors.length]}
                stroke={colors[index % colors.length]}
              />
            ))}
          </AreaChart>
        );
      case "pie":
        return (
          <PieChart>
            <Pie
              data={chartData}
              dataKey={chartConfig.yKeys[0]}
              nameKey={chartConfig.xKey}
              cx="50%"
              cy="50%"
              outerRadius={120}
            >
              {chartData.map((_, index) => (
                <Cell
                  // biome-ignore lint/suspicious/noArrayIndexKey: we need to use the index as a key
                  key={`cell-${index}`}
                  fill={colors[index % colors.length]}
                />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent />} />
            {chartConfig.legend && <Legend />}
          </PieChart>
        );
      default:
        return <div>Unsupported chart type: {chartConfig.type}</div>;
    }
  };
  const colors = getChartColors();

  return (
    <div className="w-full flex flex-col justify-center items-center">
      <h2 className="text-lg font-bold mb-2">{chartConfig.title}</h2>
      {chartConfig && chartData.length > 0 && (
        <ChartContainer
          config={
            chartConfig.countMode
              ? { count: { label: "Count", color: colors[0] } }
              : chartConfig.yKeys.reduce(
                (acc, key, index) => {
                  acc[key] = {
                    label: key,
                    color: colors[index % colors.length],
                  };
                  return acc;
                },
                {} as Record<string, { label: string; color: string }>,
              )
          }
          className="h-[320px] w-full"
        >
          {renderChart()}
        </ChartContainer>
      )}
      <div className="w-full">
        <p className="mt-4 text-sm">{chartConfig.description}</p>
        <p className="mt-4 text-sm">{chartConfig.takeaway}</p>
      </div>
    </div>
  );
}
