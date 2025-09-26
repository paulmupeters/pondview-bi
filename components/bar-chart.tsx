"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";
import {
  BarChart3,
  CheckCircle,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChartArtifact } from "@/ai/artifacts/bar-chart";



export function BarChartComponent() {

  // Get data directly from the artifact hook
  const barChartData = useArtifact(BarChartArtifact);


  // Extract data with fallbacks
  const title = barChartData?.data?.title || "Bar Chart";
  const stage = barChartData?.data?.stage || "loading";
  const progress = barChartData?.data?.progress || 0;
  const chartData = barChartData?.data?.chartData || [];
  const summary = barChartData?.data?.summary;
  const xAxisLabel = barChartData?.data?.xAxisLabel;
  const yAxisLabel = barChartData?.data?.yAxisLabel;

  // Format numbers
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  };


  if (!barChartData?.data) return null;

  return (
    <div className="w-full mb-4">
      <div className="w-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-2">
          <h2 className="text-xl font-semibold text-foreground">
            {title}
          </h2>
        </div>

        {/* Progress Bar */}
        {stage !== "complete" && (
          <div className="px-6 py-1 bg-muted">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">
                {stage === "loading" && "Initializing..."}
                {stage === "processing" && "Processing data..."}
                {stage === "analyzing" && "Analyzing data..."}
              </span>
              <span className="text-sm text-muted-foreground">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-2 space-y-4">
            {/* Bar Chart Section */}
            <div className="space-y-4 bg-card rounded-lg p-2 border border-border">
              <h3 className="text-lg font-semibold text-foreground flex items-center">
                <BarChart3 className="h-5 w-5 text-primary mr-2" />
                Chart
              </h3>
              {/* Bar Chart */}
              <div>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        // height={80}
                        interval={0}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickFormatter={formatNumber}
                        label={{ 
                          value: yAxisLabel || 'Value', 
                          angle: -90, 
                          position: 'insideLeft' 
                        }}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatNumber(value), "Value"]}
                        labelStyle={{ color: 'var(--foreground)' }}
                        contentStyle={{
                          backgroundColor: 'var(--popover)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                        }}
                      />
                      <Bar
                        dataKey="value"
                        fill="var(--primary)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {xAxisLabel && (
                  <div className="text-center mt-2">
                    <span className="text-sm text-muted-foreground">
                      {xAxisLabel}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Insights Section */}
            {summary && (
              <div className="space-y-4 bg-card rounded-lg p-2 border border-border">
                <h3 className="text-lg font-semibold text-foreground flex items-center">
                  <TrendingUp className="h-5 w-5 text-green-500 mr-2" />
                  Insights
                </h3>
                {/* Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Total Value
                    </h4>
                    <p className="text-2xl font-bold text-foreground">
                      {formatNumber(summary.totalValue)}
                    </p>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Highest Value
                    </h4>
                    <p className="text-lg font-bold text-foreground">
                      {summary.highestValue.label}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatNumber(summary.highestValue.value)}
                    </p>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Lowest Value
                    </h4>
                    <p className="text-lg font-bold text-foreground">
                      {summary.lowestValue.label}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatNumber(summary.lowestValue.value)}
                    </p>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Average Value
                    </h4>
                    <p className="text-2xl font-bold text-foreground">
                      {formatNumber(summary.averageValue)}
                    </p>
                  </div>
                </div>

                {/* Insights */}
                {summary.insights.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-foreground flex items-center">
                      <TrendingUp className="h-5 w-5 text-green-500 mr-2" />
                      Key Insights
                    </h4>
                    <div className="space-y-2">
                      {summary.insights.map((insight, index) => (
                        <div
// biome-ignore lint/suspicious/noArrayIndexKey: not relevant
                          key={`insight-${index}`}
                          className="bg-accent border border-border p-3 rounded-lg"
                        >
                          <div className="flex items-start space-x-2">
                            <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                            <p className="text-accent-foreground text-sm">
                              {insight}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}