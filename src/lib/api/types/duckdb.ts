export interface HttpDuckDbConfig {
  host?: string;
  port?: number;
  auth?: string;
}

export type DuckdbTableEntry = {
  catalog?: string;
  schema: string;
  name: string;
  type: string;
};

export type DuckdbTablesResponse = {
  tables: DuckdbTableEntry[];
  configured: boolean;
  host?: string;
  port?: number;
  error?: string;
};
