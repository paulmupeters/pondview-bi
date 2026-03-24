import { nanoid } from "nanoid";
import { readConnectedTablesFromStorage } from "@/lib/connected-tables";
import {
  buildAttachmentPlan,
  buildDetachStatement,
  quoteIdentifier,
  quoteString,
} from "@/lib/duckdb/duckdb-attachments";
import { extractTableReferencesFromSql } from "@/lib/filters/parse-tables";
import { readJoinDefsFromStorage } from "@/lib/joins/browser-storage";
import {
  canonicalTable,
  dedupeJoinDefinitions,
  type JoinDefinition,
} from "@/lib/joins/graph";
import { runQuery } from "@/lib/sql/run-query";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  getSqlBackendPreference,
  isRuntimeDefaultDbIdentifier,
  isWasmLocalIdentifier,
  resolveSqlBackend,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import type {
  DashboardStorageStatus,
  WorkspaceChart,
  WorkspaceChartSlicer,
  WorkspaceDashboard,
  WorkspaceDashboardMeasure,
  WorkspaceDashboardSlicer,
} from "@/lib/workspace/workspace-db";
import { detectExternalConnection } from "../duckdb/path";

const METADATA_SCHEMA = "pondview";

type DashboardStorageTargetKind =
  | "wasm-local"
  | "runtime-default"
  | "motherduck";

type DashboardStorageTarget = {
  key: string;
  kind: DashboardStorageTargetKind;
  dbIdentifier: string | null;
  sqlBackend: SqlBackend;
  storageStatus: DashboardStorageStatus;
};

type DashboardRecord = WorkspaceDashboard & {
  columns: number;
  autoFitRows: boolean;
  homeDbIdentifier: string | null;
  homeSqlBackend: SqlBackend | null;
  storageStatus: DashboardStorageStatus | null;
};

type ChartRecord = WorkspaceChart;
type MeasureRecord = WorkspaceDashboardMeasure;

type MaterializedTableRef = {
  tableName: string;
  sourceReference: string;
};

type PreparedSqlPayload = {
  sql: string;
  dbIdentifier: string | null;
  catalogContext: string | null;
  sqlBackend: SqlBackend | null;
  sourceSql: string | null;
  sourceDbIdentifier: string | null;
  sourceCatalogContext: string | null;
  sourceSqlBackend: SqlBackend | null;
};

type DashboardSummary = Pick<
  DashboardRecord,
  | "id"
  | "title"
  | "createdAt"
  | "updatedAt"
  | "columns"
  | "autoFitRows"
  | "homeDbIdentifier"
  | "homeSqlBackend"
  | "storageStatus"
>;

function sqlNullableString(value: string | null | undefined): string {
  return value == null ? "NULL" : quoteString(value);
}

function sqlNullableBackend(value: SqlBackend | null | undefined): string {
  return value == null ? "NULL" : quoteString(value);
}

function sqlBoolean(value: boolean): string {
  return value ? "TRUE" : "FALSE";
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNullableString(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  return normalized.length > 0 ? normalized : null;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }
  return fallback;
}

function normalizeStorageStatus(value: unknown): DashboardStorageStatus {
  return value === "shared" ? "shared" : "best-effort";
}

function normalizeSqlBackend(value: unknown): SqlBackend | null {
  return value === "bridge" ||
    value === "duckdb-http" ||
    value === "duckdb-wasm"
    ? value
    : null;
}

function buildTargetKey(
  kind: DashboardStorageTargetKind,
  backend: SqlBackend,
  dbIdentifier: string | null,
): string {
  return `${kind}:${backend}:${dbIdentifier ?? "__runtime_default__"}`;
}

function createWasmTarget(): DashboardStorageTarget {
  return {
    key: buildTargetKey(
      "wasm-local",
      "duckdb-wasm",
      DEFAULT_WASM_DB_IDENTIFIER,
    ),
    kind: "wasm-local",
    dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
    sqlBackend: "duckdb-wasm",
    storageStatus: "best-effort",
  };
}

function createRuntimeDefaultTarget(
  sqlBackend: Extract<SqlBackend, "bridge" | "duckdb-http">,
): DashboardStorageTarget {
  return {
    key: buildTargetKey("runtime-default", sqlBackend, null),
    kind: "runtime-default",
    dbIdentifier: null,
    sqlBackend,
    storageStatus: "shared",
  };
}

function createMotherDuckTarget(
  dbIdentifier: string,
  sqlBackend: Extract<SqlBackend, "bridge" | "duckdb-http">,
): DashboardStorageTarget {
  return {
    key: buildTargetKey("motherduck", sqlBackend, dbIdentifier),
    kind: "motherduck",
    dbIdentifier,
    sqlBackend,
    storageStatus: "shared",
  };
}

function storedDbIdentifierForTarget(
  target: DashboardStorageTarget,
): string | null {
  if (target.kind === "wasm-local") {
    return DEFAULT_WASM_DB_IDENTIFIER;
  }
  return target.dbIdentifier;
}

function dashboardSnapshotSchema(dashboardId: string): string {
  const suffix = dashboardId.replace(/[^A-Za-z0-9_]/g, "_");
  return `pondview_snapshot_${suffix}`;
}

function buildMaterializationTableRefs(
  sqlStatements: string[],
  joinDefs: JoinDefinition[],
): MaterializedTableRef[] {
  const tableRefByName = new Map<string, string>();

  for (const sql of sqlStatements) {
    const refs = extractTableReferencesFromSql(sql);
    for (const ref of refs) {
      if (!ref.tableName || tableRefByName.has(ref.tableName)) {
        continue;
      }
      tableRefByName.set(ref.tableName, ref.rawReference);
    }
  }

  for (const joinDef of joinDefs) {
    const left = canonicalTable(joinDef.leftTable);
    const right = canonicalTable(joinDef.rightTable);
    if (!left || !right) {
      continue;
    }
    if (tableRefByName.has(left) && !tableRefByName.has(right)) {
      tableRefByName.set(right, quoteIdentifier(right));
    }
    if (tableRefByName.has(right) && !tableRefByName.has(left)) {
      tableRefByName.set(left, quoteIdentifier(left));
    }
  }

  return Array.from(tableRefByName.entries())
    .map(([tableName, sourceReference]) => ({
      tableName,
      sourceReference,
    }))
    .sort((left, right) => left.tableName.localeCompare(right.tableName));
}

function rewriteSqlToSnapshotTables(
  sql: string,
  tableRefs: MaterializedTableRef[],
  snapshotSchema: string,
): string {
  return [...tableRefs]
    .sort(
      (left, right) =>
        right.sourceReference.length - left.sourceReference.length,
    )
    .reduce((currentSql, tableRef) => {
      const snapshotReference = `${quoteIdentifier(snapshotSchema)}.${quoteIdentifier(tableRef.tableName)}`;
      return currentSql.split(tableRef.sourceReference).join(snapshotReference);
    }, sql);
}

function defaultJoinDefs(): JoinDefinition[] {
  return dedupeJoinDefinitions(readJoinDefsFromStorage());
}

export function resolveJoinDefsForNewDashboard(
  joinDefs?: JoinDefinition[],
): JoinDefinition[] {
  return joinDefs === undefined
    ? defaultJoinDefs()
    : dedupeJoinDefinitions(joinDefs);
}

export function resolveDashboardExternalConnection(input: {
  sourceDbIdentifier?: string | null;
  targetSqlBackend: SqlBackend;
}) {
  if (input.targetSqlBackend === "duckdb-wasm") {
    return null;
  }

  const sourceDbIdentifier = toNullableString(input.sourceDbIdentifier);
  return sourceDbIdentifier ? detectExternalConnection(sourceDbIdentifier) : null;
}

export type DashboardSourceMode = "runtime-direct" | "external-materialize";

export async function resolveDashboardSourceMode(input: {
  sourceDbIdentifier?: string | null;
  targetSqlBackend: SqlBackend;
  probeRuntimeExecution?: () => Promise<boolean>;
}): Promise<DashboardSourceMode> {
  const externalConnection = resolveDashboardExternalConnection({
    sourceDbIdentifier: input.sourceDbIdentifier,
    targetSqlBackend: input.targetSqlBackend,
  });
  if (!externalConnection) {
    return "runtime-direct";
  }

  if (input.probeRuntimeExecution) {
    try {
      if (await input.probeRuntimeExecution()) {
        return "runtime-direct";
      }
    } catch {
      // Fall back to external materialization when the runtime probe fails.
    }
  }

  return "external-materialize";
}

export function resolveDefaultStorageTarget(
  preferredBackend?: SqlBackend | null,
): DashboardStorageTarget {
  const backend = resolveSqlBackend({
    backendPreference: preferredBackend ?? getSqlBackendPreference(),
  });

  if (backend === "bridge" || backend === "duckdb-http") {
    return createRuntimeDefaultTarget(backend);
  }

  return createWasmTarget();
}

export function resolveTargetForSource(input: {
  dbIdentifier?: string | null;
  sqlBackend?: SqlBackend | null;
}): DashboardStorageTarget {
  const dbIdentifier = toNullableString(input.dbIdentifier);
  const sourceBackend = input.sqlBackend ?? null;

  if (dbIdentifier?.startsWith("md:")) {
    const backend =
      sourceBackend === "bridge" || sourceBackend === "duckdb-http"
        ? sourceBackend
        : (resolveDefaultStorageTarget().sqlBackend as
            | "bridge"
            | "duckdb-http"
            | "duckdb-wasm");
    if (backend === "bridge" || backend === "duckdb-http") {
      return createMotherDuckTarget(dbIdentifier, backend);
    }
  }

  if (sourceBackend === "bridge" || sourceBackend === "duckdb-http") {
    return createRuntimeDefaultTarget(sourceBackend);
  }

  if (
    sourceBackend === "duckdb-wasm" ||
    (dbIdentifier !== null &&
      (isRuntimeDefaultDbIdentifier(dbIdentifier) ||
        isWasmLocalIdentifier(dbIdentifier)))
  ) {
    return createWasmTarget();
  }

  return resolveDefaultStorageTarget();
}

function discoverReadTargets(): DashboardStorageTarget[] {
  const targets = new Map<string, DashboardStorageTarget>();

  const addTarget = (target: DashboardStorageTarget) => {
    targets.set(target.key, target);
  };

  addTarget(createWasmTarget());

  const defaultTarget = resolveDefaultStorageTarget();
  addTarget(defaultTarget);

  if (
    defaultTarget.sqlBackend === "bridge" ||
    defaultTarget.sqlBackend === "duckdb-http"
  ) {
    const remoteBackend = defaultTarget.sqlBackend;
    const connectedTables = readConnectedTablesFromStorage();
    for (const entry of connectedTables) {
      const identifier = toNullableString(entry.databasePath);
      if (entry.type !== "motherduck" || !identifier?.startsWith("md:")) {
        continue;
      }
      addTarget(createMotherDuckTarget(identifier, remoteBackend));
    }
  }

  return Array.from(targets.values());
}

function normalizeDashboardRow(
  row: Record<string, unknown>,
): DashboardRecord | null {
  const id = toTrimmedString(row.id);
  const title = toTrimmedString(row.title);
  if (!id || !title) {
    return null;
  }

  return {
    id,
    title,
    createdAt: toNumber(row.created_at, Date.now()),
    updatedAt: toNumber(row.updated_at, Date.now()),
    columns: toNumber(row.columns, 3),
    autoFitRows: toBoolean(row.auto_fit_rows, false),
    homeDbIdentifier: toNullableString(row.home_db_identifier),
    homeSqlBackend: normalizeSqlBackend(row.home_sql_backend),
    storageStatus: normalizeStorageStatus(row.storage_status),
  };
}

function normalizeChartRow(row: Record<string, unknown>): ChartRecord | null {
  const id = toTrimmedString(row.id);
  const dashboardId = toTrimmedString(row.dashboard_id);
  const sql = String(row.sql ?? "");
  const chartConfigJson = String(row.chart_config_json ?? "");
  if (!id || !dashboardId || !chartConfigJson) {
    return null;
  }

  return {
    id,
    dashboardId,
    title: toNullableString(row.title),
    description: toNullableString(row.description),
    sql,
    dbIdentifier: toNullableString(row.db_identifier),
    catalogContext: toNullableString(row.catalog_context),
    sqlBackend: normalizeSqlBackend(row.sql_backend),
    chartConfigJson,
    semanticQueryJson: toNullableString(row.semantic_query_json),
    exploreName: toNullableString(row.explore_name),
    position: toNumber(row.position, 0),
    createdAt: toNumber(row.created_at, Date.now()),
    updatedAt: toNumber(row.updated_at, Date.now()),
    sourceSql: toNullableString(row.source_sql),
    sourceDbIdentifier: toNullableString(row.source_db_identifier),
    sourceCatalogContext: toNullableString(row.source_catalog_context),
    sourceSqlBackend: normalizeSqlBackend(row.source_sql_backend),
  };
}

function normalizeMeasureRow(
  row: Record<string, unknown>,
): MeasureRecord | null {
  const id = toTrimmedString(row.id);
  const dashboardId = toTrimmedString(row.dashboard_id);
  const key = toTrimmedString(row.key);
  const label = toTrimmedString(row.label);
  const sql = String(row.sql ?? "");
  if (!id || !dashboardId || !key || !label) {
    return null;
  }

  return {
    id,
    dashboardId,
    key,
    label,
    sql,
    dbIdentifier: toNullableString(row.db_identifier),
    catalogContext: toNullableString(row.catalog_context),
    sqlBackend: normalizeSqlBackend(row.sql_backend),
    createdAt: toNumber(row.created_at, Date.now()),
    updatedAt: toNumber(row.updated_at, Date.now()),
    sourceSql: toNullableString(row.source_sql),
    sourceDbIdentifier: toNullableString(row.source_db_identifier),
    sourceCatalogContext: toNullableString(row.source_catalog_context),
    sourceSqlBackend: normalizeSqlBackend(row.source_sql_backend),
  };
}

function normalizeDashboardSlicerRow(
  row: Record<string, unknown>,
): WorkspaceDashboardSlicer | null {
  const id = toTrimmedString(row.id);
  const dashboardId = toTrimmedString(row.dashboard_id);
  const field = toTrimmedString(row.field);
  if (!id || !dashboardId || !field) {
    return null;
  }

  return {
    id,
    dashboardId,
    field,
    title: toNullableString(row.title),
    limit: toNumber(row.limit, 50),
    position: toNumber(row.position, 0),
    createdAt: toNumber(row.created_at, Date.now()),
    updatedAt: toNumber(row.updated_at, Date.now()),
  };
}

function normalizeChartSlicerRow(
  row: Record<string, unknown>,
): WorkspaceChartSlicer | null {
  const id = toTrimmedString(row.id);
  const chartId = toTrimmedString(row.chart_id);
  const field = toTrimmedString(row.field);
  if (!id || !chartId || !field) {
    return null;
  }

  return {
    id,
    chartId,
    field,
    title: toNullableString(row.title),
    limit: toNumber(row.limit, 50),
    position: toNumber(row.position, 0),
    createdAt: toNumber(row.created_at, Date.now()),
    updatedAt: toNumber(row.updated_at, Date.now()),
  };
}

async function runStorageSql(
  target: DashboardStorageTarget,
  sql: string,
  options: {
    catalogContext?: string | null;
  } = {},
): Promise<Record<string, unknown>[]> {
  const result = await runQuery({
    sql,
    dbIdentifier: target.dbIdentifier ?? undefined,
    backendPreference: target.sqlBackend,
    catalogContext: options.catalogContext ?? undefined,
  });
  return result.rows;
}

function buildRuntimeProbeSql(sql: string): string | null {
  const normalizedSql = sql.trim().replace(/;+\s*$/, "");
  return normalizedSql.length > 0 ? `EXPLAIN ${normalizedSql};` : null;
}

async function canExecuteSqlInTargetRuntime(
  target: DashboardStorageTarget,
  sql: string,
  catalogContext?: string | null,
): Promise<boolean> {
  if (target.sqlBackend === "duckdb-wasm") {
    return false;
  }

  const probeSql = buildRuntimeProbeSql(sql);
  if (!probeSql) {
    return false;
  }

  try {
    await runStorageSql(target, probeSql, { catalogContext });
    return true;
  } catch {
    return false;
  }
}

async function runStorageStatements(
  target: DashboardStorageTarget,
  statements: string[],
): Promise<void> {
  for (const statement of statements) {
    await runStorageSql(target, statement);
  }
}

async function hasMetadataTables(
  target: DashboardStorageTarget,
): Promise<boolean> {
  try {
    const rows = await runStorageSql(
      target,
      `SELECT 1
       FROM information_schema.tables
       WHERE table_schema = ${quoteString(METADATA_SCHEMA)}
         AND table_name = 'dashboards'
       LIMIT 1;`,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function ensureMetadataSchema(
  target: DashboardStorageTarget,
): Promise<void> {
  await runStorageStatements(target, [
    `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)};`,
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)}.dashboards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      columns INTEGER NOT NULL DEFAULT 3,
      auto_fit_rows BOOLEAN NOT NULL DEFAULT FALSE,
      home_db_identifier TEXT,
      home_sql_backend TEXT,
      storage_status TEXT NOT NULL DEFAULT 'best-effort'
    );`,
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      title TEXT,
      description TEXT,
      sql TEXT NOT NULL,
      db_identifier TEXT,
      catalog_context TEXT,
      sql_backend TEXT,
      chart_config_json TEXT NOT NULL,
      semantic_query_json TEXT,
      explore_name TEXT,
      position INTEGER NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      source_sql TEXT,
      source_db_identifier TEXT,
      source_catalog_context TEXT,
      source_sql_backend TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      sql TEXT NOT NULL,
      db_identifier TEXT,
      catalog_context TEXT,
      sql_backend TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      source_sql TEXT,
      source_db_identifier TEXT,
      source_catalog_context TEXT,
      source_sql_backend TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_slicers (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      field TEXT NOT NULL,
      title TEXT,
      ${quoteIdentifier("limit")} INTEGER NOT NULL,
      position INTEGER NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)}.chart_slicers (
      id TEXT PRIMARY KEY,
      chart_id TEXT NOT NULL,
      field TEXT NOT NULL,
      title TEXT,
      ${quoteIdentifier("limit")} INTEGER NOT NULL,
      position INTEGER NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_join_defs (
      dashboard_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      left_table TEXT NOT NULL,
      left_column TEXT NOT NULL,
      right_table TEXT NOT NULL,
      right_column TEXT NOT NULL,
      join_type TEXT,
      PRIMARY KEY (dashboard_id, position)
    );`,
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_materializations (
      dashboard_id TEXT NOT NULL,
      source_table_name TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      snapshot_schema TEXT NOT NULL,
      snapshot_table_name TEXT NOT NULL,
      source_db_identifier TEXT,
      source_sql_backend TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (dashboard_id, source_table_name)
    );`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS catalog_context TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS source_catalog_context TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS catalog_context TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS source_catalog_context TEXT;`,
  ]);
}

async function listDashboardsFromTarget(
  target: DashboardStorageTarget,
): Promise<DashboardRecord[]> {
  if (!(await hasMetadataTables(target))) {
    return [];
  }

  const rows = await runStorageSql(
    target,
    `SELECT *
     FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboards
     ORDER BY updated_at DESC;`,
  );

  return rows
    .map((row) => normalizeDashboardRow(row))
    .filter((row): row is DashboardRecord => row !== null);
}

async function getDashboardFromTarget(
  target: DashboardStorageTarget,
  dashboardId: string,
): Promise<DashboardRecord | null> {
  if (!(await hasMetadataTables(target))) {
    return null;
  }

  const rows = await runStorageSql(
    target,
    `SELECT *
     FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboards
     WHERE id = ${quoteString(dashboardId)}
     LIMIT 1;`,
  );

  return normalizeDashboardRow(rows[0] ?? {}) ?? null;
}

async function getChartFromTarget(
  target: DashboardStorageTarget,
  chartId: string,
): Promise<ChartRecord | null> {
  if (!(await hasMetadataTables(target))) {
    return null;
  }

  const rows = await runStorageSql(
    target,
    `SELECT *
     FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     WHERE id = ${quoteString(chartId)}
     LIMIT 1;`,
  );

  return normalizeChartRow(rows[0] ?? {}) ?? null;
}

async function getMeasureFromTarget(
  target: DashboardStorageTarget,
  measureId: string,
): Promise<MeasureRecord | null> {
  if (!(await hasMetadataTables(target))) {
    return null;
  }

  const rows = await runStorageSql(
    target,
    `SELECT *
     FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
     WHERE id = ${quoteString(measureId)}
     LIMIT 1;`,
  );

  return normalizeMeasureRow(rows[0] ?? {}) ?? null;
}

async function listChartsFromTarget(
  target: DashboardStorageTarget,
  dashboardId: string,
): Promise<ChartRecord[]> {
  if (!(await hasMetadataTables(target))) {
    return [];
  }

  const rows = await runStorageSql(
    target,
    `SELECT *
     FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     WHERE dashboard_id = ${quoteString(dashboardId)}
     ORDER BY position ASC;`,
  );

  return rows
    .map((row) => normalizeChartRow(row))
    .filter((row): row is ChartRecord => row !== null);
}

async function listMeasuresFromTarget(
  target: DashboardStorageTarget,
  dashboardId: string,
): Promise<MeasureRecord[]> {
  if (!(await hasMetadataTables(target))) {
    return [];
  }

  const rows = await runStorageSql(
    target,
    `SELECT *
     FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
     WHERE dashboard_id = ${quoteString(dashboardId)}
     ORDER BY label ASC;`,
  );

  return rows
    .map((row) => normalizeMeasureRow(row))
    .filter((row): row is MeasureRecord => row !== null);
}

async function listDashboardSlicersFromTarget(
  target: DashboardStorageTarget,
  dashboardId: string,
): Promise<WorkspaceDashboardSlicer[]> {
  if (!(await hasMetadataTables(target))) {
    return [];
  }

  const rows = await runStorageSql(
    target,
    `SELECT *
     FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_slicers
     WHERE dashboard_id = ${quoteString(dashboardId)}
     ORDER BY position ASC;`,
  );

  return rows
    .map((row) => normalizeDashboardSlicerRow(row))
    .filter((row): row is WorkspaceDashboardSlicer => row !== null);
}

async function listChartSlicersFromTarget(
  target: DashboardStorageTarget,
  chartId: string,
): Promise<WorkspaceChartSlicer[]> {
  if (!(await hasMetadataTables(target))) {
    return [];
  }

  const rows = await runStorageSql(
    target,
    `SELECT *
     FROM ${quoteIdentifier(METADATA_SCHEMA)}.chart_slicers
     WHERE chart_id = ${quoteString(chartId)}
     ORDER BY position ASC;`,
  );

  return rows
    .map((row) => normalizeChartSlicerRow(row))
    .filter((row): row is WorkspaceChartSlicer => row !== null);
}

async function listJoinDefsFromTarget(
  target: DashboardStorageTarget,
  dashboardId: string,
): Promise<JoinDefinition[]> {
  if (!(await hasMetadataTables(target))) {
    return [];
  }

  const rows = await runStorageSql(
    target,
    `SELECT left_table, left_column, right_table, right_column, join_type
     FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_join_defs
     WHERE dashboard_id = ${quoteString(dashboardId)}
     ORDER BY position ASC;`,
  );

  const joinDefs: JoinDefinition[] = [];

  for (const row of rows) {
    const leftTable = toTrimmedString(row.left_table);
    const leftColumn = toTrimmedString(row.left_column);
    const rightTable = toTrimmedString(row.right_table);
    const rightColumn = toTrimmedString(row.right_column);

    if (!leftTable || !leftColumn || !rightTable || !rightColumn) {
      continue;
    }

    joinDefs.push({
      leftTable,
      leftColumn,
      rightTable,
      rightColumn,
      type:
        row.join_type === "inner" ||
        row.join_type === "left" ||
        row.join_type === "right" ||
        row.join_type === "full"
          ? row.join_type
          : "left",
    });
  }

  return dedupeJoinDefinitions(joinDefs);
}

async function replaceJoinDefsInTarget(
  target: DashboardStorageTarget,
  dashboardId: string,
  joinDefs: JoinDefinition[],
): Promise<void> {
  await ensureMetadataSchema(target);
  await runStorageSql(
    target,
    `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_join_defs
     WHERE dashboard_id = ${quoteString(dashboardId)};`,
  );

  const deduped = dedupeJoinDefinitions(joinDefs);
  for (let index = 0; index < deduped.length; index += 1) {
    const joinDef = deduped[index];
    await runStorageSql(
      target,
      `INSERT OR REPLACE INTO ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_join_defs (
        dashboard_id,
        position,
        left_table,
        left_column,
        right_table,
        right_column,
        join_type
      ) VALUES (
        ${quoteString(dashboardId)},
        ${index},
        ${quoteString(joinDef.leftTable)},
        ${quoteString(joinDef.leftColumn)},
        ${quoteString(joinDef.rightTable)},
        ${quoteString(joinDef.rightColumn)},
        ${quoteString(joinDef.type ?? "left")}
      );`,
    );
  }
}

async function upsertDashboardRecord(
  target: DashboardStorageTarget,
  dashboard: DashboardRecord,
): Promise<void> {
  await ensureMetadataSchema(target);
  await runStorageSql(
    target,
    `INSERT OR REPLACE INTO ${quoteIdentifier(METADATA_SCHEMA)}.dashboards (
      id,
      title,
      created_at,
      updated_at,
      columns,
      auto_fit_rows,
      home_db_identifier,
      home_sql_backend,
      storage_status
    ) VALUES (
      ${quoteString(dashboard.id)},
      ${quoteString(dashboard.title)},
      ${dashboard.createdAt},
      ${dashboard.updatedAt},
      ${dashboard.columns},
      ${sqlBoolean(dashboard.autoFitRows)},
      ${sqlNullableString(dashboard.homeDbIdentifier)},
      ${sqlNullableBackend(dashboard.homeSqlBackend)},
      ${quoteString(dashboard.storageStatus ?? "best-effort")}
    );`,
  );
}

async function upsertChartRecord(
  target: DashboardStorageTarget,
  chart: ChartRecord,
): Promise<void> {
  await ensureMetadataSchema(target);
  await runStorageSql(
    target,
    `INSERT OR REPLACE INTO ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts (
      id,
      dashboard_id,
      title,
      description,
      sql,
      db_identifier,
      catalog_context,
      sql_backend,
      chart_config_json,
      semantic_query_json,
      explore_name,
      position,
      created_at,
      updated_at,
      source_sql,
      source_db_identifier,
      source_catalog_context,
      source_sql_backend
    ) VALUES (
      ${quoteString(chart.id)},
      ${quoteString(chart.dashboardId)},
      ${sqlNullableString(chart.title)},
      ${sqlNullableString(chart.description)},
      ${quoteString(chart.sql)},
      ${sqlNullableString(chart.dbIdentifier)},
      ${sqlNullableString(chart.catalogContext ?? null)},
      ${sqlNullableBackend(chart.sqlBackend)},
      ${quoteString(chart.chartConfigJson)},
      ${sqlNullableString(chart.semanticQueryJson)},
      ${sqlNullableString(chart.exploreName)},
      ${chart.position},
      ${chart.createdAt},
      ${chart.updatedAt},
      ${sqlNullableString(chart.sourceSql ?? null)},
      ${sqlNullableString(chart.sourceDbIdentifier ?? null)},
      ${sqlNullableString(chart.sourceCatalogContext ?? null)},
      ${sqlNullableBackend(chart.sourceSqlBackend ?? null)}
    );`,
  );
}

async function upsertMeasureRecord(
  target: DashboardStorageTarget,
  measure: MeasureRecord,
): Promise<void> {
  await ensureMetadataSchema(target);
  await runStorageSql(
    target,
    `INSERT OR REPLACE INTO ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures (
      id,
      dashboard_id,
      key,
      label,
      sql,
      db_identifier,
      catalog_context,
      sql_backend,
      created_at,
      updated_at,
      source_sql,
      source_db_identifier,
      source_catalog_context,
      source_sql_backend
    ) VALUES (
      ${quoteString(measure.id)},
      ${quoteString(measure.dashboardId)},
      ${quoteString(measure.key)},
      ${quoteString(measure.label)},
      ${quoteString(measure.sql)},
      ${sqlNullableString(measure.dbIdentifier)},
      ${sqlNullableString(measure.catalogContext ?? null)},
      ${sqlNullableBackend(measure.sqlBackend)},
      ${measure.createdAt},
      ${measure.updatedAt},
      ${sqlNullableString(measure.sourceSql ?? null)},
      ${sqlNullableString(measure.sourceDbIdentifier ?? null)},
      ${sqlNullableString(measure.sourceCatalogContext ?? null)},
      ${sqlNullableBackend(measure.sourceSqlBackend ?? null)}
    );`,
  );
}

async function upsertDashboardSlicerRecord(
  target: DashboardStorageTarget,
  slicer: WorkspaceDashboardSlicer,
): Promise<void> {
  await ensureMetadataSchema(target);
  await runStorageSql(
    target,
    `INSERT OR REPLACE INTO ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_slicers (
      id,
      dashboard_id,
      field,
      title,
      ${quoteIdentifier("limit")},
      position,
      created_at,
      updated_at
    ) VALUES (
      ${quoteString(slicer.id)},
      ${quoteString(slicer.dashboardId)},
      ${quoteString(slicer.field)},
      ${sqlNullableString(slicer.title)},
      ${slicer.limit},
      ${slicer.position},
      ${slicer.createdAt},
      ${slicer.updatedAt}
    );`,
  );
}

async function upsertChartSlicerRecord(
  target: DashboardStorageTarget,
  slicer: WorkspaceChartSlicer,
): Promise<void> {
  await ensureMetadataSchema(target);
  await runStorageSql(
    target,
    `INSERT OR REPLACE INTO ${quoteIdentifier(METADATA_SCHEMA)}.chart_slicers (
      id,
      chart_id,
      field,
      title,
      ${quoteIdentifier("limit")},
      position,
      created_at,
      updated_at
    ) VALUES (
      ${quoteString(slicer.id)},
      ${quoteString(slicer.chartId)},
      ${quoteString(slicer.field)},
      ${sqlNullableString(slicer.title)},
      ${slicer.limit},
      ${slicer.position},
      ${slicer.createdAt},
      ${slicer.updatedAt}
    );`,
  );
}

async function upsertMaterializationRecord(
  target: DashboardStorageTarget,
  input: {
    dashboardId: string;
    tableName: string;
    sourceReference: string;
    snapshotSchema: string;
    sourceDbIdentifier: string | null;
    sourceSqlBackend: SqlBackend | null;
    now: number;
  },
): Promise<void> {
  await ensureMetadataSchema(target);
  await runStorageSql(
    target,
    `INSERT OR REPLACE INTO ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_materializations (
      dashboard_id,
      source_table_name,
      source_reference,
      snapshot_schema,
      snapshot_table_name,
      source_db_identifier,
      source_sql_backend,
      created_at,
      updated_at
    ) VALUES (
      ${quoteString(input.dashboardId)},
      ${quoteString(input.tableName)},
      ${quoteString(input.sourceReference)},
      ${quoteString(input.snapshotSchema)},
      ${quoteString(input.tableName)},
      ${sqlNullableString(input.sourceDbIdentifier)},
      ${sqlNullableBackend(input.sourceSqlBackend)},
      ${input.now},
      ${input.now}
    );`,
  );
}

async function touchDashboard(
  target: DashboardStorageTarget,
  dashboardId: string,
  now: number,
): Promise<void> {
  const existing = await getDashboardFromTarget(target, dashboardId);
  if (!existing) {
    return;
  }

  await upsertDashboardRecord(target, {
    ...existing,
    updatedAt: now,
  });
}

async function buildPreparedSqlPayload(
  target: DashboardStorageTarget,
  dashboardId: string,
  input: {
    sql: string;
    dbIdentifier?: string | null;
    catalogContext?: string | null;
    sqlBackend?: SqlBackend | null;
  },
  joinDefs: JoinDefinition[],
  now: number,
): Promise<PreparedSqlPayload> {
  const sourceSql = input.sql;
  const sourceDbIdentifier = input.dbIdentifier ?? null;
  const sourceCatalogContext = input.catalogContext ?? null;
  const sourceSqlBackend = input.sqlBackend ?? null;
  const sourceMode = await resolveDashboardSourceMode({
    sourceDbIdentifier,
    targetSqlBackend: target.sqlBackend,
    probeRuntimeExecution: () =>
      canExecuteSqlInTargetRuntime(target, sourceSql, sourceCatalogContext),
  });
  const externalConnection = resolveDashboardExternalConnection({
    sourceDbIdentifier,
    targetSqlBackend: target.sqlBackend,
  });

  if (sourceMode === "external-materialize" && externalConnection) {
    const tableRefs = buildMaterializationTableRefs([sourceSql], joinDefs);
    const snapshotSchema = dashboardSnapshotSchema(dashboardId);

    await ensureMetadataSchema(target);
    await runStorageSql(
      target,
      `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(snapshotSchema)};`,
    );

    const attachmentPlan = buildAttachmentPlan({
      ...externalConnection,
      alias: "pondview_source",
    });

    try {
      await runStorageStatements(target, attachmentPlan.statements);

      for (const tableRef of tableRefs) {
        const sourceReference = `${quoteIdentifier(attachmentPlan.alias)}.${tableRef.sourceReference}`;
        await runStorageSql(
          target,
          `CREATE OR REPLACE TABLE ${quoteIdentifier(snapshotSchema)}.${quoteIdentifier(tableRef.tableName)} AS
           SELECT * FROM ${sourceReference};`,
        );

        await upsertMaterializationRecord(target, {
          dashboardId,
          tableName: tableRef.tableName,
          sourceReference: tableRef.sourceReference,
          snapshotSchema,
          sourceDbIdentifier,
          sourceSqlBackend,
          now,
        });
      }
    } finally {
      try {
        await runStorageSql(
          target,
          buildDetachStatement(attachmentPlan.alias, { ifExists: true }),
        );
      } catch {
        // Best-effort detach only.
      }
    }

    return {
      sql: rewriteSqlToSnapshotTables(sourceSql, tableRefs, snapshotSchema),
      dbIdentifier: storedDbIdentifierForTarget(target),
      catalogContext: null,
      sqlBackend: target.sqlBackend,
      sourceSql,
      sourceDbIdentifier,
      sourceCatalogContext,
      sourceSqlBackend,
    };
  }

  return {
    sql: sourceSql,
    dbIdentifier: storedDbIdentifierForTarget(target),
    catalogContext: sourceCatalogContext,
    sqlBackend: target.sqlBackend,
    sourceSql,
    sourceDbIdentifier,
    sourceCatalogContext,
    sourceSqlBackend,
  };
}

export class DashboardStorageService {
  private async resolveDashboardTarget(dashboardId: string): Promise<{
    target: DashboardStorageTarget;
    dashboard: DashboardRecord;
  } | null> {
    const targets = discoverReadTargets();
    for (const target of targets) {
      const dashboard = await getDashboardFromTarget(target, dashboardId).catch(
        () => null,
      );
      if (dashboard) {
        return { target, dashboard };
      }
    }

    return null;
  }

  private async resolveChartTarget(chartId: string): Promise<{
    target: DashboardStorageTarget;
    chart: ChartRecord;
  } | null> {
    const targets = discoverReadTargets();
    for (const target of targets) {
      const chart = await getChartFromTarget(target, chartId).catch(() => null);
      if (chart) {
        return { target, chart };
      }
    }

    return null;
  }

  private async resolveMeasureTarget(measureId: string): Promise<{
    target: DashboardStorageTarget;
    measure: MeasureRecord;
  } | null> {
    const targets = discoverReadTargets();
    for (const target of targets) {
      const measure = await getMeasureFromTarget(target, measureId).catch(
        () => null,
      );
      if (measure) {
        return { target, measure };
      }
    }

    return null;
  }

  async listDashboards(): Promise<DashboardSummary[]> {
    const targets = discoverReadTargets();
    const dashboardsById = new Map<string, DashboardRecord>();

    for (const target of targets) {
      const dashboards = await listDashboardsFromTarget(target).catch(() => []);
      for (const dashboard of dashboards) {
        const existing = dashboardsById.get(dashboard.id);
        if (!existing || existing.updatedAt < dashboard.updatedAt) {
          dashboardsById.set(dashboard.id, dashboard);
        }
      }
    }

    return Array.from(dashboardsById.values()).sort(
      (left, right) => right.updatedAt - left.updatedAt,
    );
  }

  async createDashboard(
    title: string,
    input: {
      dbIdentifier?: string | null;
      joinDefs?: JoinDefinition[];
      sqlBackend?: SqlBackend | null;
      now?: number;
    } = {},
  ): Promise<{ id: string }> {
    const now = input.now ?? Date.now();
    const id = nanoid();
    const target = resolveTargetForSource(input);

    await upsertDashboardRecord(target, {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      columns: 3,
      autoFitRows: false,
      homeDbIdentifier: storedDbIdentifierForTarget(target),
      homeSqlBackend: target.sqlBackend,
      storageStatus: target.storageStatus,
    });

    await replaceJoinDefsInTarget(
      target,
      id,
      resolveJoinDefsForNewDashboard(input.joinDefs),
    );
    return { id };
  }

  async updateDashboardTitle(
    dashboardId: string,
    title: string,
    now = Date.now(),
  ): Promise<{ updated: boolean }> {
    const resolved = await this.resolveDashboardTarget(dashboardId);
    if (!resolved) {
      return { updated: false };
    }

    await upsertDashboardRecord(resolved.target, {
      ...resolved.dashboard,
      title,
      updatedAt: now,
    });

    return { updated: true };
  }

  async updateDashboardSettings(
    dashboardId: string,
    input: {
      columns?: number;
      autoFitRows?: boolean;
      now?: number;
    },
  ): Promise<{ updated: boolean }> {
    const resolved = await this.resolveDashboardTarget(dashboardId);
    if (!resolved) {
      return { updated: false };
    }

    await upsertDashboardRecord(resolved.target, {
      ...resolved.dashboard,
      columns: input.columns ?? resolved.dashboard.columns,
      autoFitRows: input.autoFitRows ?? resolved.dashboard.autoFitRows,
      updatedAt: input.now ?? Date.now(),
    });

    return { updated: true };
  }

  async getDashboardWithCharts(dashboardId: string): Promise<{
    dashboard: DashboardRecord;
    charts: ChartRecord[];
  } | null> {
    const resolved = await this.resolveDashboardTarget(dashboardId);
    if (!resolved) {
      return null;
    }

    const charts = await listChartsFromTarget(resolved.target, dashboardId);
    return {
      dashboard: resolved.dashboard,
      charts,
    };
  }

  async listChartsByDashboard(dashboardId: string): Promise<ChartRecord[]> {
    const resolved = await this.resolveDashboardTarget(dashboardId);
    if (!resolved) {
      return [];
    }

    return listChartsFromTarget(resolved.target, dashboardId);
  }

  async getChartById(chartId: string): Promise<ChartRecord | null> {
    const resolved = await this.resolveChartTarget(chartId);
    return resolved?.chart ?? null;
  }

  async listMeasuresByDashboard(dashboardId: string): Promise<MeasureRecord[]> {
    const resolved = await this.resolveDashboardTarget(dashboardId);
    if (!resolved) {
      return [];
    }

    return listMeasuresFromTarget(resolved.target, dashboardId);
  }

  async getMeasureById(measureId: string): Promise<MeasureRecord | null> {
    const resolved = await this.resolveMeasureTarget(measureId);
    return resolved?.measure ?? null;
  }

  async createDashboardMeasure(input: {
    dashboardId: string;
    key: string;
    label: string;
    sql: string;
    dbIdentifier?: string | null;
    catalogContext?: string | null;
    sqlBackend?: SqlBackend | null;
    now?: number;
  }): Promise<{ id: string }> {
    const resolved = await this.resolveDashboardTarget(input.dashboardId);
    if (!resolved) {
      throw new Error("Dashboard not found");
    }

    const existingMeasures = await listMeasuresFromTarget(
      resolved.target,
      input.dashboardId,
    );
    if (existingMeasures.some((measure) => measure.key === input.key)) {
      throw new Error("Measure key already exists on this dashboard");
    }

    const now = input.now ?? Date.now();
    const joinDefs = await listJoinDefsFromTarget(
      resolved.target,
      input.dashboardId,
    );
    const prepared = await buildPreparedSqlPayload(
      resolved.target,
      input.dashboardId,
      input,
      joinDefs.length > 0 ? joinDefs : defaultJoinDefs(),
      now,
    );

    await upsertMeasureRecord(resolved.target, {
      id: nanoid(),
      dashboardId: input.dashboardId,
      key: input.key,
      label: input.label,
      sql: prepared.sql,
      dbIdentifier: prepared.dbIdentifier,
      catalogContext: prepared.catalogContext,
      sqlBackend: prepared.sqlBackend,
      createdAt: now,
      updatedAt: now,
      sourceSql: prepared.sourceSql,
      sourceDbIdentifier: prepared.sourceDbIdentifier,
      sourceCatalogContext: prepared.sourceCatalogContext,
      sourceSqlBackend: prepared.sourceSqlBackend,
    });

    await touchDashboard(resolved.target, input.dashboardId, now);

    const measures = await listMeasuresFromTarget(
      resolved.target,
      input.dashboardId,
    );
    return {
      id: measures.find((measure) => measure.key === input.key)?.id ?? "",
    };
  }

  async updateDashboardMeasure(
    measureId: string,
    input: {
      label?: string;
      sql?: string;
      dbIdentifier?: string | null;
      catalogContext?: string | null;
      sqlBackend?: SqlBackend | null;
      now?: number;
    },
  ): Promise<{ updated: boolean }> {
    const resolved = await this.resolveMeasureTarget(measureId);
    if (!resolved) {
      return { updated: false };
    }

    const now = input.now ?? Date.now();
    const joinDefs = await listJoinDefsFromTarget(
      resolved.target,
      resolved.measure.dashboardId,
    );

    const prepared =
      input.sql !== undefined ||
      input.dbIdentifier !== undefined ||
      input.catalogContext !== undefined ||
      input.sqlBackend !== undefined
        ? await buildPreparedSqlPayload(
            resolved.target,
            resolved.measure.dashboardId,
            {
              sql:
                input.sql ?? resolved.measure.sourceSql ?? resolved.measure.sql,
              dbIdentifier:
                input.dbIdentifier === undefined
                  ? (resolved.measure.sourceDbIdentifier ??
                    resolved.measure.dbIdentifier ??
                    null)
                  : input.dbIdentifier,
              catalogContext:
                input.catalogContext === undefined
                  ? (resolved.measure.sourceCatalogContext ??
                    resolved.measure.catalogContext ??
                    null)
                  : input.catalogContext,
              sqlBackend:
                input.sqlBackend === undefined
                  ? (resolved.measure.sourceSqlBackend ??
                    resolved.measure.sqlBackend ??
                    null)
                  : input.sqlBackend,
            },
            joinDefs.length > 0 ? joinDefs : defaultJoinDefs(),
            now,
          )
        : null;

    await upsertMeasureRecord(resolved.target, {
      ...resolved.measure,
      label: input.label ?? resolved.measure.label,
      sql: prepared?.sql ?? resolved.measure.sql,
      dbIdentifier: prepared?.dbIdentifier ?? resolved.measure.dbIdentifier,
      catalogContext:
        prepared?.catalogContext ?? resolved.measure.catalogContext,
      sqlBackend: prepared?.sqlBackend ?? resolved.measure.sqlBackend,
      sourceSql: prepared?.sourceSql ?? resolved.measure.sourceSql,
      sourceDbIdentifier:
        prepared?.sourceDbIdentifier ?? resolved.measure.sourceDbIdentifier,
      sourceCatalogContext:
        prepared?.sourceCatalogContext ??
        resolved.measure.sourceCatalogContext,
      sourceSqlBackend:
        prepared?.sourceSqlBackend ?? resolved.measure.sourceSqlBackend,
      updatedAt: now,
    });

    const charts = await listChartsFromTarget(
      resolved.target,
      resolved.measure.dashboardId,
    );
    const measureBackedCharts = charts.filter((chart) => {
      try {
        const parsed = JSON.parse(chart.chartConfigJson) as {
          configType?: string;
          measureId?: string;
        };
        return parsed.configType === "card" && parsed.measureId === measureId;
      } catch {
        return false;
      }
    });

    for (const chart of measureBackedCharts) {
      await upsertChartRecord(resolved.target, {
        ...chart,
        sql: prepared?.sql ?? chart.sql,
        dbIdentifier: prepared?.dbIdentifier ?? chart.dbIdentifier,
        catalogContext: prepared?.catalogContext ?? chart.catalogContext,
        sqlBackend: prepared?.sqlBackend ?? chart.sqlBackend,
        sourceSql: prepared?.sourceSql ?? chart.sourceSql,
        sourceDbIdentifier:
          prepared?.sourceDbIdentifier ?? chart.sourceDbIdentifier,
        sourceCatalogContext:
          prepared?.sourceCatalogContext ?? chart.sourceCatalogContext,
        sourceSqlBackend: prepared?.sourceSqlBackend ?? chart.sourceSqlBackend,
        updatedAt: now,
      });
    }

    await touchDashboard(resolved.target, resolved.measure.dashboardId, now);
    return { updated: true };
  }

  async addChartToDashboard(input: {
    dashboardId: string;
    title?: string | null;
    description?: string | null;
    sql: string;
    dbIdentifier?: string | null;
    catalogContext?: string | null;
    sqlBackend?: SqlBackend | null;
    chartConfigJson: string;
    semanticQueryJson?: string | null;
    exploreName?: string | null;
    now?: number;
  }): Promise<{ id: string }> {
    const resolved = await this.resolveDashboardTarget(input.dashboardId);
    if (!resolved) {
      throw new Error("Dashboard not found");
    }

    const now = input.now ?? Date.now();
    const charts = await listChartsFromTarget(
      resolved.target,
      input.dashboardId,
    );
    const joinDefs = await listJoinDefsFromTarget(
      resolved.target,
      input.dashboardId,
    );
    const prepared = await buildPreparedSqlPayload(
      resolved.target,
      input.dashboardId,
      input,
      joinDefs.length > 0 ? joinDefs : defaultJoinDefs(),
      now,
    );

    const id = nanoid();
    const maxPosition = charts.reduce(
      (max, chart) => Math.max(max, chart.position),
      -1,
    );

    await upsertChartRecord(resolved.target, {
      id,
      dashboardId: input.dashboardId,
      title: input.title ?? null,
      description: input.description ?? null,
      sql: prepared.sql,
      dbIdentifier: prepared.dbIdentifier,
      catalogContext: prepared.catalogContext,
      sqlBackend: prepared.sqlBackend,
      chartConfigJson: input.chartConfigJson,
      semanticQueryJson: input.semanticQueryJson ?? null,
      exploreName: input.exploreName ?? null,
      position: maxPosition + 1,
      createdAt: now,
      updatedAt: now,
      sourceSql: prepared.sourceSql,
      sourceDbIdentifier: prepared.sourceDbIdentifier,
      sourceCatalogContext: prepared.sourceCatalogContext,
      sourceSqlBackend: prepared.sourceSqlBackend,
    });

    await touchDashboard(resolved.target, input.dashboardId, now);
    return { id };
  }

  async updateChartConfig(
    chartId: string,
    chartConfigJson: string,
    now = Date.now(),
  ): Promise<{ updated: boolean }> {
    const resolved = await this.resolveChartTarget(chartId);
    if (!resolved) {
      return { updated: false };
    }

    await upsertChartRecord(resolved.target, {
      ...resolved.chart,
      chartConfigJson,
      updatedAt: now,
    });
    await touchDashboard(resolved.target, resolved.chart.dashboardId, now);
    return { updated: true };
  }

  async updateChartSql(
    chartId: string,
    sql: string,
    now = Date.now(),
  ): Promise<{ updated: boolean }> {
    const resolved = await this.resolveChartTarget(chartId);
    if (!resolved) {
      return { updated: false };
    }

    await upsertChartRecord(resolved.target, {
      ...resolved.chart,
      sql,
      updatedAt: now,
    });
    await touchDashboard(resolved.target, resolved.chart.dashboardId, now);
    return { updated: true };
  }

  async reorderDashboardCharts(
    dashboardId: string,
    orderedChartIds: string[],
    now = Date.now(),
  ): Promise<void> {
    const resolved = await this.resolveDashboardTarget(dashboardId);
    if (!resolved) {
      throw new Error("Dashboard not found");
    }

    const charts = await listChartsFromTarget(resolved.target, dashboardId);
    const existingIds = charts.map((chart) => chart.id);
    if (
      existingIds.length !== orderedChartIds.length ||
      new Set(orderedChartIds).size !== orderedChartIds.length ||
      orderedChartIds.some((id) => !existingIds.includes(id))
    ) {
      throw new Error("Ordered chart ids do not match dashboard charts");
    }

    for (let index = 0; index < orderedChartIds.length; index += 1) {
      const chart = charts.find((item) => item.id === orderedChartIds[index]);
      if (!chart) {
        throw new Error("Invalid chart ordering");
      }
      await upsertChartRecord(resolved.target, {
        ...chart,
        position: index,
        updatedAt: now,
      });
    }

    await touchDashboard(resolved.target, dashboardId, now);
  }

  async removeChartFromDashboard(
    chartId: string,
    now = Date.now(),
  ): Promise<{ removed: boolean }> {
    const resolved = await this.resolveChartTarget(chartId);
    if (!resolved) {
      return { removed: false };
    }

    await runStorageSql(
      resolved.target,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.chart_slicers
       WHERE chart_id = ${quoteString(chartId)};`,
    );
    await runStorageSql(
      resolved.target,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
       WHERE id = ${quoteString(chartId)};`,
    );
    await touchDashboard(resolved.target, resolved.chart.dashboardId, now);
    return { removed: true };
  }

  async deleteDashboard(dashboardId: string): Promise<{ deleted: boolean }> {
    const resolved = await this.resolveDashboardTarget(dashboardId);
    if (!resolved) {
      return { deleted: false };
    }

    const snapshotSchema = dashboardSnapshotSchema(dashboardId);
    await runStorageStatements(resolved.target, [
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.chart_slicers
       WHERE chart_id IN (
         SELECT id
         FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
         WHERE dashboard_id = ${quoteString(dashboardId)}
       );`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
       WHERE dashboard_id = ${quoteString(dashboardId)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
       WHERE dashboard_id = ${quoteString(dashboardId)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_slicers
       WHERE dashboard_id = ${quoteString(dashboardId)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_join_defs
       WHERE dashboard_id = ${quoteString(dashboardId)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_materializations
       WHERE dashboard_id = ${quoteString(dashboardId)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboards
       WHERE id = ${quoteString(dashboardId)};`,
      `DROP SCHEMA IF EXISTS ${quoteIdentifier(snapshotSchema)} CASCADE;`,
    ]);

    return { deleted: true };
  }

  async listSlicersByDashboard(
    dashboardId: string,
  ): Promise<WorkspaceDashboardSlicer[]> {
    const resolved = await this.resolveDashboardTarget(dashboardId);
    if (!resolved) {
      return [];
    }
    return listDashboardSlicersFromTarget(resolved.target, dashboardId);
  }

  async addSlicerToDashboard(input: {
    dashboardId: string;
    field: string;
    title?: string | null;
    limit?: number;
    now?: number;
  }): Promise<{ id: string }> {
    const resolved = await this.resolveDashboardTarget(input.dashboardId);
    if (!resolved) {
      throw new Error("Dashboard not found");
    }

    const now = input.now ?? Date.now();
    const slicers = await listDashboardSlicersFromTarget(
      resolved.target,
      input.dashboardId,
    );
    const maxPosition = slicers.reduce(
      (max, slicer) => Math.max(max, slicer.position),
      -1,
    );
    const id = nanoid();

    await upsertDashboardSlicerRecord(resolved.target, {
      id,
      dashboardId: input.dashboardId,
      field: input.field,
      title: input.title ?? null,
      limit: input.limit ?? 50,
      position: maxPosition + 1,
      createdAt: now,
      updatedAt: now,
    });
    await touchDashboard(resolved.target, input.dashboardId, now);
    return { id };
  }

  async updateSlicer(input: {
    slicerId: string;
    title?: string | null;
    limit?: number;
    now?: number;
  }): Promise<{ updated: boolean }> {
    const targets = discoverReadTargets();

    for (const target of targets) {
      const rows = await runStorageSql(
        target,
        `SELECT *
         FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_slicers
         WHERE id = ${quoteString(input.slicerId)}
         LIMIT 1;`,
      ).catch(() => []);
      const slicer = normalizeDashboardSlicerRow(rows[0] ?? {});
      if (!slicer) {
        continue;
      }

      const now = input.now ?? Date.now();
      await upsertDashboardSlicerRecord(target, {
        ...slicer,
        title: input.title !== undefined ? input.title : slicer.title,
        limit: input.limit !== undefined ? input.limit : slicer.limit,
        updatedAt: now,
      });
      await touchDashboard(target, slicer.dashboardId, now);
      return { updated: true };
    }

    return { updated: false };
  }

  async reorderDashboardSlicers(
    dashboardId: string,
    orderedSlicerIds: string[],
    now = Date.now(),
  ): Promise<void> {
    const resolved = await this.resolveDashboardTarget(dashboardId);
    if (!resolved) {
      throw new Error("Dashboard not found");
    }

    const slicers = await listDashboardSlicersFromTarget(
      resolved.target,
      dashboardId,
    );
    const existingIds = slicers.map((slicer) => slicer.id);
    if (
      existingIds.length !== orderedSlicerIds.length ||
      new Set(orderedSlicerIds).size !== orderedSlicerIds.length ||
      orderedSlicerIds.some((id) => !existingIds.includes(id))
    ) {
      throw new Error("Ordered slicer ids do not match dashboard slicers");
    }

    for (let index = 0; index < orderedSlicerIds.length; index += 1) {
      const slicer = slicers.find(
        (item) => item.id === orderedSlicerIds[index],
      );
      if (!slicer) {
        throw new Error("Invalid slicer ordering");
      }

      await upsertDashboardSlicerRecord(resolved.target, {
        ...slicer,
        position: index,
        updatedAt: now,
      });
    }

    await touchDashboard(resolved.target, dashboardId, now);
  }

  async removeSlicerFromDashboard(
    slicerId: string,
    now = Date.now(),
  ): Promise<{ removed: boolean }> {
    const targets = discoverReadTargets();

    for (const target of targets) {
      const rows = await runStorageSql(
        target,
        `SELECT *
         FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_slicers
         WHERE id = ${quoteString(slicerId)}
         LIMIT 1;`,
      ).catch(() => []);
      const slicer = normalizeDashboardSlicerRow(rows[0] ?? {});
      if (!slicer) {
        continue;
      }

      await runStorageSql(
        target,
        `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_slicers
         WHERE id = ${quoteString(slicerId)};`,
      );
      await touchDashboard(target, slicer.dashboardId, now);
      return { removed: true };
    }

    return { removed: false };
  }

  async listSlicersByChart(chartId: string): Promise<WorkspaceChartSlicer[]> {
    const resolved = await this.resolveChartTarget(chartId);
    if (!resolved) {
      return [];
    }
    return listChartSlicersFromTarget(resolved.target, chartId);
  }

  async addSlicerToChart(input: {
    chartId: string;
    field: string;
    title?: string | null;
    limit?: number;
    now?: number;
  }): Promise<{ id: string }> {
    const resolved = await this.resolveChartTarget(input.chartId);
    if (!resolved) {
      throw new Error("Chart not found");
    }

    const now = input.now ?? Date.now();
    const slicers = await listChartSlicersFromTarget(
      resolved.target,
      input.chartId,
    );
    const maxPosition = slicers.reduce(
      (max, slicer) => Math.max(max, slicer.position),
      -1,
    );
    const id = nanoid();

    await upsertChartSlicerRecord(resolved.target, {
      id,
      chartId: input.chartId,
      field: input.field,
      title: input.title ?? null,
      limit: input.limit ?? 50,
      position: maxPosition + 1,
      createdAt: now,
      updatedAt: now,
    });
    await touchDashboard(resolved.target, resolved.chart.dashboardId, now);
    return { id };
  }

  async updateChartSlicer(input: {
    slicerId: string;
    title?: string | null;
    limit?: number;
    now?: number;
  }): Promise<{ updated: boolean }> {
    const targets = discoverReadTargets();

    for (const target of targets) {
      const rows = await runStorageSql(
        target,
        `SELECT *
         FROM ${quoteIdentifier(METADATA_SCHEMA)}.chart_slicers
         WHERE id = ${quoteString(input.slicerId)}
         LIMIT 1;`,
      ).catch(() => []);
      const slicer = normalizeChartSlicerRow(rows[0] ?? {});
      if (!slicer) {
        continue;
      }

      const now = input.now ?? Date.now();
      await upsertChartSlicerRecord(target, {
        ...slicer,
        title: input.title !== undefined ? input.title : slicer.title,
        limit: input.limit !== undefined ? input.limit : slicer.limit,
        updatedAt: now,
      });
      const chart = await getChartFromTarget(target, slicer.chartId);
      if (chart) {
        await touchDashboard(target, chart.dashboardId, now);
      }
      return { updated: true };
    }

    return { updated: false };
  }

  async reorderChartSlicers(
    chartId: string,
    orderedSlicerIds: string[],
    now = Date.now(),
  ): Promise<void> {
    const resolved = await this.resolveChartTarget(chartId);
    if (!resolved) {
      throw new Error("Chart not found");
    }

    const slicers = await listChartSlicersFromTarget(resolved.target, chartId);
    const existingIds = slicers.map((slicer) => slicer.id);
    if (
      existingIds.length !== orderedSlicerIds.length ||
      new Set(orderedSlicerIds).size !== orderedSlicerIds.length ||
      orderedSlicerIds.some((id) => !existingIds.includes(id))
    ) {
      throw new Error("Ordered slicer ids do not match chart slicers");
    }

    for (let index = 0; index < orderedSlicerIds.length; index += 1) {
      const slicer = slicers.find(
        (item) => item.id === orderedSlicerIds[index],
      );
      if (!slicer) {
        throw new Error("Invalid slicer ordering");
      }

      await upsertChartSlicerRecord(resolved.target, {
        ...slicer,
        position: index,
        updatedAt: now,
      });
    }

    await touchDashboard(resolved.target, resolved.chart.dashboardId, now);
  }

  async removeSlicerFromChart(
    slicerId: string,
    now = Date.now(),
  ): Promise<{ removed: boolean }> {
    const targets = discoverReadTargets();

    for (const target of targets) {
      const rows = await runStorageSql(
        target,
        `SELECT *
         FROM ${quoteIdentifier(METADATA_SCHEMA)}.chart_slicers
         WHERE id = ${quoteString(slicerId)}
         LIMIT 1;`,
      ).catch(() => []);
      const slicer = normalizeChartSlicerRow(rows[0] ?? {});
      if (!slicer) {
        continue;
      }

      await runStorageSql(
        target,
        `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.chart_slicers
         WHERE id = ${quoteString(slicerId)};`,
      );
      const chart = await getChartFromTarget(target, slicer.chartId);
      if (chart) {
        await touchDashboard(target, chart.dashboardId, now);
      }
      return { removed: true };
    }

    return { removed: false };
  }

  async listJoinDefsByDashboard(
    dashboardId: string,
  ): Promise<JoinDefinition[]> {
    const resolved = await this.resolveDashboardTarget(dashboardId);
    if (!resolved) {
      return defaultJoinDefs();
    }

    const joinDefs = await listJoinDefsFromTarget(resolved.target, dashboardId);
    return joinDefs.length > 0 ? joinDefs : defaultJoinDefs();
  }
}

export const dashboardStorageService = new DashboardStorageService();
