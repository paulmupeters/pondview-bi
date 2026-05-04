import { executeExploratorySqlTool } from "./execute-exploratory-sql-tool";
import { executeFinalSqlTool } from "./execute-sql-tool";
import { getTableSchemaTool } from "./get-table-schema-tool";
import { listTablesTool } from "./list-tables-tool";
import { runPreviewTool } from "./run-preview-tool";

export const tools = {
  execute_exploratory_sql: executeExploratorySqlTool,
  execute_final_sql: executeFinalSqlTool,
  get_table_schema: getTableSchemaTool,
  list_tables: listTablesTool,
  run_preview: runPreviewTool,
};
