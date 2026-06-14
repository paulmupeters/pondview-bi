import { nanoid } from "nanoid";
import {
  buildDashboardSourceDescriptor,
  type DashboardSourceDescriptor,
  getDashboardSourceDescriptorCatalogContext,
  getDashboardSourceDescriptorDbIdentifier,
  getDashboardSourceDescriptorRuntimeBackend,
  parseDashboardSourceDescriptorJson,
  serializeDashboardSourceDescriptor,
} from "@/lib/dashboard/source-descriptor";
import { quoteIdentifier, quoteString } from "@/lib/duckdb/duckdb-attachments";
import { extractTableReferencesFromSql } from "@/lib/filters/parse-tables";
import { readJoinDefsFromStorage } from "@/lib/joins/browser-storage";
import {
  canonicalTable,
  dedupeJoinDefinitions,
  type JoinDefinition,
} from "@/lib/joins/graph";
import {
  deleteDashboardProjectArtifact,
  syncDashboardProjectArtifact,
} from "@/lib/project-store/dashboard-project-artifact-sync";
import { runQuery } from "@/lib/sql/run-query";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  getSqlBackendPreference,
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
const EXEC_SCHEMA = "pondview_exec";
const SNAPSHOT_SCHEMA = "pondview_snapshot";
const metadataCatalogCache = new Map<string, string | null>();

type DashboardStorageTargetKind =
  | "wasm-local"
  | "runtime-default"
  | "motherduck"
  | "attached-catalog";

type DashboardStorageTarget = {
  key: string;
  kind: DashboardStorageTargetKind;
  dbIdentifier: string | null;
  sqlBackend: SqlBackend;
  storageStatus: DashboardStorageStatus;
  catalog?: string | null;
  sourceKind?: "attached" | null;
};

type DashboardRecord = WorkspaceDashboard & {
  columns: number;
  autoFitRows: boolean;
  runtimeBackend: SqlBackend;
  activeSnapshotId: string | null;
  homeDbIdentifier: string | null;
  homeSqlBackend: SqlBackend | null;
  storageStatus: DashboardStorageStatus | null;
  sourceKind?: "attached" | null;
  sourceCatalog?: string | null;
  originalId?: string | null;
};

type ChartRecord = WorkspaceChart;
type MeasureRecord = WorkspaceDashboardMeasure;

type MaterializedTableRef = {
  tableName: string;
  sourceReference: string;
};

type PreparedSqlPayload = {
  sql: string;
  sourceDescriptor: DashboardSourceDescriptor | null;
  sourceDescriptorJson: string | null;
  snapshotId: string | null;
  dbIdentifier: string | null;
  catalogContext: string | null;
  sqlBackend: SqlBackend | null;
};

type DashboardSummary = Pick<
  DashboardRecord,
  | "id"
  | "title"
  | "createdAt"
  | "updatedAt"
  | "columns"
  | "autoFitRows"
  | "runtimeBackend"
  | "activeSnapshotId"
  | "homeDbIdentifier"
  | "homeSqlBackend"
  | "storageStatus"
  | "projectPath"
  | "sourceKind"
  | "sourceCatalog"
  | "originalId"
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
  return value === "bridge" || value === "duckdb-wasm" ? value : null;
}

function buildTargetKey(
  kind: DashboardStorageTargetKind,
  backend: SqlBackend,
  dbIdentifier: string | null,
  catalog?: string | null,
): string {
  return `${kind}:${backend}:${dbIdentifier ?? "__runtime_default__"}:${catalog ?? "__current__"}`;
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
  sqlBackend: Extract<SqlBackend, "bridge">,
): DashboardStorageTarget {
  return {
    key: buildTargetKey("runtime-default", sqlBackend, null),
    kind: "runtime-default",
    dbIdentifier: null,
    sqlBackend,
    storageStatus: "shared",
  };
}

function createAttachedCatalogTarget(
  baseTarget: DashboardStorageTarget,
  catalog: string,
): DashboardStorageTarget {
  return {
    key: buildTargetKey(
      "attached-catalog",
      baseTarget.sqlBackend,
      baseTarget.dbIdentifier,
      catalog,
    ),
    kind: "attached-catalog",
    dbIdentifier: baseTarget.dbIdentifier,
    sqlBackend: baseTarget.sqlBackend,
    storageStatus: baseTarget.storageStatus,
    catalog,
    sourceKind: "attached",
  };
}

export function encodeAttachedDashboardId(input: {
  backend: SqlBackend;
  dbIdentifier?: string | null;
  catalog: string;
  dashboardId: string;
}): string {
  return [
    "attached",
    encodeURIComponent(input.backend),
    encodeURIComponent(input.dbIdentifier ?? ""),
    encodeURIComponent(input.catalog),
    encodeURIComponent(input.dashboardId),
  ].join(":");
}

export function decodeAttachedDashboardId(dashboardId: string): {
  backend: SqlBackend;
  dbIdentifier: string | null;
  catalog: string;
  dashboardId: string;
} | null {
  const parts = dashboardId.split(":");
  if (parts.length !== 5 || parts[0] !== "attached") {
    return null;
  }

  const backend = decodeURIComponent(parts[1]);
  if (backend !== "duckdb-wasm" && backend !== "bridge") {
    return null;
  }

  const catalog = decodeURIComponent(parts[3]);
  const originalDashboardId = decodeURIComponent(parts[4]);
  if (!catalog || !originalDashboardId) {
    return null;
  }

  const dbIdentifier = decodeURIComponent(parts[2]) || null;
  return {
    backend,
    dbIdentifier,
    catalog,
    dashboardId: originalDashboardId,
  };
}

function _createMotherDuckTarget(
  dbIdentifier: string,
  sqlBackend: Extract<SqlBackend, "bridge">,
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

function metadataSchemaRef(target: DashboardStorageTarget): string {
  return target.kind === "attached-catalog" && target.catalog
    ? `${quoteIdentifier(target.catalog)}.${quoteIdentifier(METADATA_SCHEMA)}`
    : quoteIdentifier(METADATA_SCHEMA);
}

function metadataTableRef(
  target: DashboardStorageTarget,
  tableName: string,
): string {
  return `${metadataSchemaRef(target)}.${quoteIdentifier(tableName)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveMetadataCatalogForTarget(
  target: DashboardStorageTarget,
): Promise<string | null> {
  if (target.kind === "attached-catalog") {
    return null;
  }

  const cached = metadataCatalogCache.get(target.key);
  if (cached !== undefined) {
    return cached;
  }

  const rows = await runStorageSql(
    target,
    "SELECT current_catalog() AS current_catalog;",
    { skipMetadataQualification: true },
  ).catch(() => []);
  const catalog = toNullableString(rows[0]?.current_catalog);
  const needsQualification =
    catalog?.toLowerCase() === METADATA_SCHEMA.toLowerCase();
  const resolved = needsQualification ? catalog : null;
  metadataCatalogCache.set(target.key, resolved);
  return resolved;
}

export function qualifyMetadataSqlForCatalog(
  sql: string,
  catalog: string | null,
): string {
  if (!catalog) {
    return sql;
  }

  const schemaRef = quoteIdentifier(METADATA_SCHEMA);
  const qualifiedSchemaRef = `${quoteIdentifier(catalog)}.${schemaRef}`;
  if (sql.includes(`${qualifiedSchemaRef}.`)) {
    return sql;
  }

  return replaceOutsideSqlStringLiterals(sql, (segment) =>
    segment
      .replace(
        new RegExp(
          `SCHEMA\\s+IF\\s+NOT\\s+EXISTS\\s+${escapeRegExp(schemaRef)}`,
          "gi",
        ),
        (match) => match.replace(schemaRef, qualifiedSchemaRef),
      )
      .replace(
        new RegExp(
          `${escapeRegExp(schemaRef)}\\.(?!${escapeRegExp(schemaRef)})`,
          "g",
        ),
        `${qualifiedSchemaRef}.`,
      ),
  );
}

function replaceOutsideSqlStringLiterals(
  sql: string,
  replaceSegment: (segment: string) => string,
): string {
  let output = "";
  let segmentStart = 0;
  let index = 0;

  while (index < sql.length) {
    if (sql[index] !== "'") {
      index += 1;
      continue;
    }

    output += replaceSegment(sql.slice(segmentStart, index));
    const literalStart = index;
    index += 1;

    while (index < sql.length) {
      if (sql[index] === "'") {
        if (sql[index + 1] === "'") {
          index += 2;
          continue;
        }
        index += 1;
        break;
      }
      index += 1;
    }

    output += sql.slice(literalStart, index);
    segmentStart = index;
  }

  output += replaceSegment(sql.slice(segmentStart));
  return output;
}

async function qualifyMetadataSqlForTarget(
  target: DashboardStorageTarget,
  sql: string,
): Promise<string> {
  const catalog = await resolveMetadataCatalogForTarget(target);
  return qualifyMetadataSqlForCatalog(sql, catalog);
}

function getDashboardStorageId(dashboardId: string): string {
  return decodeAttachedDashboardId(dashboardId)?.dashboardId ?? dashboardId;
}

function decorateDashboardRecordForTarget(
  target: DashboardStorageTarget,
  dashboard: DashboardRecord,
): DashboardRecord {
  if (target.kind !== "attached-catalog" || !target.catalog) {
    return dashboard;
  }

  return {
    ...dashboard,
    id: encodeAttachedDashboardId({
      backend: target.sqlBackend,
      dbIdentifier: target.dbIdentifier,
      catalog: target.catalog,
      dashboardId: dashboard.id,
    }),
    runtimeBackend: target.sqlBackend,
    homeDbIdentifier: target.dbIdentifier,
    homeSqlBackend: target.sqlBackend,
    originalId: dashboard.id,
    sourceKind: "attached",
    sourceCatalog: target.catalog,
  };
}

function decorateChartRecordForTarget(
  target: DashboardStorageTarget,
  chart: ChartRecord,
): ChartRecord {
  if (target.kind !== "attached-catalog" || !target.catalog) {
    return chart;
  }

  const dashboardId = encodeAttachedDashboardId({
    backend: target.sqlBackend,
    dbIdentifier: target.dbIdentifier,
    catalog: target.catalog,
    dashboardId: chart.dashboardId,
  });
  const sourceDescriptor = buildDashboardSourceDescriptor({
    runtimeBackend: target.sqlBackend,
    dbIdentifier: target.dbIdentifier,
    catalogContext: chart.catalogContext ?? target.catalog,
  });

  return {
    ...chart,
    dashboardId,
    catalogContext: chart.catalogContext ?? target.catalog,
    dbIdentifier: target.dbIdentifier,
    sqlBackend: target.sqlBackend,
    sourceDescriptor,
    sourceDescriptorJson: serializeDashboardSourceDescriptor(sourceDescriptor),
    sourceCatalogContext: chart.sourceCatalogContext ?? target.catalog,
  };
}

function decorateMeasureRecordForTarget(
  target: DashboardStorageTarget,
  measure: MeasureRecord,
): MeasureRecord {
  if (target.kind !== "attached-catalog" || !target.catalog) {
    return measure;
  }

  const dashboardId = encodeAttachedDashboardId({
    backend: target.sqlBackend,
    dbIdentifier: target.dbIdentifier,
    catalog: target.catalog,
    dashboardId: measure.dashboardId,
  });
  const sourceDescriptor = buildDashboardSourceDescriptor({
    runtimeBackend: target.sqlBackend,
    dbIdentifier: target.dbIdentifier,
    catalogContext: measure.catalogContext ?? target.catalog,
  });

  return {
    ...measure,
    dashboardId,
    catalogContext: measure.catalogContext ?? target.catalog,
    dbIdentifier: target.dbIdentifier,
    sqlBackend: target.sqlBackend,
    sourceDescriptor,
    sourceDescriptorJson: serializeDashboardSourceDescriptor(sourceDescriptor),
    sourceCatalogContext: measure.sourceCatalogContext ?? target.catalog,
  };
}

function _dashboardSnapshotSchema(dashboardId: string): string {
  const suffix = dashboardId.replace(/[^A-Za-z0-9_]/g, "_");
  return `pondview_snapshot_${suffix}`;
}

function _buildMaterializationTableRefs(
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

function _rewriteSqlToSnapshotTables(
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
  return sourceDbIdentifier
    ? detectExternalConnection(sourceDbIdentifier)
    : null;
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

  if (backend === "bridge") {
    return createRuntimeDefaultTarget(backend);
  }

  return createWasmTarget();
}

export function resolveTargetForSource(input: {
  sourceDescriptor?: DashboardSourceDescriptor | null;
  dbIdentifier?: string | null;
  sqlBackend?: SqlBackend | null;
}): DashboardStorageTarget {
  const sourceBackend =
    input.sourceDescriptor?.runtimeBackend ?? input.sqlBackend ?? null;

  if (sourceBackend === "bridge") {
    return createRuntimeDefaultTarget(sourceBackend);
  }

  if (sourceBackend === "duckdb-wasm") {
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
  addTarget(resolveDefaultStorageTarget());

  return Array.from(targets.values());
}

function createBaseTargetFromAttachedId(
  decoded: NonNullable<ReturnType<typeof decodeAttachedDashboardId>>,
): DashboardStorageTarget {
  const base =
    decoded.backend === "duckdb-wasm"
      ? createWasmTarget()
      : createRuntimeDefaultTarget(decoded.backend);

  return decoded.dbIdentifier && decoded.backend === "duckdb-wasm"
    ? {
        ...base,
        dbIdentifier: decoded.dbIdentifier,
        key: buildTargetKey(base.kind, base.sqlBackend, decoded.dbIdentifier),
      }
    : base;
}

async function resolveCurrentCatalogForTarget(
  target: DashboardStorageTarget,
): Promise<string | null> {
  const rows = await runStorageSql(
    target,
    "SELECT current_catalog() AS current_catalog;",
  ).catch(() => []);

  return toNullableString(rows[0]?.current_catalog);
}

async function discoverAttachedCatalogTargets(
  baseTargets: DashboardStorageTarget[],
): Promise<DashboardStorageTarget[]> {
  const attachedTargets = new Map<string, DashboardStorageTarget>();

  for (const baseTarget of baseTargets) {
    const currentCatalog = await resolveCurrentCatalogForTarget(baseTarget);
    const rows = await runStorageSql(
      baseTarget,
      `SELECT DISTINCT table_catalog
       FROM information_schema.tables
       WHERE table_schema = ${quoteString(METADATA_SCHEMA)}
         AND table_name = 'dashboards'
       ORDER BY table_catalog;`,
    ).catch(() => []);

    for (const row of rows) {
      const catalog = toNullableString(row.table_catalog);
      if (!catalog) {
        continue;
      }
      if (
        baseTarget.kind === "wasm-local" &&
        catalog === DEFAULT_WASM_DB_IDENTIFIER
      ) {
        continue;
      }
      if (
        currentCatalog &&
        catalog.toLowerCase() === currentCatalog.toLowerCase()
      ) {
        continue;
      }
      if (
        catalog.toLowerCase() === "memory" ||
        catalog.toLowerCase() === "main"
      ) {
        continue;
      }

      const target = createAttachedCatalogTarget(baseTarget, catalog);
      if (target.key !== baseTarget.key) {
        attachedTargets.set(target.key, target);
      }
    }
  }

  return Array.from(attachedTargets.values());
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
    columns: toNumber(row.columns, 4),
    autoFitRows: toBoolean(row.auto_fit_rows, false),
    runtimeBackend:
      normalizeSqlBackend(row.runtime_backend) ??
      normalizeSqlBackend(row.home_sql_backend) ??
      resolveDefaultStorageTarget().sqlBackend,
    activeSnapshotId: toNullableString(row.active_snapshot_id),
    homeDbIdentifier: toNullableString(row.home_db_identifier),
    homeSqlBackend:
      normalizeSqlBackend(row.home_sql_backend) ??
      normalizeSqlBackend(row.runtime_backend),
    storageStatus: normalizeStorageStatus(row.storage_status),
    projectPath: toNullableString(row.project_path),
  };
}

function normalizeChartRow(row: Record<string, unknown>): ChartRecord | null {
  const id = toTrimmedString(row.id);
  const dashboardId = toTrimmedString(row.dashboard_id);
  const sql = String(row.source_sql ?? row.sql ?? "");
  const chartConfigJson = String(row.chart_config_json ?? "");
  if (!id || !dashboardId || !chartConfigJson) {
    return null;
  }

  const sourceDescriptor =
    parseDashboardSourceDescriptorJson(row.source_descriptor_json) ??
    buildDashboardSourceDescriptor({
      runtimeBackend:
        normalizeSqlBackend(row.sql_backend) ??
        resolveDefaultStorageTarget().sqlBackend,
      dbIdentifier: toNullableString(row.db_identifier),
      catalogContext: toNullableString(row.catalog_context),
    });

  return {
    id,
    dashboardId,
    title: toNullableString(row.title),
    description: toNullableString(row.description),
    sql,
    sourceDescriptor,
    sourceDescriptorJson:
      serializeDashboardSourceDescriptor(sourceDescriptor) ?? null,
    snapshotId: toNullableString(row.snapshot_id),
    dbIdentifier: getDashboardSourceDescriptorDbIdentifier(sourceDescriptor),
    catalogContext:
      getDashboardSourceDescriptorCatalogContext(sourceDescriptor),
    sqlBackend: getDashboardSourceDescriptorRuntimeBackend(sourceDescriptor),
    chartConfigJson,
    semanticQueryJson: toNullableString(row.semantic_query_json),
    exploreName: toNullableString(row.explore_name),
    position: toNumber(row.position, 0),
    layoutX: row.layout_x == null ? null : toNumber(row.layout_x, 0),
    layoutY: row.layout_y == null ? null : toNumber(row.layout_y, 0),
    layoutW: row.layout_w == null ? null : toNumber(row.layout_w, 1),
    layoutH: row.layout_h == null ? null : toNumber(row.layout_h, 3),
    createdAt: toNumber(row.created_at, Date.now()),
    updatedAt: toNumber(row.updated_at, Date.now()),
    sourceSql: sql,
    sourceDbIdentifier:
      getDashboardSourceDescriptorDbIdentifier(sourceDescriptor),
    sourceCatalogContext:
      getDashboardSourceDescriptorCatalogContext(sourceDescriptor),
    sourceSqlBackend:
      getDashboardSourceDescriptorRuntimeBackend(sourceDescriptor),
  };
}

function normalizeMeasureRow(
  row: Record<string, unknown>,
): MeasureRecord | null {
  const id = toTrimmedString(row.id);
  const dashboardId = toTrimmedString(row.dashboard_id);
  const key = toTrimmedString(row.key);
  const label = toTrimmedString(row.label);
  const sql = String(row.source_sql ?? row.sql ?? "");
  if (!id || !dashboardId || !key || !label) {
    return null;
  }

  const sourceDescriptor =
    parseDashboardSourceDescriptorJson(row.source_descriptor_json) ??
    buildDashboardSourceDescriptor({
      runtimeBackend:
        normalizeSqlBackend(row.sql_backend) ??
        resolveDefaultStorageTarget().sqlBackend,
      dbIdentifier: toNullableString(row.db_identifier),
      catalogContext: toNullableString(row.catalog_context),
    });

  return {
    id,
    dashboardId,
    key,
    label,
    sql,
    sourceDescriptor,
    sourceDescriptorJson:
      serializeDashboardSourceDescriptor(sourceDescriptor) ?? null,
    snapshotId: toNullableString(row.snapshot_id),
    dbIdentifier: getDashboardSourceDescriptorDbIdentifier(sourceDescriptor),
    catalogContext:
      getDashboardSourceDescriptorCatalogContext(sourceDescriptor),
    sqlBackend: getDashboardSourceDescriptorRuntimeBackend(sourceDescriptor),
    createdAt: toNumber(row.created_at, Date.now()),
    updatedAt: toNumber(row.updated_at, Date.now()),
    sourceSql: sql,
    sourceDbIdentifier:
      getDashboardSourceDescriptorDbIdentifier(sourceDescriptor),
    sourceCatalogContext:
      getDashboardSourceDescriptorCatalogContext(sourceDescriptor),
    sourceSqlBackend:
      getDashboardSourceDescriptorRuntimeBackend(sourceDescriptor),
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
    skipMetadataQualification?: boolean;
  } = {},
): Promise<Record<string, unknown>[]> {
  const executableSql = options.skipMetadataQualification
    ? sql
    : await qualifyMetadataSqlForTarget(target, sql);
  const result = await runQuery({
    sql: executableSql,
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

async function _canExecuteSqlInTargetRuntime(
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
         ${
           target.kind === "attached-catalog" && target.catalog
             ? `AND table_catalog = ${quoteString(target.catalog)}`
             : ""
}
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
    `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(EXEC_SCHEMA)};`,
    `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(SNAPSHOT_SCHEMA)};`,
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)}.dashboards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      columns INTEGER NOT NULL DEFAULT 4,
      auto_fit_rows BOOLEAN NOT NULL DEFAULT FALSE,
      runtime_backend TEXT NOT NULL,
      active_snapshot_id TEXT,
      home_db_identifier TEXT,
      home_sql_backend TEXT,
      storage_status TEXT NOT NULL DEFAULT 'best-effort',
      project_path TEXT
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
      source_sql TEXT NOT NULL,
      source_descriptor_json TEXT NOT NULL,
      snapshot_id TEXT,
      chart_config_json TEXT NOT NULL,
      semantic_query_json TEXT,
      explore_name TEXT,
      position INTEGER NOT NULL,
      layout_x INTEGER,
      layout_y INTEGER,
      layout_w INTEGER,
      layout_h INTEGER,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
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
      source_sql TEXT NOT NULL,
      source_descriptor_json TEXT NOT NULL,
      snapshot_id TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
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
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_source_caches (
      cache_id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      source_descriptor_hash TEXT NOT NULL,
      source_descriptor_json TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_cache_tables (
      cache_id TEXT NOT NULL,
      dashboard_id TEXT NOT NULL,
      canonical_table_name TEXT NOT NULL,
      cache_table_name TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (cache_id, canonical_table_name)
    );`,
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      source_snapshot_id TEXT,
      source_descriptor_json TEXT NOT NULL,
      canonical_table_name TEXT NOT NULL,
      snapshot_table_name TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboards
     ADD COLUMN IF NOT EXISTS runtime_backend TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboards
     ADD COLUMN IF NOT EXISTS active_snapshot_id TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboards
     ADD COLUMN IF NOT EXISTS project_path TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS sql TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS db_identifier TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS catalog_context TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS sql_backend TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS source_sql TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS source_descriptor_json TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS snapshot_id TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS layout_x INTEGER;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS layout_y INTEGER;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS layout_w INTEGER;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS layout_h INTEGER;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS sql TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS db_identifier TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS catalog_context TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS sql_backend TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS source_sql TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS source_descriptor_json TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS snapshot_id TEXT;`,
    `ALTER TABLE ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_cache_tables
     ADD COLUMN IF NOT EXISTS dashboard_id TEXT;`,
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
     FROM ${metadataTableRef(target, "dashboards")}
     ORDER BY updated_at DESC;`,
  );

  return rows
    .map((row) => normalizeDashboardRow(row))
    .filter((row): row is DashboardRecord => row !== null)
    .map((dashboard) => decorateDashboardRecordForTarget(target, dashboard));
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
     FROM ${metadataTableRef(target, "dashboards")}
     WHERE id = ${quoteString(getDashboardStorageId(dashboardId))}
     LIMIT 1;`,
  );

  const dashboard = normalizeDashboardRow(rows[0] ?? {}) ?? null;
  return dashboard ? decorateDashboardRecordForTarget(target, dashboard) : null;
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
     FROM ${metadataTableRef(target, "dashboard_charts")}
     WHERE id = ${quoteString(chartId)}
     LIMIT 1;`,
  );

  const chart = normalizeChartRow(rows[0] ?? {}) ?? null;
  return chart ? decorateChartRecordForTarget(target, chart) : null;
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
     FROM ${metadataTableRef(target, "dashboard_measures")}
     WHERE id = ${quoteString(measureId)}
     LIMIT 1;`,
  );

  const measure = normalizeMeasureRow(rows[0] ?? {}) ?? null;
  return measure ? decorateMeasureRecordForTarget(target, measure) : null;
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
     FROM ${metadataTableRef(target, "dashboard_charts")}
     WHERE dashboard_id = ${quoteString(getDashboardStorageId(dashboardId))}
     ORDER BY position ASC;`,
  );

  return rows
    .map((row) => normalizeChartRow(row))
    .filter((row): row is ChartRecord => row !== null)
    .map((chart) => decorateChartRecordForTarget(target, chart));
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
     FROM ${metadataTableRef(target, "dashboard_measures")}
     WHERE dashboard_id = ${quoteString(getDashboardStorageId(dashboardId))}
     ORDER BY label ASC;`,
  );

  return rows
    .map((row) => normalizeMeasureRow(row))
    .filter((row): row is MeasureRecord => row !== null)
    .map((measure) => decorateMeasureRecordForTarget(target, measure));
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
     FROM ${metadataTableRef(target, "dashboard_slicers")}
     WHERE dashboard_id = ${quoteString(getDashboardStorageId(dashboardId))}
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
     FROM ${metadataTableRef(target, "chart_slicers")}
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
     FROM ${metadataTableRef(target, "dashboard_join_defs")}
     WHERE dashboard_id = ${quoteString(getDashboardStorageId(dashboardId))}
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
      runtime_backend,
      active_snapshot_id,
      home_db_identifier,
      home_sql_backend,
      storage_status,
      project_path
    ) VALUES (
      ${quoteString(dashboard.id)},
      ${quoteString(dashboard.title)},
      ${dashboard.createdAt},
      ${dashboard.updatedAt},
      ${dashboard.columns},
      ${sqlBoolean(dashboard.autoFitRows)},
      ${quoteString(dashboard.runtimeBackend)},
      ${sqlNullableString(dashboard.activeSnapshotId)},
      ${sqlNullableString(dashboard.homeDbIdentifier)},
      ${sqlNullableBackend(dashboard.homeSqlBackend)},
      ${quoteString(dashboard.storageStatus ?? "best-effort")},
      ${sqlNullableString(dashboard.projectPath)}
    );`,
  );
}

async function upsertChartRecord(
  target: DashboardStorageTarget,
  chart: ChartRecord,
): Promise<void> {
  await ensureMetadataSchema(target);
  const sourceDescriptorJson =
    chart.sourceDescriptorJson ??
    serializeDashboardSourceDescriptor(chart.sourceDescriptor ?? null);
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
      source_sql,
      source_descriptor_json,
      snapshot_id,
      chart_config_json,
      semantic_query_json,
      explore_name,
      position,
      layout_x,
      layout_y,
      layout_w,
      layout_h,
      created_at,
      updated_at
    ) VALUES (
      ${quoteString(chart.id)},
      ${quoteString(chart.dashboardId)},
      ${sqlNullableString(chart.title)},
      ${sqlNullableString(chart.description)},
      ${quoteString(chart.sql)},
      ${sqlNullableString(chart.dbIdentifier)},
      ${sqlNullableString(chart.catalogContext ?? null)},
      ${sqlNullableBackend(chart.sqlBackend)},
      ${quoteString(chart.sql)},
      ${quoteString(sourceDescriptorJson ?? "{}")},
      ${sqlNullableString(chart.snapshotId ?? null)},
      ${quoteString(chart.chartConfigJson)},
      ${sqlNullableString(chart.semanticQueryJson)},
      ${sqlNullableString(chart.exploreName)},
      ${chart.position},
      ${chart.layoutX ?? "NULL"},
      ${chart.layoutY ?? "NULL"},
      ${chart.layoutW ?? "NULL"},
      ${chart.layoutH ?? "NULL"},
      ${chart.createdAt},
      ${chart.updatedAt}
    );`,
  );
}

function rectanglesOverlap(
  left: { x: number; y: number; w: number; h: number },
  right: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y
  );
}

export function getInitialChartLayout(
  charts: ChartRecord[],
  columns: number | null | undefined,
  chartConfigJson: string,
): { layoutX: number; layoutY: number; layoutW: number; layoutH: number } {
  const gridColumns = Math.max(1, columns ?? 4);
  let requestedWidth = 1;
  try {
    const parsed = JSON.parse(chartConfigJson) as { colSpan?: unknown };
    if (typeof parsed.colSpan === "number" && Number.isFinite(parsed.colSpan)) {
      requestedWidth = parsed.colSpan;
    }
  } catch {
    requestedWidth = 1;
  }

  const layoutW = Math.min(
    gridColumns,
    Math.max(1, Math.round(requestedWidth)),
  );
  const layoutH = 3;
  const occupied = charts.map((chart) => {
    const w = Math.min(
      gridColumns,
      Math.max(1, Math.round(chart.layoutW ?? 1)),
    );
    return {
      x: Math.min(
        Math.max(0, Math.round(chart.layoutX ?? chart.position % gridColumns)),
        Math.max(0, gridColumns - w),
      ),
      y: Math.max(
        0,
        Math.round(
          chart.layoutY ?? Math.floor(chart.position / gridColumns) * 3,
        ),
      ),
      w,
      h: Math.max(1, Math.round(chart.layoutH ?? 3)),
    };
  });

  const bottom = occupied.reduce(
    (max, chart) => Math.max(max, chart.y + chart.h),
    0,
  );
  const candidateRows = Array.from(
    new Set([
      0,
      ...occupied.flatMap((chart) => [chart.y, chart.y + chart.h]),
      bottom,
    ]),
  ).sort((left, right) => left - right);

  for (const layoutY of candidateRows) {
    for (let layoutX = 0; layoutX <= gridColumns - layoutW; layoutX += 1) {
      const candidate = { x: layoutX, y: layoutY, w: layoutW, h: layoutH };
      if (!occupied.some((chart) => rectanglesOverlap(candidate, chart))) {
        return { layoutX, layoutY, layoutW, layoutH };
      }
    }
  }

  return { layoutX: 0, layoutY: bottom, layoutW, layoutH };
}

async function upsertMeasureRecord(
  target: DashboardStorageTarget,
  measure: MeasureRecord,
): Promise<void> {
  await ensureMetadataSchema(target);
  const sourceDescriptorJson =
    measure.sourceDescriptorJson ??
    serializeDashboardSourceDescriptor(measure.sourceDescriptor ?? null);
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
      source_sql,
      source_descriptor_json,
      snapshot_id,
      created_at,
      updated_at
    ) VALUES (
      ${quoteString(measure.id)},
      ${quoteString(measure.dashboardId)},
      ${quoteString(measure.key)},
      ${quoteString(measure.label)},
      ${quoteString(measure.sql)},
      ${sqlNullableString(measure.dbIdentifier)},
      ${sqlNullableString(measure.catalogContext ?? null)},
      ${sqlNullableBackend(measure.sqlBackend)},
      ${quoteString(measure.sql)},
      ${quoteString(sourceDescriptorJson ?? "{}")},
      ${sqlNullableString(measure.snapshotId ?? null)},
      ${measure.createdAt},
      ${measure.updatedAt}
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
  await syncDashboardToOpenProject(target, dashboardId);
}

async function syncDashboardToOpenProject(
  target: DashboardStorageTarget,
  dashboardId: string,
): Promise<void> {
  const dashboard = await getDashboardFromTarget(target, dashboardId);
  if (!dashboard) {
    return;
  }

  const [charts, measures, slicers, joins] = await Promise.all([
    listChartsFromTarget(target, dashboardId),
    listMeasuresFromTarget(target, dashboardId),
    listDashboardSlicersFromTarget(target, dashboardId),
    listJoinDefsFromTarget(target, dashboardId),
  ]);

  const synced = await syncDashboardProjectArtifact({
    dashboard,
    charts,
    measures,
    slicers,
    joins,
  });

  if (synced && synced.projectPath !== dashboard.projectPath) {
    await upsertDashboardRecord(target, {
      ...dashboard,
      projectPath: synced.projectPath,
    });
  }
}

function assertDashboardSourceCompatible(
  dashboard: DashboardRecord,
  sourceDescriptor: DashboardSourceDescriptor | null,
): void {
  if (!sourceDescriptor) {
    return;
  }

  if (sourceDescriptor.runtimeBackend !== dashboard.runtimeBackend) {
    throw new Error(
      `Dashboard backend mismatch: expected ${dashboard.runtimeBackend} but received ${sourceDescriptor.runtimeBackend}.`,
    );
  }
}

async function buildPreparedSqlPayload(
  target: DashboardStorageTarget,
  input: {
    sql: string;
    sourceDescriptor?: DashboardSourceDescriptor | null;
    dbIdentifier?: string | null;
    catalogContext?: string | null;
    sqlBackend?: SqlBackend | null;
  },
): Promise<PreparedSqlPayload> {
  const sourceDescriptor =
    input.sourceDescriptor ??
    (input.sqlBackend
      ? buildDashboardSourceDescriptor({
          runtimeBackend: input.sqlBackend,
          dbIdentifier: input.dbIdentifier,
          catalogContext: input.catalogContext,
        })
      : buildDashboardSourceDescriptor({
          runtimeBackend: target.sqlBackend,
          dbIdentifier: input.dbIdentifier,
          catalogContext: input.catalogContext,
        }));

  return {
    sql: input.sql,
    sourceDescriptor,
    sourceDescriptorJson:
      serializeDashboardSourceDescriptor(sourceDescriptor) ?? null,
    snapshotId: null,
    dbIdentifier: getDashboardSourceDescriptorDbIdentifier(sourceDescriptor),
    catalogContext:
      getDashboardSourceDescriptorCatalogContext(sourceDescriptor),
    sqlBackend:
      getDashboardSourceDescriptorRuntimeBackend(sourceDescriptor) ??
      target.sqlBackend,
  };
}

export class DashboardStorageService {
  private async resolveDashboardTarget(dashboardId: string): Promise<{
    target: DashboardStorageTarget;
    dashboard: DashboardRecord;
  } | null> {
    const decodedAttachedId = decodeAttachedDashboardId(dashboardId);
    if (decodedAttachedId) {
      const target = createAttachedCatalogTarget(
        createBaseTargetFromAttachedId(decodedAttachedId),
        decodedAttachedId.catalog,
      );
      const dashboard = await getDashboardFromTarget(
        target,
        decodedAttachedId.dashboardId,
      ).catch(() => null);
      return dashboard ? { target, dashboard } : null;
    }

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
    const attachedTargets = await discoverAttachedCatalogTargets(targets);
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

    for (const target of attachedTargets) {
      const dashboards = await listDashboardsFromTarget(target).catch(() => []);
      for (const dashboard of dashboards) {
        dashboardsById.set(dashboard.id, dashboard);
      }
    }

    return Array.from(dashboardsById.values()).sort(
      (left, right) => right.updatedAt - left.updatedAt,
    );
  }

  async createDashboard(
    title: string,
    input: {
      sourceDescriptor?: DashboardSourceDescriptor | null;
      dbIdentifier?: string | null;
      joinDefs?: JoinDefinition[];
      sqlBackend?: SqlBackend | null;
      now?: number;
    } = {},
  ): Promise<{ id: string }> {
    const now = input.now ?? Date.now();
    const id = nanoid();
    const target = resolveTargetForSource(input);
    const runtimeBackend =
      input.sourceDescriptor?.runtimeBackend ??
      input.sqlBackend ??
      target.sqlBackend;

    await upsertDashboardRecord(target, {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      columns: 4,
      autoFitRows: false,
      runtimeBackend,
      activeSnapshotId: null,
      homeDbIdentifier: storedDbIdentifierForTarget(target),
      homeSqlBackend: runtimeBackend,
      storageStatus: target.storageStatus,
    });

    await replaceJoinDefsInTarget(
      target,
      id,
      resolveJoinDefsForNewDashboard(input.joinDefs),
    );
    await syncDashboardToOpenProject(target, id);
    return { id };
  }

  async replaceDashboardFromProject(input: {
    dashboard: WorkspaceDashboard;
    charts: WorkspaceChart[];
    measures: WorkspaceDashboardMeasure[];
    slicers: WorkspaceDashboardSlicer[];
    joinDefs: JoinDefinition[];
  }): Promise<{ id: string }> {
    const target = resolveTargetForSource({
      dbIdentifier: input.dashboard.homeDbIdentifier ?? null,
      sqlBackend:
        input.dashboard.homeSqlBackend ??
        input.dashboard.runtimeBackend ??
        null,
    });
    const runtimeBackend =
      input.dashboard.runtimeBackend ??
      input.dashboard.homeSqlBackend ??
      target.sqlBackend;
    const now = input.dashboard.updatedAt || Date.now();

    await ensureMetadataSchema(target);
    await runStorageStatements(target, [
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.chart_slicers
       WHERE chart_id IN (
         SELECT id
         FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
         WHERE dashboard_id = ${quoteString(input.dashboard.id)}
       );`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_charts
       WHERE dashboard_id = ${quoteString(input.dashboard.id)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_measures
       WHERE dashboard_id = ${quoteString(input.dashboard.id)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_slicers
       WHERE dashboard_id = ${quoteString(input.dashboard.id)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_join_defs
       WHERE dashboard_id = ${quoteString(input.dashboard.id)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_cache_tables
       WHERE dashboard_id = ${quoteString(input.dashboard.id)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_source_caches
       WHERE dashboard_id = ${quoteString(input.dashboard.id)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_snapshots
       WHERE dashboard_id = ${quoteString(input.dashboard.id)};`,
    ]);

    await upsertDashboardRecord(target, {
      ...input.dashboard,
      createdAt: input.dashboard.createdAt || now,
      updatedAt: now,
      columns: input.dashboard.columns ?? 4,
      autoFitRows: input.dashboard.autoFitRows ?? false,
      runtimeBackend,
      activeSnapshotId: null,
      homeDbIdentifier: storedDbIdentifierForTarget(target),
      homeSqlBackend: runtimeBackend,
      storageStatus: target.storageStatus,
    });
    await replaceJoinDefsInTarget(target, input.dashboard.id, input.joinDefs);

    for (const measure of input.measures) {
      await upsertMeasureRecord(target, {
        ...measure,
        dashboardId: input.dashboard.id,
        snapshotId: null,
      });
    }
    for (const chart of input.charts) {
      await upsertChartRecord(target, {
        ...chart,
        dashboardId: input.dashboard.id,
        snapshotId: null,
      });
    }
    for (const slicer of input.slicers) {
      await upsertDashboardSlicerRecord(target, {
        ...slicer,
        dashboardId: input.dashboard.id,
      });
    }

    return { id: input.dashboard.id };
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
    await syncDashboardToOpenProject(resolved.target, dashboardId);

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
    await syncDashboardToOpenProject(resolved.target, dashboardId);

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
    sourceDescriptor?: DashboardSourceDescriptor | null;
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
    const prepared = await buildPreparedSqlPayload(resolved.target, input);
    assertDashboardSourceCompatible(
      resolved.dashboard,
      prepared.sourceDescriptor,
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
      sourceDescriptor: prepared.sourceDescriptor,
      sourceDescriptorJson: prepared.sourceDescriptorJson,
      snapshotId: prepared.snapshotId,
      sourceSql: prepared.sql,
      sourceDbIdentifier: prepared.dbIdentifier,
      sourceCatalogContext: prepared.catalogContext,
      sourceSqlBackend: prepared.sqlBackend,
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
      sourceDescriptor?: DashboardSourceDescriptor | null;
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
    const dashboardResolved = await this.resolveDashboardTarget(
      resolved.measure.dashboardId,
    );
    if (!dashboardResolved) {
      return { updated: false };
    }

    const now = input.now ?? Date.now();
    const prepared =
      input.sql !== undefined ||
      input.dbIdentifier !== undefined ||
      input.catalogContext !== undefined ||
      input.sqlBackend !== undefined
        ? await buildPreparedSqlPayload(resolved.target, {
            sql: input.sql ?? resolved.measure.sql,
            sourceDescriptor:
              input.sourceDescriptor ??
              resolved.measure.sourceDescriptor ??
              buildDashboardSourceDescriptor({
                runtimeBackend:
                  resolved.measure.sqlBackend ?? resolved.target.sqlBackend,
                dbIdentifier: resolved.measure.dbIdentifier,
                catalogContext: resolved.measure.catalogContext ?? null,
              }),
            dbIdentifier: input.dbIdentifier,
            catalogContext: input.catalogContext,
            sqlBackend: input.sqlBackend,
          })
        : null;
    assertDashboardSourceCompatible(
      dashboardResolved.dashboard,
      prepared?.sourceDescriptor ?? resolved.measure.sourceDescriptor ?? null,
    );

    await upsertMeasureRecord(resolved.target, {
      ...resolved.measure,
      label: input.label ?? resolved.measure.label,
      sql: prepared?.sql ?? resolved.measure.sql,
      dbIdentifier: prepared?.dbIdentifier ?? resolved.measure.dbIdentifier,
      catalogContext:
        prepared?.catalogContext ?? resolved.measure.catalogContext,
      sqlBackend: prepared?.sqlBackend ?? resolved.measure.sqlBackend,
      sourceDescriptor:
        prepared?.sourceDescriptor ?? resolved.measure.sourceDescriptor,
      sourceDescriptorJson:
        prepared?.sourceDescriptorJson ?? resolved.measure.sourceDescriptorJson,
      snapshotId: prepared?.snapshotId ?? resolved.measure.snapshotId,
      sourceSql: prepared?.sql ?? resolved.measure.sourceSql,
      sourceDbIdentifier:
        prepared?.dbIdentifier ?? resolved.measure.sourceDbIdentifier,
      sourceCatalogContext:
        prepared?.catalogContext ?? resolved.measure.sourceCatalogContext,
      sourceSqlBackend:
        prepared?.sqlBackend ?? resolved.measure.sourceSqlBackend,
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
        sourceDescriptor: prepared?.sourceDescriptor ?? chart.sourceDescriptor,
        sourceDescriptorJson:
          prepared?.sourceDescriptorJson ?? chart.sourceDescriptorJson,
        snapshotId: prepared?.snapshotId ?? chart.snapshotId,
        sourceSql: prepared?.sql ?? chart.sourceSql,
        sourceDbIdentifier: prepared?.dbIdentifier ?? chart.sourceDbIdentifier,
        sourceCatalogContext:
          prepared?.catalogContext ?? chart.sourceCatalogContext,
        sourceSqlBackend: prepared?.sqlBackend ?? chart.sourceSqlBackend,
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
    sourceDescriptor?: DashboardSourceDescriptor | null;
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
    const prepared = await buildPreparedSqlPayload(resolved.target, input);
    assertDashboardSourceCompatible(
      resolved.dashboard,
      prepared.sourceDescriptor,
    );

    const id = nanoid();
    const maxPosition = charts.reduce(
      (max, chart) => Math.max(max, chart.position),
      -1,
    );

    const initialLayout = getInitialChartLayout(
      charts,
      resolved.dashboard.columns,
      input.chartConfigJson,
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
      ...initialLayout,
      createdAt: now,
      updatedAt: now,
      sourceDescriptor: prepared.sourceDescriptor,
      sourceDescriptorJson: prepared.sourceDescriptorJson,
      snapshotId: prepared.snapshotId,
      sourceSql: prepared.sql,
      sourceDbIdentifier: prepared.dbIdentifier,
      sourceCatalogContext: prepared.catalogContext,
      sourceSqlBackend: prepared.sqlBackend,
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

  async updateChartLayout(
    chartId: string,
    layout: { x: number; y: number; w: number; h: number },
    position: number,
    now = Date.now(),
  ): Promise<{ updated: boolean }> {
    const resolved = await this.resolveChartTarget(chartId);
    if (!resolved) {
      return { updated: false };
    }

    await upsertChartRecord(resolved.target, {
      ...resolved.chart,
      position,
      layoutX: layout.x,
      layoutY: layout.y,
      layoutW: layout.w,
      layoutH: layout.h,
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
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_cache_tables
       WHERE dashboard_id = ${quoteString(dashboardId)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_source_caches
       WHERE dashboard_id = ${quoteString(dashboardId)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboard_snapshots
       WHERE dashboard_id = ${quoteString(dashboardId)};`,
      `DELETE FROM ${quoteIdentifier(METADATA_SCHEMA)}.dashboards
       WHERE id = ${quoteString(dashboardId)};`,
    ]);
    await deleteDashboardProjectArtifact({
      title: resolved.dashboard.title,
      projectPath: resolved.dashboard.projectPath ?? null,
    });

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
