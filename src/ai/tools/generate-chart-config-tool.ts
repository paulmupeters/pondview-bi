import { generateObject } from "ai";
import { configSchema, normalizeChartConfig, type Result } from "@/lib/types";

export const generateChartConfig = async (
  results: Result[],
  userQuery: string
) => {
  "use server";

  const { object: config } = await generateObject({
    model: "openai/gpt-5-nano",
    system: "You are a data visualization expert.",
    prompt: `Given the following data from a SQL query result, generate the chart config that best visualises the data and answers the users query.
      For multiple groups use multi-lines.

      IMPORTANT: 
      - yKeys must contain the column name(s) with numeric values to plot on the Y-axis. Never leave yKeys empty!
      - countMode should ONLY be true when you have RAW non-aggregated data and want to count occurrences.
      - If the data already contains aggregated values (like columns named "count", "total", "sum", "avg", etc.), set countMode to FALSE and put those column names in yKeys.
      - Look at the actual column names in the data and use them exactly as they appear.

      Here is an example complete config for pre-aggregated data:
      export const chartConfig = {
        type: "bar",
        xKey: "year",
        yKeys: ["count"],  // Use the actual column name from the data
        countMode: false,  // FALSE because data is already aggregated
        legend: false
      }

      Here is an example for raw non-aggregated data where you want to count occurrences:
      export const chartConfig = {
        type: "bar",
        xKey: "category",
        yKeys: [],  // Empty only when countMode is true
        countMode: true,  // TRUE to count occurrences of each category
        legend: false
      }

      User Query:
      ${userQuery}

      Data:
      ${JSON.stringify(results, null, 2)}`,
    schema: configSchema,
  });

  const normalizedConfig = normalizeChartConfig(config);
  const colors: Record<string, string> = {};
  // config.yKeys.forEach((key, index) => {
  //   colors[key] = `hsl(var(--chart-${index + 1}))`;
  // });

  const updatedConfig = { ...normalizedConfig, colors };
  return { config: updatedConfig };
};