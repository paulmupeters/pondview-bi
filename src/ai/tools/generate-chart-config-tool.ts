import { generateObject } from "ai";
import { VISUALIZATION_MODEL } from "@/ai/models";
import { configSchema, normalizeChartConfig, type Result } from "@/lib/types";

export const generateChartConfig = async (
  results: Result[],
  userQuery: string
) => {
  "use server";

  const { object: config } = await generateObject({
    model: VISUALIZATION_MODEL,
    system: "You are a data visualization expert.",
    prompt: `Given the following data from a SQL query result, generate the chart config that best visualises the data and answers the users query.
      For multiple groups use multi-lines.

      IMPORTANT: 
      - yKeys must contain the column name(s) with numeric values to plot on the Y-axis. Never leave yKeys empty!
      - countMode should ONLY be true when you have RAW non-aggregated data and want to count occurrences.
      - If the data already contains aggregated values (like columns named "count", "total", "sum", "avg", etc.), set countMode to FALSE and put those column names in yKeys.
      - Look at the actual column names in the data and use them exactly as they appear.

      Here is an example complete config for pre-aggregated data:
      {
        "visualType": "chart",
        "title": "Yearly Overview",
        "description": "A bar chart showing the count distribution over years",
        "type": "bar",
        "xKey": "year",
        "yKeys": ["count"],
        "countMode": false,
        "legend": false
      }

      Here is an example for raw non-aggregated data where you want to count occurrences:
      {
        "visualType": "chart",
        "title": "Category Distribution",
        "description": "Counting occurrences of specific categories",
        "type": "bar",
        "xKey": "category",
        "yKeys": [], 
        "countMode": true, 
        "legend": false
      }

      User Query:
      ${userQuery}

      Data:
      ${JSON.stringify(results, null, 2)}`,
    schema: configSchema,
  });

  const normalizedConfig = normalizeChartConfig(config);
  const colors: Record<string, string> = {};
  
  const updatedConfig = { ...normalizedConfig, colors };
  return { config: updatedConfig };
};