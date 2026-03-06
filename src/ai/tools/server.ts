import { executeSqlToolServer } from "./execute-sql-tool.server";
import { getTableSchemaToolServer } from "./get-table-schema-tool.server";
import { listTablesToolServer } from "./list-tables-tool.server";
import { readSkillsMdToolServer } from "./read-skills-md-tool.server";
import { runPreviewToolServer } from "./run-preview-tool.server";

export const tools = {
  executeSql: executeSqlToolServer,
  getTableSchema: getTableSchemaToolServer,
  listTables: listTablesToolServer,
  runPreview: runPreviewToolServer,
  readSkillsMd: readSkillsMdToolServer,
};
