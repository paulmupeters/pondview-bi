import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { resolveCredential } from "@/lib/credentials";
import {
  type AttachmentPlan,
  buildAttachmentPlan,
  buildDetachStatement,
} from "@/lib/duckdb/duckdb-attachments";
import {
  getDuckDbInstance,
  getMaterializationDbPath,
} from "@/lib/duckdb/duckdb-node";
import { extractTableNamesFromSql } from "@/lib/filters/parse-tables";
import { canonicalTable, loadJoinDefs } from "@/lib/joins/loader";
import { listChartsByDashboard } from "@/lib/repositories/dashboard";
import type { SourceEntry } from "@/lib/sources/source-config";

const DEFAULT_MODELS_DIR = join(process.cwd(), "semantic-layer", "models");
const DEFAULT_TARGET_SCHEMA = "mat";
const TRACKING_TABLE = `"main"."table_materialization_runs"`;

type YamlSourcesFile = {
  version?: number;
  sources?: SourceEntry[];
};

export type TableMaterializationStatus =
  | "skipped"
  | "materialized"
  | "missing_source"
  | "error";

export interface TableMaterializationResult {
  tableName: string;
  sourceName?: string;
  targetTable?: string;
  status: TableMaterializationStatus;
  sourceHash?: string;
  rowCount?: number;
  reason?: string;
}

export interface TableMaterializationRecord {
  tableName: string;
  sourceName: string;
  sourceHash: string;
  targetTable: string;
  rowCount?: number;
  updatedAt?: string;
}

export interface TableMaterializationOptions {
  modelsDir?: string;
  targetSchema?: string;
  tableNames?: string[];
}

export async function materializeTables(
  options: TableMaterializationOptions = {},
): Promise<TableMaterializationResult[]> {
  const modelsDir = options.modelsDir ?? DEFAULT_MODELS_DIR;
  const targetSchema = options.targetSchema ?? DEFAULT_TARGET_SCHEMA;
  const sources = await loadSources(modelsDir);
  const sourceByName = buildSourceLookup(sources);

  await ensureTrackingTable();

  const requestedTables =
    options.tableNames && options.tableNames.length > 0
      ? Array.from(
          new Set(options.tableNames.map(canonicalTable).filter(Boolean)),
        )
      : Array.from(sourceByName.keys());

  const results: TableMaterializationResult[] = [];
  for (const tableName of requestedTables) {
    const source = sourceByName.get(tableName);
    if (!source) {
      results.push({
        tableName,
        status: "missing_source",
        reason: `No source mapping found for table "${tableName}"`,
      });
      continue;
    }

    try {
      const result = await materializeSingleTable(source, targetSchema);
      results.push(result);
    } catch (error) {
      results.push({
        tableName,
        sourceName: source.name,
        status: "error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

export async function materializeTablesForDashboard(
  dashboardId: string,
  options: Omit<TableMaterializationOptions, "tableNames"> = {},
): Promise<TableMaterializationResult[]> {
  const charts = await listChartsByDashboard(dashboardId);
  const tableNames = new Set<string>();

  for (const chart of charts) {
    for (const table of extractTableNamesFromSql(chart.sql)) {
      tableNames.add(table);
    }
  }

  // Add directly connected join-neighbor tables to reduce first-filter latency.
  const joins = await loadJoinDefs();
  for (const joinDef of joins) {
    const left = canonicalTable(joinDef.leftTable);
    const right = canonicalTable(joinDef.rightTable);
    if (!left || !right) {
      continue;
    }
    if (tableNames.has(left)) {
      tableNames.add(right);
    }
    if (tableNames.has(right)) {
      tableNames.add(left);
    }
  }

  return materializeTables({
    ...options,
    tableNames: Array.from(tableNames),
  });
}

export async function listTableMaterializations(): Promise<
  TableMaterializationRecord[]
> {
  await ensureTrackingTable();
  const rows = await runQuery(
    `SELECT table_name, source_name, source_hash, target_table, row_count, updated_at FROM ${TRACKING_TABLE};`,
  );
  return rows.map((row) => ({
    tableName: String(row.table_name),
    sourceName: String(row.source_name),
    sourceHash: String(row.source_hash),
    targetTable: String(row.target_table),
    rowCount:
      row.row_count === null || row.row_count === undefined
        ? undefined
        : Number(row.row_count),
    updatedAt:
      row.updated_at === null || row.updated_at === undefined
        ? undefined
        : String(row.updated_at),
  }));
}

function buildSourceLookup(sources: SourceEntry[]): Map<string, SourceEntry> {
  const map = new Map<string, SourceEntry>();
  for (const source of sources) {
    map.set(canonicalTable(source.name), source);
    const tableName = source.table.split(".").pop();
    if (tableName) {
      map.set(canonicalTable(tableName), source);
    }
    map.set(canonicalTable(source.table), source);
  }
  return map;
}

async function materializeSingleTable(
  source: SourceEntry,
  targetSchema: string,
): Promise<TableMaterializationResult> {
  const tableName = canonicalTable(source.name);
  const sourceHash = computeSourceHash(source);
  const existingHash = await fetchExistingHash(tableName);
  const targetTable = `${targetSchema}.${sanitizeIdentifier(tableName)}`;
  const targetQualified = `${quoteIdent(targetSchema)}.${quoteIdent(
    sanitizeIdentifier(tableName),
  )}`;

  // Resolve connectionId → identifier before building the attachment plan
  let resolvedConnection = source.connection;
  if (source.connection?.connectionId && !source.connection.identifier) {
    const credential = resolveCredential(source.connection.connectionId);
    if (!credential) {
      return {
        tableName,
        sourceName: source.name,
        status: "error",
        reason: `No credential found for connectionId "${source.connection.connectionId}". Check .env.local.`,
      };
    }
    resolvedConnection = { ...source.connection, identifier: credential };
  }

  const attachmentPlan = resolvedConnection
    ? buildAttachmentPlan(resolvedConnection)
    : undefined;
  const sourceReference = buildSourceReference(source, attachmentPlan);

  if (existingHash === sourceHash) {
    return {
      tableName,
      sourceName: source.name,
      targetTable,
      status: "skipped",
      sourceHash,
    };
  }

  const statements: string[] = [
    `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(targetSchema)};`,
  ];
  if (attachmentPlan) {
    statements.push(
      buildDetachStatement(attachmentPlan.alias, { ifExists: true }),
    );
    statements.push(...attachmentPlan.statements);
  }

  statements.push(
    `CREATE OR REPLACE TABLE ${targetQualified} AS SELECT * FROM ${sourceReference};`,
  );
  statements.push(
    `INSERT OR REPLACE INTO ${TRACKING_TABLE} (table_name, source_name, source_hash, target_table, row_count, updated_at)\n` +
      `SELECT '${escapeLiteral(tableName)}', '${escapeLiteral(
        source.name,
      )}', '${sourceHash}', '${escapeLiteral(targetTable)}', COUNT(*), CURRENT_TIMESTAMP\n` +
      `FROM ${targetQualified};`,
  );
  if (attachmentPlan) {
    statements.push(
      buildDetachStatement(attachmentPlan.alias, { ifExists: true }),
    );
  }

  await executeStatements(statements);
  return {
    tableName,
    sourceName: source.name,
    targetTable,
    status: "materialized",
    sourceHash,
  };
}

function computeSourceHash(source: SourceEntry): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(source));
  return hash.digest("hex");
}

async function fetchExistingHash(
  tableName: string,
): Promise<string | undefined> {
  const rows = await runQuery(
    `SELECT source_hash FROM ${TRACKING_TABLE} WHERE table_name = '${escapeLiteral(
      tableName,
    )}' LIMIT 1;`,
  );
  const hash = rows[0]?.source_hash;
  return typeof hash === "string" ? hash : undefined;
}

function buildSourceReference(
  source: SourceEntry,
  attachmentPlan?: AttachmentPlan,
): string {
  const tableParts = source.table
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  if (tableParts.length === 0) {
    throw new Error(`Invalid source.table value for source "${source.name}"`);
  }
  const quotedParts = tableParts.map(quoteIdent).join(".");
  if (attachmentPlan?.alias) {
    return `${quoteIdent(attachmentPlan.alias)}.${quotedParts}`;
  }
  if (source.connection?.alias) {
    return `${quoteIdent(source.connection.alias)}.${quotedParts}`;
  }
  return quotedParts;
}

async function loadSources(modelsDir: string): Promise<SourceEntry[]> {
  const filePath = join(modelsDir, "sources.yml");
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = yaml.load(content) as YamlSourcesFile;
    return parsed?.sources ?? [];
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

async function ensureTrackingTable(): Promise<void> {
  await runQuery(
    `
CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
  table_name TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  target_table TEXT NOT NULL,
  row_count BIGINT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);`.trim(),
  );
}

async function executeStatements(statements: Iterable<string>): Promise<void> {
  const sqlStatements = Array.from(statements)
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (sqlStatements.length === 0) {
    return;
  }
  const dbPath = getMaterializationDbPath();
  const instance = await getDuckDbInstance(dbPath);
  const connection = await instance.connect();
  for (const statement of sqlStatements) {
    await connection.runAndReadAll(statement);
  }
}

async function runQuery(sql: string): Promise<Record<string, unknown>[]> {
  const dbPath = getMaterializationDbPath();
  const instance = await getDuckDbInstance(dbPath);
  const connection = await instance.connect();
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson();
}

function sanitizeIdentifier(value: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9_]/g, "_");
  if (!normalized) {
    return "table_data";
  }
  if (/^[0-9]/.test(normalized)) {
    return `_${normalized}`;
  }
  return normalized.replace(/_+/g, "_");
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
