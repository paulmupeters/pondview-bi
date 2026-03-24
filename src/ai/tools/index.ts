import { executeSqlTool } from "./execute-sql-tool";
import { getTableSchemaTool } from "./get-table-schema-tool";
import { listTablesTool } from "./list-tables-tool";
import { readSkillsMdTool } from "./read-skills-md-tool";
import { runPreviewTool } from "./run-preview-tool";

export const tools = {
  execute_sql: executeSqlTool,
  get_table_schema: getTableSchemaTool,
  list_tables: listTablesTool,
  run_preview: runPreviewTool,
  read_skills_md: readSkillsMdTool,
};
