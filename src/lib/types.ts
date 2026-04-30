import { z } from "zod";

export const explanationSchema = z.object({
  section: z.string(),
  explanation: z.string(),
});

export type QueryExplanation = z.infer<typeof explanationSchema>;
export type Result = Record<string, string | number | boolean | Date>;
export type VisualType = "chart" | "table" | "card";
export const configSchema = z
  .object({
    visualType: z
      .enum(["chart", "table", "card"])
      .describe("Type of visualization"),
    description: z
      .string()
      .describe(
        "Describe the chart. What is it showing? What is interesting about the way the data is displayed?",
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
        "Key(s) for y-axis values this is typically the quantitative column",
      ),
    multipleLines: z
      .boolean()
      .describe(
        "For line charts only: whether the chart is comparing groups of data.",
      )
      .optional()
      .default(false),
    measurementColumn: z
      .string()
      .nullish()
      .describe(
        "For line charts only: key for quantitative y-axis column to measure against (eg. values, counts etc.)",
      )
      .optional(),
    categoryColumn: z
      .string()
      .nullish()
      .describe("Column to group lines by (e.g., Country)")
      .optional(),
    lineCategories: z
      .array(z.string())
      .nullish()
      .describe(
        "For line charts only: Categories used to compare different lines or data series. Each category represents a distinct line in the chart.",
      )
      .optional(),
    colors: z
      .record(
        z.string().describe("Any of the yKeys"),
        z.string().describe("Color value in CSS format (e.g., hex, rgb, hsl)"),
      )
      .describe("Mapping of data keys to color values for chart elements")
      .optional(),
    legend: z.boolean().describe("Whether to show legend").default(false),
    countMode: z
      .boolean()
      .describe(
        "For bar charts: whether to count occurrences of xKey values instead of using yKeys",
      )
      .optional()
      .default(false),
    showGrid: z
      .boolean()
      .describe("Whether to display gridlines on supported charts")
      .optional(),
    showXAxis: z
      .boolean()
      .describe("Whether to display the X axis on supported charts")
      .optional(),
    showYAxis: z
      .boolean()
      .describe("Whether to display the Y axis on supported charts")
      .optional(),
    showDots: z
      .boolean()
      .describe("For line charts: whether to display data point dots")
      .optional(),
    showLine: z
      .boolean()
      .describe("For line charts: whether to display the connecting line")
      .optional(),
    showTooltip: z
      .boolean()
      .describe("Whether to display the hover tooltip")
      .optional(),
    lineSize: z
      .number()
      .min(1)
      .max(10)
      .describe("Stroke width for line charts in pixels")
      .optional(),
    suffixLabelY: z
      .string()
      .describe("Suffix applied to the Y axis label and units")
      .optional(),
    labelYAngle: z
      .number()
      .min(-90)
      .max(90)
      .describe("Rotation angle for the Y axis label")
      .optional(),
    referenceLineLabel: z
      .string()
      .nullish()
      .describe("Label to display alongside a reference line if rendered")
      .optional(),
    colSpan: z
      .number()
      .int()
      .min(1)
      .max(6)
      .describe("Number of grid columns this chart should span")
      .optional(),
  })
  .describe("Chart configuration object");

export type Config = z.infer<typeof configSchema>;

export const normalizeChartConfig = (config: Config): Config => ({
  ...config,
  measurementColumn: config.measurementColumn ?? undefined,
  categoryColumn: config.categoryColumn ?? undefined,
  lineCategories: config.lineCategories ?? undefined,
  referenceLineLabel: config.referenceLineLabel ?? undefined,
});

export const cardConfigSchema = z
  .object({
    configType: z
      .literal("card")
      .describe("Discriminator field for card config")
      .default("card"),
    measureId: z
      .string()
      .describe("Optional reusable measure backing this metric card")
      .optional(),
    title: z
      .string()
      .describe("Title for the card displaying the single value"),
    description: z
      .string()
      .describe(
        "Description of what the card value represents and what it shows",
      ),
    takeaway: z
      .string()
      .describe("Main insight or takeaway from this single value")
      .optional(),
  })
  .describe("Card configuration object for single-value results");

export type CardConfig = z.infer<typeof cardConfigSchema>;

export const tableConfigSchema = z
  .object({
    configType: z
      .literal("table")
      .describe("Discriminator field for table config")
      .default("table"),
    title: z.string().describe("Title for the table"),
    description: z
      .string()
      .describe("Description of what the table shows and its purpose"),
    takeaway: z
      .string()
      .describe("Main insight or takeaway from the data in the table")
      .optional(),
    sortColumn: z.string().describe("Column to sort by default").optional(),
    sortDirection: z
      .enum(["asc", "desc"])
      .describe("Default sort direction")
      .optional(),
    colSpan: z
      .number()
      .int()
      .min(1)
      .max(6)
      .describe("Number of grid columns this table should span")
      .optional(),
  })
  .describe("Table configuration object for tabular data display");

export type TableConfig = z.infer<typeof tableConfigSchema>;

export const textConfigSchema = z
  .object({
    configType: z
      .literal("text")
      .describe("Discriminator field for text card")
      .default("text"),
    title: z.string().optional(),
    content: z.string().describe("Markdown content to display"),
  })
  .describe("Text card configuration for markdown content");

export type TextConfig = z.infer<typeof textConfigSchema>;

// Data model types
export type RelationshipType = "one-to-one" | "one-to-many" | "many-to-many";

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
