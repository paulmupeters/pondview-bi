import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DuckDBInstance, type DuckDBResultReader } from "@duckdb/node-api";
import type {
  BridgeCatalogResponse,
  BridgeColumn,
  BridgeQueryResponse,
  BridgeSource,
} from "@pondview/bridge-protocol";

interface DuckDbRuntimeOptions {
  readonly?: boolean;
}

export class DuckDbRuntime {
  private connectionPromise: ReturnType<typeof this.createConnection> | null =
    null;
  private readonly sources = new Map<string, BridgeSource>();
  private readonly readonly: boolean;

  constructor(options: DuckDbRuntimeOptions = {}) {
    this.readonly = options.readonly ?? false;
  }

  async version(): Promise<string | null> {
    try {
      const result = await this.query("SELECT version() AS version;");
      const version = result.rows.at(0)?.version;
      return typeof version === "string" ? version : null;
    } catch {
      return null;
    }
  }

  async query(sql: string, limit?: number): Promise<BridgeQueryResponse> {
    if (this.readonly && !isReadOnlySql(sql)) {
      throw new Error("Readonly bridge mode allows only read-only SQL.");
    }

    const reader = await (await this.connection()).runAndReadAll(sql);
    const columns = getColumns(reader);
    const rows = reader.getRowObjectsJson();
    const limitedRows = typeof limit === "number" ? rows.slice(0, limit) : rows;

    return {
      columns,
      rows: limitedRows,
      rowCount: rows.length,
      rowsChanged: reader.rowsChanged,
    };
  }

  async catalog(): Promise<BridgeCatalogResponse> {
    const result = await this.query("SHOW ALL TABLES;");
    return {
      tables: result.rows.map((row) => ({
        catalog: readString(row.database, row.database_name, row.catalog) ?? "",
        schema: readString(row.schema, row.schema_name) ?? "",
        name: readString(row.name, row.table_name) ?? "",
        type: readString(row.type, row.table_type),
      })),
    };
  }

  async attachDuckDb(input: {
    identifier: string;
    alias: string;
    readonly?: boolean;
  }): Promise<BridgeSource> {
    if (this.readonly && input.readonly === false) {
      throw new Error("Readonly bridge mode cannot attach writable sources.");
    }

    const normalizedIdentifier = normalizeDuckDbIdentifier(input.identifier);
    if (isLocalDuckDbIdentifier(normalizedIdentifier)) {
      const absolutePath = resolve(normalizedIdentifier);
      if (!existsSync(absolutePath)) {
        throw new Error(`DuckDB file does not exist: ${absolutePath}`);
      }
    }

    const readonly = input.readonly ?? true;
    const alias = normalizeAlias(input.alias);
    const connection = await this.connection();
    await connection.runAndReadAll(
      `ATTACH ${quoteString(normalizedIdentifier)} AS ${quoteIdentifier(alias)}${readonly ? " (READ_ONLY)" : ""};`,
    );

    const source: BridgeSource = {
      id: randomUUID(),
      alias,
      identifier: normalizedIdentifier,
      readonly,
      type: normalizedIdentifier.startsWith("s3://")
        ? "duckdb_remote"
        : "duckdb",
    };
    this.sources.set(source.id, source);
    return source;
  }

  async detachSource(idOrAlias: string): Promise<void> {
    const source = this.findSource(idOrAlias);
    if (!source) {
      throw new Error(`Source not found: ${idOrAlias}`);
    }

    const connection = await this.connection();
    await connection.runAndReadAll(`DETACH ${quoteIdentifier(source.alias)};`);
    this.sources.delete(source.id);
  }

  listSources(): BridgeSource[] {
    return [...this.sources.values()];
  }

  private findSource(idOrAlias: string): BridgeSource | undefined {
    return [...this.sources.values()].find(
      (source) => source.id === idOrAlias || source.alias === idOrAlias,
    );
  }

  private async connection() {
    this.connectionPromise ??= this.createConnection();
    return this.connectionPromise;
  }

  private async createConnection() {
    const instance = await DuckDBInstance.create(":memory:");
    return instance.connect();
  }
}

function getColumns(reader: DuckDBResultReader): BridgeColumn[] {
  return reader.columnNames().map((name, index) => ({
    name,
    type: JSON.stringify(reader.columnTypeJson(index)),
  }));
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}

function isLocalDuckDbIdentifier(identifier: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:\/\//i.test(identifier);
}

function normalizeDuckDbIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  return isLocalDuckDbIdentifier(trimmed) ? resolve(trimmed) : trimmed;
}

function normalizeAlias(alias: string): string {
  const trimmed = alias.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    throw new Error(
      "Source alias must start with a letter or underscore and contain only letters, numbers, and underscores.",
    );
  }
  return trimmed;
}

function isReadOnlySql(sql: string): boolean {
  const normalized = sql
    .trimStart()
    .replace(/^--.*\n/gm, "")
    .trimStart();
  return /^(select|with|show|describe|desc|explain|summarize|pragma\s+(show|version|database_list|table_info))/i.test(
    normalized,
  );
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
