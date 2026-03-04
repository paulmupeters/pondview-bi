import { executeSqlToolServer } from "./execute-sql-tool.server";
import { getTableSchemaToolServer } from "./get-table-schema-tool.server";

export const tools = {
  executeSql: executeSqlToolServer,
  getTableSchema: getTableSchemaToolServer,
};
