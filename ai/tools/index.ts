import { executeSqlTool } from "./execute-sql-tool";
import { getTableSchemaTool } from "./get-table-schema-tool";

// Export all tools
export const tools = {
  executeSql: executeSqlTool,
  getTableSchema: getTableSchemaTool,
};
