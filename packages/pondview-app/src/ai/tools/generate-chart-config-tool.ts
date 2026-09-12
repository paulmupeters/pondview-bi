import { generateText, Output } from "ai";
import { resolveVisualizationGatewayModel } from "@/ai/gateway-model";
import { VISUALIZATION_MODEL } from "@/ai/models";
import { configSchema, normalizeChartConfig, type Result } from "@/lib/types";
import { repairChartAxisMapping } from "./deterministic-chart-config";

export const generateChartConfig = async (
  results: Result[],
  userQuery: string,
) => {
  const { output: config } = await generateText({
    model: resolveVisualizationGatewayModel(VISUALIZATION_MODEL),
    system: `You are a data visualization expert. Map chart axes semantically:
- xKey is the independent grouping dimension: category, date, time period, or numeric date part such as year.
- yKeys are dependent numeric measures: counts, sums, averages, totals, and other aggregated values.
- A numeric column is not automatically a measure. For example, year is a valid X-axis dimension and unicorn_count is the Y-axis measure.
- Never put an aggregate/count column on the X-axis when the result also contains a grouping dimension.
Return a chart config that preserves this mapping exactly.`,
    prompt: `Given the following data from a SQL query result, generate the chart config that best visualises the data and answers the users query.
      For multiple groups use multi-lines.

      IMPORTANT: 
      - xKey must be the category/grouping/time column, even when that column is numeric (for example, year from EXTRACT(YEAR ...)).
      - yKeys must contain the numeric measure or aggregate column(s) to plot on the Y-axis. Never put a count, sum, total, average, or other aggregate in xKey when a grouping column exists.
      - Never leave yKeys empty unless countMode is true for raw, non-aggregated data.
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
        "yKeys": ["unicorn_count"],
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
    output: Output.object({
      schema: configSchema,
    }),
  });

  const normalizedConfig = repairChartAxisMapping(
    normalizeChartConfig(config),
    results,
  );
  const colors: Record<string, string> = {};

  const updatedConfig = { ...normalizedConfig, colors };
  return { config: updatedConfig };
};
