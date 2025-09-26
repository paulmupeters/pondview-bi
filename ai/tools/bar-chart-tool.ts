import { tool } from "ai";
import { z } from "zod";
import { BarChartArtifact } from "@/ai/artifacts/bar-chart";
import { getCurrentUser } from "@/ai/context";
import { delay } from "@/lib/delay";

export const generateBarChartTool = tool({
  description:
    "Generate interactive bar charts with data visualization and insights. Use this when users want to create bar charts, compare values across categories, or visualize data distributions.",
  inputSchema: z.object({
    title: z.string().describe("Title for the bar chart"),
    data: z
      .array(
        z.object({
          label: z.string().describe("Label for the data point"),
          value: z.number().describe("Numeric value for the data point"),
          color: z.string().optional().describe("Optional color for the bar"),
          category: z
            .string()
            .optional()
            .describe("Optional category grouping"),
        }),
      )
      .describe("Array of data points to visualize"),
    xAxisLabel: z.string().optional().describe("Label for the x-axis"),
    yAxisLabel: z.string().optional().describe("Label for the y-axis"),
  }),
  execute: async ({ title, data, xAxisLabel, yAxisLabel }) => {
    // Get current user context
    const user = getCurrentUser();

    // Step 1: Create with loading state
    const chart = BarChartArtifact.stream({
      stage: "loading",
      title,
      chartData: [],
      progress: 0,
      xAxisLabel,
      yAxisLabel,
    });

    await delay(300);

    // Step 2: Processing - add data points progressively
    chart.progress = 0.1;
    await chart.update({ stage: "processing" });

    for (const [index, dataPoint] of data.entries()) {
      await chart.update({
        chartData: [
          ...chart.data.chartData,
          {
            label: dataPoint.label,
            value: dataPoint.value,
            color: dataPoint.color,
            category: dataPoint.category,
          },
        ],
        progress: 0.1 + ((index + 1) / data.length) * 0.6, // 60% for data processing
      });

      await delay(150); // Simulate processing time
    }

    await delay(200);

    // Step 3: Analyzing - generate insights
    await chart.update({ stage: "analyzing" });
    chart.progress = 0.8;

    const totalValue = chart.data.chartData.reduce(
      (sum, d) => sum + d.value,
      0,
    );
    const sortedData = [...chart.data.chartData].sort(
      (a, b) => b.value - a.value,
    );
    const highestValue = sortedData[0];
    const lowestValue = sortedData[sortedData.length - 1];
    const averageValue = totalValue / chart.data.chartData.length;

    // Generate insights
    const insights: string[] = [];

    if (highestValue && lowestValue) {
      const range = highestValue.value - lowestValue.value;
      const rangePercentage = ((range / averageValue) * 100).toFixed(1);
      insights.push(
        `Range between highest and lowest values is ${rangePercentage}% of the average`,
      );

      if (highestValue.value > averageValue * 2) {
        insights.push(
          `"${highestValue.label}" significantly outperforms others`,
        );
      }

      if (lowestValue.value < averageValue * 0.5) {
        insights.push(`"${lowestValue.label}" is notably below average`);
      }
    }

    // Check for distribution patterns
    const aboveAverage = chart.data.chartData.filter(
      (d) => d.value > averageValue,
    ).length;
    const belowAverage = chart.data.chartData.length - aboveAverage;

    if (aboveAverage === 1) {
      insights.push("Distribution shows one clear leader");
    } else if (belowAverage === 1) {
      insights.push("Distribution shows one clear laggard");
    } else if (aboveAverage < chart.data.chartData.length * 0.3) {
      insights.push(
        "Most values are below average - distribution is top-heavy",
      );
    } else if (aboveAverage > chart.data.chartData.length * 0.7) {
      insights.push(
        "Most values are above average - distribution is bottom-heavy",
      );
    }

    await delay(300);

    // Step 4: Complete with summary
    const finalData = {
      title,
      stage: "complete" as const,
      chartData: chart.data.chartData,
      progress: 1,
      xAxisLabel,
      yAxisLabel,
      summary: {
        totalValue,
        highestValue: {
          label: highestValue.label,
          value: highestValue.value,
        },
        lowestValue: {
          label: lowestValue.label,
          value: lowestValue.value,
        },
        averageValue,
        insights,
      },
    };

    await chart.complete(finalData);

    // Return the artifact data in the format expected by the AI SDK
    return {
      parts: [
        {
          type: `data-artifact-${BarChartArtifact.id}`,
          data: {
            id: chart.id,
            version: 1,
            status: "complete" as const,
            progress: 1,
            payload: finalData,
            createdAt: Date.now(),
          },
        },
      ],
      text: `Generated bar chart "${title}" with ${data.length} data points (User: ${user.fullName} - ${user.id}). Chart shows total value of ${totalValue.toLocaleString()} with "${highestValue.label}" as the highest value (${highestValue.value.toLocaleString()}) and "${lowestValue.label}" as the lowest (${lowestValue.value.toLocaleString()}).`,
    };
  },
});
