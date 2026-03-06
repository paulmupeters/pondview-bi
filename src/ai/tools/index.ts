import { executeSqlTool } from "./execute-sql-tool";
import { getTableSchemaTool } from "./get-table-schema-tool";
import { listTablesTool } from "./list-tables-tool";
import { readSkillsMdTool } from "./read-skills-md-tool";
import { runPreviewTool } from "./run-preview-tool";

export const tools = {
  executeSql: executeSqlTool,
  getTableSchema: getTableSchemaTool,
  listTables: listTablesTool,
  runPreview: runPreviewTool,
  readSkillsMd: readSkillsMdTool,
};
