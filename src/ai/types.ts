import type { UIMessage } from "ai";
import { z } from "zod";
import { cardConfigSchema, configSchema } from "@/lib/types";

// Schema for execute-sql data part (replaces ExecuteSqlArtifact)
export const executeSqlDataSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  status: z.enum(["idle", "loading", "streaming", "complete", "error"]),
  progress: z.number().min(0).max(1).optional(),
  error: z.string().optional(),
  payload: z.object({
    title: z.string().optional(),
    stage: z
      .enum(["loading", "processing", "analyzing", "visualizing", "complete"])
      .default("loading"),
    progress: z.number().min(0).max(1).default(0),
    query: z.string().optional(),
    executionTime: z.number().optional(),
    rowCount: z.number().optional(),
    columns: z
      .array(
        z.object({
          name: z.string(),
          type: z.string().optional(),
        }),
      )
      .default([]),
    rows: z.array(z.record(z.string(), z.any())).default([]),
    visualType: z.enum(["table", "chart", "card"]).default("table"),
    chartConfig: configSchema.optional(),
    cardConfig: cardConfigSchema.optional(),
    dbIdentifier: z.string().optional(),
    isSqlExpandedInitial: z.boolean().optional(),
    summary: z
      .object({
        totalRows: z.number(),
        executionTimeMs: z.number().optional(),
        insights: z.array(z.string()),
        queryType: z.string().optional(),
      })
      .optional(),
  }),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ExecuteSqlData = z.infer<typeof executeSqlDataSchema>;

// Define the custom UIMessage type with data parts
export type ChatUIMessage = UIMessage<
  never, // metadata type
  {
    "execute-sql": ExecuteSqlData;
  }
>;
