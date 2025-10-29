import { z } from "zod";

export const explanationSchema = z.object({
  section: z.string(),
  explanation: z.string(),
});

export type QueryExplanation = z.infer<typeof explanationSchema>;
export type Result = Record<string, string | number | boolean | Date>;
export const configSchema = z
  .object({
    description: z
      .string()
      .describe(
        "Describe the chart. What is it showing? What is interesting about the way the data is displayed?"
      ),
    takeaway: z
      .string()
      .describe("What is the main takeaway from the chart?")
      .optional(),
    type: z.enum(["bar", "line", "area", "pie"]).describe("Type of chart"),
    title: z.string(),
    xKey: z.string().describe("Key for x-axis or category"),
    yKeys: z
      .array(z.string())
      .describe(
        "Key(s) for y-axis values this is typically the quantitative column"
      ),
    multipleLines: z
      .boolean()
      .describe(
        "For line charts only: whether the chart is comparing groups of data."
      )
      .optional()
      .default(false),
    measurementColumn: z
      .string()
      .describe(
        "For line charts only: key for quantitative y-axis column to measure against (eg. values, counts etc.)"
      )
      .optional(),
    categoryColumn: z
      .string()
      .describe("Column to group lines by (e.g., Country)")
      .optional(),
    lineCategories: z
      .array(z.string())
      .describe(
        "For line charts only: Categories used to compare different lines or data series. Each category represents a distinct line in the chart."
      )
      .optional(),
    colors: z
      .record(
        z.string().describe("Any of the yKeys"),
        z.string().describe("Color value in CSS format (e.g., hex, rgb, hsl)")
      )
      .describe("Mapping of data keys to color values for chart elements")
      .optional(),
    legend: z.boolean().describe("Whether to show legend").default(false),
    countMode: z
      .boolean()
      .describe(
        "For bar charts: whether to count occurrences of xKey values instead of using yKeys"
      )
      .optional()
      .default(false),
  })
  .describe("Chart configuration object");

export type Config = z.infer<typeof configSchema>;

// Data model types
export type RelationshipType =
  | "one-to-one"
  | "one-to-many"
  | "many-to-many";

export type TableIdentifier = {
  type: string; // e.g., "duckdb" | "postgres"
  databasePath: string;
  schema?: string;
  table?: string;
};

export type TableRelationship = {
  id: string;
  left: TableIdentifier;
  right: TableIdentifier;
  relationType: RelationshipType;
  join?: string;
  description?: string;
};

export type DataModel = {
  relationships: TableRelationship[];
};
