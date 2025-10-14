import { artifact } from "@ai-sdk-tools/artifacts";
import { z } from "zod";
import { configSchema } from "@/lib/types";

// Define the execute SQL artifact schema
export const ExecuteSqlArtifact = artifact(
  "execute-sql",
  z.object({
    title: z.string(),
    stage: z
      .enum(["loading", "processing", "analyzing", 'visualizing', "complete"])
      .default("loading"),
    progress: z.number().min(0).max(1).default(0),

    // SQL query information
    query: z.string().optional(),
    executionTime: z.number().optional(),
    rowCount: z.number().optional(),

    // Table data
    columns: z
      .array(
        z.object({
          name: z.string(),
          type: z.string().optional(),
        }),
      )
      .default([]),

    rows: z.array(z.record(z.string(), z.any())).default([]),
    visualType: z.enum(["table", "chart"]).default("table"),

    // Chart configuration (only present when visualType is "chart")
    chartConfig: configSchema.optional(),

    // Summary insights
    summary: z
      .object({
        totalRows: z.number(),
        executionTimeMs: z.number().optional(),
        insights: z.array(z.string()),
        queryType: z.string().optional(), // SELECT, INSERT, UPDATE, etc.
      })
      .optional(),
  }),
);
