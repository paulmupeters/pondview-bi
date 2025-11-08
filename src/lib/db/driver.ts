export type TableRow = Record<string, string | number | boolean | Date>;

export type TablesListItem = {
  table_schema: string;
  table_name: string;
  table_type: string;
};

export interface DbAdapter {
  runSqlNormalized(dbIdentifier: string, sql: string): Promise<TableRow[]>;
  getSchemas(dbIdentifier: string): Promise<string[]>;
  getTablesForSchema(
    dbIdentifier: string,
    schema: string,
    limit?: number,
  ): Promise<string[]>;
  getTables(dbIdentifier: string): Promise<TablesListItem[]>;
}


