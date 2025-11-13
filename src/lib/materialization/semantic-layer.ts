import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { loadModelsFromDirectory } from "@/../semantic-layer/model-loader";
import type { SourceEntry } from "@/../semantic-layer/source-updater";
import type { DataModel, ExploreDef } from "@/../semantic-layer/types";
import {
  type AttachmentPlan,
  buildAttachmentPlan,
  buildDetachStatement,
} from "@/lib/duckdb/duckdb-attachments";
import type {
  HttpDuckDbConfig,
  ResolvedHttpDuckDbConfig,
} from "@/lib/duckdb/duckdb-http";
import {
  executeDuckDbHttpQuery,
  resolveHttpDuckDbConfig,
} from "@/lib/duckdb/duckdb-http";

const DEFAULT_MODELS_DIR = join(process.cwd(), "semantic-layer", "models");
const DEFAULT_TARGET_SCHEMA = "semantic_materialized";
const TRACKING_TABLE_SCHEMA = "main";
const TRACKING_TABLE_NAME = "semantic_materialization_runs";

type YamlSourcesFile = {
  version: number;
  sources: SourceEntry[];
};

export type MaterializationStatus = "skipped" | "materialized" | "error";

export interface MaterializationResult {
  explore: string;
  status: MaterializationStatus;
  targetTable?: string;
  modelHash?: string;
  rowCount?: number;
  reason?: string;
}

export interface SemanticMaterializerOptions {
  modelsDir?: string;
  exploreName?: string;
  duckdb?: HttpDuckDbConfig;
  targetSchema?: string;
}

export interface MaterializationRecord {
  exploreName: string;
  targetTable: string;
  modelHash: string;
  rowCount?: number;
  updatedAt?: string;
}

export async function materializeSemanticLayer(
  options: SemanticMaterializerOptions = {},
): Promise<MaterializationResult[]> {
  const modelsDir = options.modelsDir ?? DEFAULT_MODELS_DIR;
  const targetSchema = options.targetSchema ?? DEFAULT_TARGET_SCHEMA;
  const dataModel = loadModelsFromDirectory(modelsDir);
  const sources = await loadSources(modelsDir);

  const config = resolveHttpDuckDbConfig(options.duckdb);
  await ensureTrackingTable(config);

  const explores = pickExplores(dataModel.explores, options.exploreName);
  if (explores.length === 0) {
    return [];
  }

  const results: MaterializationResult[] = [];

  for (const explore of explores) {
    try {
      const result = await materializeExplore({
        explore,
        sources,
        config,
        modelsDir,
        targetSchema,
      });
      results.push(result);
    } catch (error) {
      results.push({
        explore: explore.name,
        status: "error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

export async function listMaterializations(
  options: { duckdb?: HttpDuckDbConfig } = {},
): Promise<MaterializationRecord[]> {
  const config = resolveHttpDuckDbConfig(options.duckdb);
  await ensureTrackingTable(config);

  const rows = await executeDuckDbHttpQuery(
    config,
    `SELECT explore_name, target_table, model_hash, row_count, updated_at FROM ${trackingTableSql()};`,
  );

  return rows.map((row) => ({
    exploreName: String(row.explore_name),
    targetTable: String(row.target_table),
    modelHash: String(row.model_hash),
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

export function applyMaterializationsToDataModel(
  dataModel: DataModel,
  records: Iterable<MaterializationRecord>,
): DataModel {
  const map = new Map<string, string>();
  for (const record of records) {
    if (record.targetTable) {
      map.set(record.exploreName, record.targetTable);
    }
  }
  if (map.size === 0) {
    return dataModel;
  }

  return {
    explores: dataModel.explores.map((explore) => {
      const target = map.get(explore.name);
      if (!target) {
        return explore;
      }
      return {
        ...explore,
        base: target,
      };
    }),
  };
}

async function materializeExplore(ctx: {
  explore: ExploreDef;
  sources: SourceEntry[];
  config: ResolvedHttpDuckDbConfig;
  modelsDir: string;
  targetSchema: string;
}): Promise<MaterializationResult> {
  const { explore, sources, config, modelsDir, targetSchema } = ctx;
  const source = sources.find((s) => s.name === explore.base);

  if (!source) {
    return {
      explore: explore.name,
      status: "error",
      reason: `Source "${explore.base}" not found for explore "${explore.name}"`,
    };
  }

  const modelContent = await readModelContent(modelsDir, explore.name);
  const modelHash = computeModelHash(modelContent, source);
  const existingHash = await fetchExistingHash(config, explore.name);
  const target = buildTargetTable(explore.name, targetSchema);
  const attachmentPlan = source.connection
    ? buildAttachmentPlan(source.connection)
    : undefined;

  if (existingHash === modelHash) {
    return {
      explore: explore.name,
      status: "skipped",
      targetTable: target.display,
      modelHash,
    };
  }

  const { reference: sourceReference, alias: attachmentAlias } =
    buildSourceReference(source, attachmentPlan);

  const statements: string[] = [
    `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(targetSchema)};`,
  ];
  const cleanupStatements: string[] = [];

  if (attachmentPlan && attachmentPlan.statements.length > 0) {
    statements.push(
      buildDetachStatement(attachmentPlan.alias, { ifExists: true }),
    );
    statements.push(...attachmentPlan.statements);
    cleanupStatements.push(buildDetachStatement(attachmentPlan.alias));
  }

  statements.push(
    `CREATE OR REPLACE TABLE ${target.qualified} AS SELECT * FROM ${sourceReference};`,
  );
  statements.push(
    `INSERT OR REPLACE INTO ${trackingTableSql()} (explore_name, model_hash, target_table, row_count, updated_at)\n` +
      `SELECT '${escapeLiteral(explore.name)}', '${modelHash}', '${escapeLiteral(
        target.display,
      )}', COUNT(*), CURRENT_TIMESTAMP\n` +
      `FROM ${target.qualified};`,
  );

  try {
    await executeStatements(config, statements);
  } finally {
    if (cleanupStatements.length > 0) {
      try {
        await executeStatements(config, cleanupStatements);
      } catch (cleanupError) {
        console.warn(
          `[Semantic Layer] Failed to detach source for explore "${explore.name}":`,
          cleanupError,
        );
      }
    }
  }

  return {
    explore: explore.name,
    status: "materialized",
    targetTable: target.display,
    modelHash,
  };
}

async function ensureTrackingTable(
  config: ResolvedHttpDuckDbConfig,
): Promise<void> {
  const sql = `
CREATE TABLE IF NOT EXISTS ${trackingTableSql()} (
  explore_name TEXT PRIMARY KEY,
  model_hash TEXT NOT NULL,
  target_table TEXT NOT NULL,
  row_count BIGINT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);`.trim();

  await executeDuckDbHttpQuery(config, sql);
}

async function executeStatements(
  config: ResolvedHttpDuckDbConfig,
  statements: Iterable<string>,
): Promise<void> {
  for (const statement of statements) {
    const sql = statement.trim();
    if (!sql) {
      continue;
    }
    await executeDuckDbHttpQuery(config, sql);
  }
}

function pickExplores(
  explores: ExploreDef[],
  exploreName?: string,
): ExploreDef[] {
  if (!exploreName) {
    return explores;
  }
  return explores.filter((explore) => explore.name === exploreName);
}

async function readModelContent(
  modelsDir: string,
  exploreName: string,
): Promise<string> {
  const candidates = [`${exploreName}.yml`, `${exploreName}.yaml`];
  for (const fileName of candidates) {
    const filePath = join(modelsDir, fileName);
    if (await fileExists(filePath)) {
      return fs.readFile(filePath, "utf-8");
    }
  }

  throw new Error(`Model file for explore "${exploreName}" not found`);
}

async function loadSources(modelsDir: string): Promise<SourceEntry[]> {
  const filePath = join(modelsDir, "sources.yml");
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const yamlData = yaml.load(content) as YamlSourcesFile;
    return yamlData?.sources ?? [];
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

function computeModelHash(modelContent: string, source: SourceEntry): string {
  const hash = createHash("sha256");
  hash.update(modelContent);
  hash.update(JSON.stringify(source ?? {}));
  return hash.digest("hex");
}

async function fetchExistingHash(
  config: ResolvedHttpDuckDbConfig,
  exploreName: string,
): Promise<string | undefined> {
  const sql = `SELECT model_hash FROM ${trackingTableSql()} WHERE explore_name = '${escapeLiteral(
    exploreName,
  )}' LIMIT 1;`;
  const rows = await executeDuckDbHttpQuery(config, sql);
  if (rows.length === 0) {
    return undefined;
  }
  const value = rows[0]?.model_hash;
  return typeof value === "string" ? value : undefined;
}

function buildSourceReference(
  source: SourceEntry,
  attachmentPlan?: AttachmentPlan,
): { reference: string; alias?: string } {
  const tableParts = source.table
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (tableParts.length === 0) {
    throw new Error(`Invalid table reference for source "${source.name}"`);
  }

  const quotedParts = tableParts.map(quoteIdent);
  const alias = attachmentPlan?.alias ?? source.connection?.alias;
  if (alias) {
    const reference = `${quoteIdent(alias)}.${quotedParts.join(".")}`;
    return { reference, alias };
  }

  return { reference: quotedParts.join("."), alias: undefined };
}

function buildTargetTable(
  exploreName: string,
  schema: string,
): {
  name: string;
  display: string;
  qualified: string;
} {
  const sanitizedName = sanitizeIdentifier(exploreName);
  const qualified = `${quoteIdent(schema)}.${quoteIdent(sanitizedName)}`;
  return {
    name: sanitizedName,
    display: `${schema}.${sanitizedName}`,
    qualified,
  };
}

function trackingTableSql(): string {
  return `${quoteIdent(TRACKING_TABLE_SCHEMA)}.${quoteIdent(TRACKING_TABLE_NAME)}`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function sanitizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "model";
  }
  let sanitized = trimmed.replace(/[^A-Za-z0-9_]/g, "_");
  if (/^[0-9]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  sanitized = sanitized.replace(/_+/g, "_");
  return sanitized || "model";
}
