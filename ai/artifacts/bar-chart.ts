import { artifact } from "@ai-sdk-tools/artifacts";
import { z } from "zod";

// Define the bar chart artifact schema
export const BarChartArtifact = artifact(
  "bar-chart",
  z.object({
    title: z.string(),
    stage: z
      .enum(["loading", "processing", "analyzing", "complete"])
      .default("loading"),
    progress: z.number().min(0).max(1).default(0),

    // Chart configuration
    xAxisLabel: z.string().optional(),
    yAxisLabel: z.string().optional(),
    // TODO: add these back in
    // orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
    // showLegend: z.boolean().default(true),
    // showGrid: z.boolean().default(true),


    // Chart data
    chartData: z
      .array(
        z.object({
          label: z.string(),
          value: z.number(),
          color: z.string().optional(),
          category: z.string().optional(),
        }),
      )
      .default([]),

    // Summary insights
    summary: z
      .object({
        totalValue: z.number(),
        highestValue: z.object({
          label: z.string(),
          value: z.number(),
        }),
        lowestValue: z.object({
          label: z.string(),
          value: z.number(),
        }),
        averageValue: z.number(),
        insights: z.array(z.string()),
      })
      .optional(),
  }),
);