import { generateBarChartTool } from "./bar-chart-tool";
import { analyzeBurnRateTool } from "./burnrate-tool";
import { executeSqlTool } from "./execute-sql-tool";

// Export all tools
export const tools = {
  analyzeBurnRate: analyzeBurnRateTool,
  generateBarChart: generateBarChartTool,
  executeSql: executeSqlTool,
};