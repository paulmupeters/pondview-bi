import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  type DuckDBConnection,
  DuckDBInstance,
  type DuckDBResultReader,
} from "@duckdb/node-api";
import type {
  BridgeCatalogResponse,
  BridgeColumn,
  BridgeQueryResponse,
  BridgeSecretSource,
  BridgeSource,
} from "@pondview/bridge-protocol";

interface DuckDbRuntimeOptions {
  readonly?: boolean;
  databasePath?: string;
  resolveSource?: (id: string) => BridgeSecretSource | undefined;
}

export interface DuckDbRuntimeDatabaseInfo {
  mode: "memory" | "file";
  id: string;
}

export class DuckDbRuntime {
  private connectionPromise: ReturnType<typeof this.createConnection> | null =
    null;
  private connectionHandle: DuckDBConnection | null = null;
  private instance: DuckDBInstance | null = null;
  private readonly sources = new Map<string, BridgeSource>();
  private readonly readonly: boolean;
  private readonly databasePath: string | null;
  private readonly databaseId: string;
  private readonly resolveSource?: (
    id: string,
  ) => BridgeSecretSource | undefined;

  constructor(options: DuckDbRuntimeOptions = {}) {
    this.readonly = options.readonly ?? false;
    this.databasePath = options.databasePath
      ? resolve(options.databasePath.trim())
      : null;
    this.databaseId = this.databasePath
      ? createHash("sha256").update(this.databasePath).digest("hex")
      : "memory";
    this.resolveSource = options.resolveSource;
  }

  databaseInfo(): DuckDbRuntimeDatabaseInfo {
    return {
      mode: this.databasePath ? "file" : "memory",
      id: this.databaseId,
    };
  }

  async close(): Promise<void> {
    const connectionPromise = this.connectionPromise;
    this.connectionPromise = null;
    const connection = connectionPromise
      ? await connectionPromise.catch(() => null)
      : this.connectionHandle;

    if (connection) {
      connection.closeSync();
    }
    this.connectionHandle = null;

    if (this.instance) {
      this.instance.closeSync();
      this.instance = null;
    }
    this.sources.clear();
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

    const reader = await (await this.connection()).runAndReadAll(
      this.resolveSecretAttachmentSql(sql),
    );
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
    identifier?: string;
    connectionId?: string;
    type?: string;
    alias: string;
    readonly?: boolean;
    duckdbExtension?: string;
  }): Promise<BridgeSource> {
    if (this.readonly && input.readonly === false) {
      throw new Error("Readonly bridge mode cannot attach writable sources.");
    }

    const resolvedSource = input.connectionId
      ? this.resolveSource?.(input.connectionId)
      : undefined;
    const sourceIdentifier = resolvedSource?.identifier ?? input.identifier;
    if (!sourceIdentifier) {
      throw new Error("Source identifier is required.");
    }

    const normalizedIdentifier = normalizeDuckDbIdentifier(sourceIdentifier);
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
      identifier: input.connectionId ? undefined : normalizedIdentifier,
      connectionId: input.connectionId,
      readonly,
      type:
        resolvedSource?.type ??
        input.type ??
        (normalizedIdentifier.startsWith("s3://") ? "duckdb_remote" : "duckdb"),
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
    const instance = await DuckDBInstance.create(
      this.databasePath ?? ":memory:",
      this.readonly && this.databasePath ? { access_mode: "READ_ONLY" } : {},
    );
    const connection = await instance.connect();
    this.instance = instance;
    this.connectionHandle = connection;
    return connection;
  }

  private resolveSecretAttachmentSql(sql: string): string {
    if (!this.resolveSource) {
      return sql;
    }

    return sql.replace(
      /(ATTACH\s+)'([^']+)'(\s+AS\s+"?[^";\s]+"?(?:\s*\([^;]*\))?\s*;?)/gi,
      (match, prefix: string, candidate: string, suffix: string) => {
        const source = this.resolveSource?.(candidate);
        if (!source) {
          return match;
        }
        return `${prefix}${quoteString(source.identifier)}${suffix}`;
      },
    );
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
