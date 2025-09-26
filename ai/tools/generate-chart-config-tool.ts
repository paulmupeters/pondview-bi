import { generateObject } from "ai";
import { configSchema, type Result } from "@/lib/types";

export const generateChartConfig = async (
  results: Result[],
  userQuery: string,
) => {
  "use server";

  try {
    const { object: config } = await generateObject({
      model: "openai/gpt-5-nano",
      system: "You are a data visualization expert.",
      prompt: `Given the following data from a SQL query result, generate the chart config that best visualises the data and answers the users query.
      For multiple groups use multi-lines.

      Here is an example complete config:
      export const chartConfig = {
        type: "pie",
        xKey: "month",
        yKeys: ["sales", "profit", "expenses"],
        colors: {
          sales: "#4CAF50",    // Green for sales
          profit: "#2196F3",   // Blue for profit
          expenses: "#F44336"  // Red for expenses
        },
        legend: true
      }

      User Query:
      ${userQuery}

      Data:
      ${JSON.stringify(results, null, 2)}`,
      schema: configSchema,
    });

    // Override with shadcn theme colors
    const colors: Record<string, string> = {};
    config.yKeys.forEach((key, index) => {
      colors[key] = `hsl(var(--chart-${index + 1}))`;
    });

    const updatedConfig = { ...config, colors };
    return { config: updatedConfig };
  } catch (e) {
    console.error(e);
    throw new Error("Failed to generate chart suggestion");
  }
};
