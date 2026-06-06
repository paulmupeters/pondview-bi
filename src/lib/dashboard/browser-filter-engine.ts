import {
  buildDashboardExecutionTableRefs,
  type DashboardExecutionTableRef,
  EXECUTION_ALIAS_SCHEMA,
  getExecutionAliasRef,
  type PlannedDashboardExecutionTableRef,
  planDashboardExecutionTableRefs,
  quoteExecutionIdentifier,
  type RealizedExecutionAliasKind,
  resolveChartSourceDescriptor,
} from "@/lib/dashboard/execution-plan";
import {
  buildDashboardSourceDescriptor,
  type DashboardSourceDescriptor,
} from "@/lib/dashboard/source-descriptor";
import {
  buildAttachmentPlan,
  buildDetachStatement,
} from "@/lib/duckdb/duckdb-attachments";
import { detectExternalConnection } from "@/lib/duckdb/path";
import { isSqlBackedSourceConnection } from "@/lib/duckdb/source-setup";
import { applyFiltersToSql } from "@/lib/filters/apply-filters";
import { extractTableReferencesFromSql } from "@/lib/filters/parse-tables";
import { canonicalTable, type JoinDefinition } from "@/lib/joins/graph";
import { runQuery } from "@/lib/sql/run-query";
import { resolveSqlRuntimeFingerprint } from "@/lib/sql/runtime-fingerprint";
import {
  getSqlBackendPreference,
  resolveSqlBackend,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import type { Result } from "@/lib/types";
import type { AvailableDimension, Filter } from "@/lib/types/filters";
import {
  type DbDashboardChart,
  listChartsByDashboard,
  listJoinDefsByDashboard,
} from "@/lib/workspace/dashboard-repo";

export type MaterializedTableRef = DashboardExecutionTableRef;
export type MaterializationStrategy =
  PlannedDashboardExecutionTableRef["strategy"];
export type MaterializedAliasKind = RealizedExecutionAliasKind;
export type PlannedMaterializedTableRef = PlannedDashboardExecutionTableRef;

type MaterializationCacheEntry = {
  signature: string;
  runtimeFingerprint: string;
  tableRefs: MaterializedTableRef[];
  plannedTables: PlannedMaterializedTableRef[];
  resolvedRefByTable: Map<string, string>;
  realizedAliasKindByTable: Map<string, MaterializedAliasKind>;
  materializedTables: Set<string>;
  backend: SqlBackend;
};

const materializationCache = new Map<string, MaterializationCacheEntry>();
const inflightMaterializationCache = new Map<
  string,
  {
    signature: string;
    promise: Promise<MaterializationCacheEntry>;
  }
>();

export type DashboardFilterExecutionMetadata = {
  filtersApplied: boolean;
  appliedFiltersCount: number;
  skippedFilters: Array<{ field: string; reason: string }>;
  errorMessage?: string;
};

export type DashboardFilterExecutionResult = {
  rowsByChartId: Record<string, Result[]>;
  metadataByChartId: Record<string, DashboardFilterExecutionMetadata>;
  backend: SqlBackend;
};

export type BrowserFilterEngineDeps = {
  runRuntimeSql: (
    sql: string,
    backend: SqlBackend,
    catalogContext?: string | null,
  ) => Promise<Record<string, unknown>[]>;
  runChartSql: (
    chart: DbDashboardChart,
    backend: SqlBackend,
  ) => Promise<Result[]>;
  resolveBackend: () => SqlBackend;
  resolveRuntimeFingerprint: (backend: SqlBackend) => Promise<string>;
  readJoinDefs: (dashboardId: string) => Promise<JoinDefinition[]>;
  listCharts: (dashboardId: string) => Promise<DbDashboardChart[]>;
  getMaterializationCache: () => Map<string, MaterializationCacheEntry>;
};

function referencesExecutionAliasSchema(value: string): boolean {
  return (
    value.includes(`${EXECUTION_ALIAS_SCHEMA}.`) ||
    value.includes(`"${EXECUTION_ALIAS_SCHEMA}".`)
  );
}

function resolveCatalogContextForReference(
  reference: string,
  catalogContext?: string | null,
): string | null {
  return referencesExecutionAliasSchema(reference)
    ? null
    : (catalogContext ?? null);
}

function isMissingCatalogContextError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("SET schema: No catalog + schema named") ||
    message.includes("No catalog + schema named")
  );
}

function buildExecutionAttachmentAlias(tableName: string): string {
  const sanitized = tableName.replace(/[^A-Za-z0-9_]/g, "_") || "source";
  const nonce = Math.random().toString(36).slice(2, 10);
  return `${EXECUTION_ALIAS_SCHEMA}_source_${sanitized}_${nonce}`;
}

function splitSimpleIdentifierReference(reference: string): string[] | null {
  const trimmed = reference.trim();
  if (!trimmed) {
    return null;
  }

  const parts: string[] = [];
  let current = "";
  let quote: '"' | "`" | null = null;

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];

    if (quote) {
      current += character;
      if (character === quote) {
        const next = trimmed[index + 1];
        if (next === quote) {
          current += next;
          index += 1;
          continue;
        }
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "`") {
      current += character;
      quote = character;
      continue;
    }

    if (character === ".") {
      const part = current.trim();
      if (!part) {
        return null;
      }
      parts.push(part);
      current = "";
      continue;
    }

    current += character;
  }

  if (quote) {
    return null;
  }

  const finalPart = current.trim();
  if (!finalPart) {
    return null;
  }

  parts.push(finalPart);
  return parts;
}

function normalizeReferencePart(part: string): string {
  const trimmed = part.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/""/g, '"').toLowerCase();
  }

  if (trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/``/g, "`").toLowerCase();
  }

  return trimmed.toLowerCase();
}

function buildMaterializationSourceReference(
  tableRef: PlannedMaterializedTableRef,
  attachedCatalogAlias?: string,
): string {
  const trimmed = tableRef.sourceReference.trim();
  const parts = splitSimpleIdentifierReference(trimmed);
  if (!parts || parts.length === 0) {
    return trimmed;
  }

  if (attachedCatalogAlias) {
    const attachedCatalogRef = quoteExecutionIdentifier(attachedCatalogAlias);
    const first = normalizeReferencePart(parts[0]);

    if (parts.length === 1) {
      return `${attachedCatalogRef}.${parts[0]}`;
    }

    if (first === "motherduck") {
      return `${attachedCatalogRef}.${parts.slice(1).join(".")}`;
    }

    if (parts.length === 2 && (first === "main" || first === "public")) {
      return `${attachedCatalogRef}.${parts[1]}`;
    }

    return `${attachedCatalogRef}.${parts.join(".")}`;
  }

  if (parts.length === 1) {
    return `${quoteExecutionIdentifier("main")}.${parts[0]}`;
  }

  return trimmed;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Failed to execute dashboard query.";
}

function defaultDeps(): BrowserFilterEngineDeps {
  return {
    runRuntimeSql: runDashboardRuntimeSql,
    runChartSql,
    resolveBackend: resolveActiveBackend,
    resolveRuntimeFingerprint: resolveRuntimeFingerprintForBackend,
    readJoinDefs: listJoinDefsByDashboard,
    listCharts: listChartsByDashboard,
    getMaterializationCache: () => materializationCache,
  };
}

function resolveDeps(
  overrides: Partial<BrowserFilterEngineDeps> = {},
): BrowserFilterEngineDeps {
  return {
    ...defaultDeps(),
    ...overrides,
  };
}

export function clearDashboardMaterializationCache(): void {
  materializationCache.clear();
  inflightMaterializationCache.clear();
}

export function buildMaterializationSignature(
  charts: Array<{
    id: string;
    sql: string;
    catalogContext?: string | null;
    sourceDescriptor?: DbDashboardChart["sourceDescriptor"];
  }>,
  joinDefs: JoinDefinition[],
): string {
  const chartSignature = charts
    .map(
      (chart) =>
        `${chart.id}:${chart.catalogContext ?? "__no_catalog__"}:${chart.sql}:${JSON.stringify(chart.sourceDescriptor ?? null)}`,
    )
    .sort()
    .join("|");
  const joinSignature = joinDefs
    .map((joinDef) =>
      [
        canonicalTable(joinDef.leftTable),
        joinDef.leftColumn,
        canonicalTable(joinDef.rightTable),
        joinDef.rightColumn,
        joinDef.type ?? "left",
      ].join(":"),
    )
    .sort()
    .join("|");

  return `${chartSignature}__${joinSignature}`;
}

/**
 * Returns the set of canonical table names relevant to a single chart,
 * including all tables reachable through the join graph.
 */
export function getRelevantTablesForChart(
  chartSql: string,
  joinDefs: JoinDefinition[],
): Set<string> {
  const tables = new Set<string>();
  const pending: string[] = [];
  const refs = extractTableReferencesFromSql(chartSql);
  for (const ref of refs) {
    const tableName = canonicalTable(ref.tableName);
    if (tableName && !tables.has(tableName)) {
      tables.add(tableName);
      pending.push(tableName);
    }
  }

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) {
      continue;
    }

    for (const joinDef of joinDefs) {
      const left = canonicalTable(joinDef.leftTable);
      const right = canonicalTable(joinDef.rightTable);
      if (!left || !right) {
        continue;
      }
      if (left === current && !tables.has(right)) {
        tables.add(right);
        pending.push(right);
      }
      if (right === current && !tables.has(left)) {
        tables.add(left);
        pending.push(left);
      }
    }
  }

  return tables;
}

export function buildMaterializationTableRefs(
  charts: Array<{
    sql: string;
    catalogContext?: string | null;
    dbIdentifier?: string | null;
    sqlBackend?: SqlBackend | null;
    sourceDescriptor?: DbDashboardChart["sourceDescriptor"];
    snapshotId?: string | null;
  }>,
  joinDefs: JoinDefinition[],
): MaterializedTableRef[] {
  return buildDashboardExecutionTableRefs(
    charts.map(
      (chart, index) =>
        ({
          id: `chart-${index}`,
          dashboardId: "dashboard",
          title: null,
          description: null,
          sql: chart.sql,
          sourceDescriptor: chart.sourceDescriptor ?? null,
          snapshotId: chart.snapshotId ?? null,
          dbIdentifier: chart.dbIdentifier ?? null,
          catalogContext: chart.catalogContext ?? null,
          sqlBackend: chart.sqlBackend ?? null,
          chartConfigJson: "{}",
          semanticQueryJson: null,
          exploreName: null,
          position: index,
          createdAt: 0,
          updatedAt: 0,
        }) satisfies DbDashboardChart,
    ),
    joinDefs,
    charts.find((chart) => chart.sqlBackend)?.sqlBackend ?? "duckdb-wasm",
  );
}

function planMaterializedTables(
  tableRefs: MaterializedTableRef[],
): PlannedMaterializedTableRef[] {
  return planDashboardExecutionTableRefs(tableRefs);
}

export async function executeDashboardChartsWithFilters(
  options: {
    dashboardId: string;
    charts: DbDashboardChart[];
    dashboardFilters: Filter[];
    chartFiltersById: Record<string, Filter[]>;
    forceRefresh?: boolean;
  },
  depsOverride: Partial<BrowserFilterEngineDeps> = {},
): Promise<DashboardFilterExecutionResult> {
  const deps = resolveDeps(depsOverride);
  const backend = resolveDashboardBackend(options.charts, deps);
  const joinDefs = await deps.readJoinDefs(options.dashboardId);
  const hasAnyFilters =
    options.dashboardFilters.length > 0 ||
    Object.values(options.chartFiltersById).some(
      (filters) => filters.length > 0,
    );
  const hasExecutionBindings = options.charts.some((chart) => {
    const sourceDescriptor = resolveChartSourceDescriptor(chart, backend);
    return sourceDescriptor.kind === "external" || Boolean(chart.snapshotId);
  });

  let filterPlanningReady = false;
  let materialization: MaterializationCacheEntry | null = null;
  if (hasAnyFilters || hasExecutionBindings) {
    materialization = await ensureDashboardMaterialization(
      options.dashboardId,
      options.charts,
      joinDefs,
      backend,
      deps,
      options.forceRefresh,
    );
    filterPlanningReady = materialization.tableRefs.length > 0;
  }

  const rowsByChartId: Record<string, Result[]> = {};
  const metadataByChartId: Record<string, DashboardFilterExecutionMetadata> =
    {};

  await Promise.all(
    options.charts.map(async (chart) => {
      const effectiveFilters = [
        ...options.dashboardFilters,
        ...(options.chartFiltersById[chart.id] ?? []),
      ];

      let sqlToExecute = chart.sql;
      let shouldExecuteFilteredSql = false;
      let shouldExecutePlannedSql = false;
      let appliedFiltersCount = 0;
      let skippedFilters: Array<{ field: string; reason: string }> = [];

      if (
        effectiveFilters.length > 0 &&
        filterPlanningReady &&
        materialization
      ) {
        try {
          const filterResult = applyFiltersToSql(
            chart.sql,
            effectiveFilters,
            joinDefs,
            {
              tableReferences: materialization.resolvedRefByTable,
            },
          );
          appliedFiltersCount = filterResult.appliedFilters;
          skippedFilters = filterResult.skippedFilters;
          if (filterResult.appliedFilters > 0) {
            sqlToExecute = filterResult.sql;
            shouldExecuteFilteredSql = true;
          }
        } catch (error) {
          console.error(
            `[dashboard-filters] Failed to rewrite chart SQL for chart ${chart.id}:`,
            error,
          );
        }
      }

      if (!shouldExecuteFilteredSql && materialization) {
        const plannedSql = rewriteSqlToResolvedReferences(
          chart.sql,
          materialization.tableRefs,
          materialization.resolvedRefByTable,
        );
        if (plannedSql !== chart.sql) {
          sqlToExecute = plannedSql;
          shouldExecutePlannedSql = true;
        }
      }

      try {
        const sourceDescriptor = resolveChartSourceDescriptor(chart, backend);
        const executionCatalogContext =
          shouldExecuteFilteredSql || shouldExecutePlannedSql
            ? resolveCatalogContextForReference(
                sqlToExecute,
                sourceDescriptor.catalogContext ?? null,
              )
            : (sourceDescriptor.catalogContext ?? null);
        const rows =
          shouldExecuteFilteredSql || shouldExecutePlannedSql
            ? ((await deps.runRuntimeSql(
                sqlToExecute,
                backend,
                executionCatalogContext,
              )) as Result[])
            : await deps.runChartSql(chart, backend);

        rowsByChartId[chart.id] = rows;
        metadataByChartId[chart.id] = {
          filtersApplied: shouldExecuteFilteredSql,
          appliedFiltersCount: shouldExecuteFilteredSql
            ? appliedFiltersCount
            : 0,
          skippedFilters,
        };
      } catch (error) {
        if (shouldExecuteFilteredSql) {
          console.warn(
            `[dashboard-filters] Filtered execution failed for chart ${chart.id}; falling back to raw chart SQL.`,
            error,
          );
          try {
            const fallbackRows = await deps.runChartSql(chart, backend);
            rowsByChartId[chart.id] = fallbackRows;
            metadataByChartId[chart.id] = {
              filtersApplied: false,
              appliedFiltersCount: 0,
              skippedFilters,
            };
            return;
          } catch (fallbackError) {
            console.error(
              `[dashboard-filters] Fallback execution failed for chart ${chart.id}:`,
              fallbackError,
            );
            rowsByChartId[chart.id] = [];
            metadataByChartId[chart.id] = {
              filtersApplied: false,
              appliedFiltersCount: 0,
              skippedFilters,
              errorMessage: getErrorMessage(fallbackError),
            };
            return;
          }
        } else {
          console.error(
            `[dashboard-filters] Failed to execute chart ${chart.id}:`,
            error,
          );
        }

        rowsByChartId[chart.id] = [];
        metadataByChartId[chart.id] = {
          filtersApplied: false,
          appliedFiltersCount: 0,
          skippedFilters,
          errorMessage: getErrorMessage(error),
        };
      }
    }),
  );

  return {
    rowsByChartId,
    metadataByChartId,
    backend,
  };
}

export async function executeDashboardScopedQuery(
  options: {
    dashboardId: string;
    sql: string;
    sourceDescriptor?: DashboardSourceDescriptor | null;
    snapshotId?: string | null;
    forceRefresh?: boolean;
  },
  depsOverride: Partial<BrowserFilterEngineDeps> = {},
): Promise<{ rows: Result[]; backend: SqlBackend }> {
  const deps = resolveDeps(depsOverride);
  const fallbackBackend = deps.resolveBackend();
  const sourceDescriptor =
    options.sourceDescriptor ??
    buildDashboardSourceDescriptor({
      runtimeBackend: fallbackBackend,
    });
  const backend = sourceDescriptor.runtimeBackend;
  const joinDefs = await deps.readJoinDefs(options.dashboardId);
  const chart: DbDashboardChart = {
    id: "__scoped_query__",
    dashboardId: options.dashboardId,
    title: null,
    description: null,
    sql: options.sql,
    sourceDescriptor,
    snapshotId: options.snapshotId ?? null,
    dbIdentifier: sourceDescriptor.dbIdentifier,
    catalogContext: sourceDescriptor.catalogContext,
    sqlBackend: sourceDescriptor.runtimeBackend,
    chartConfigJson: "{}",
    semanticQueryJson: null,
    exploreName: null,
    position: 0,
    createdAt: 0,
    updatedAt: 0,
  };

  const materialization = await ensureDashboardMaterialization(
    options.dashboardId,
    [chart],
    joinDefs,
    backend,
    deps,
    options.forceRefresh,
  );
  const sql = rewriteSqlToResolvedReferences(
    options.sql,
    materialization.tableRefs,
    materialization.resolvedRefByTable,
  );
  const rows = await deps.runRuntimeSql(
    sql,
    backend,
    resolveCatalogContextForReference(
      sql,
      sourceDescriptor.catalogContext ?? null,
    ),
  );

  return {
    rows: rows as Result[],
    backend,
  };
}

export async function loadDashboardDimensions(
  dashboardId: string,
  depsOverride: Partial<BrowserFilterEngineDeps> = {},
): Promise<AvailableDimension[]> {
  const deps = resolveDeps(depsOverride);
  const joinDefs = await deps.readJoinDefs(dashboardId);
  const charts = await deps.listCharts(dashboardId);
  const backend = resolveDashboardBackend(charts, deps);
  const materialization = await ensureDashboardMaterialization(
    dashboardId,
    charts,
    joinDefs,
    backend,
    deps,
  );

  const dimensions: AvailableDimension[] = [];
  const seen = new Set<string>();

  for (const tableRef of materialization.plannedTables) {
    const describeCandidates = buildDescribeCandidates(
      tableRef,
      materialization,
    );
    const rows = await describeTableWithFallbacks(
      tableRef.tableName,
      describeCandidates,
      backend,
      deps,
      tableRef.catalogContext ?? null,
    );
    if (!rows) {
      continue;
    }

    for (const row of rows) {
      const columnName = String(
        row.column_name ?? row.column ?? row.name ?? "",
      ).trim();
      if (!columnName) {
        continue;
      }
      const field = `${tableRef.tableName}.${columnName}`;
      if (seen.has(field)) {
        continue;
      }
      seen.add(field);
      dimensions.push({
        exploreName: tableRef.tableName,
        field,
        displayName: formatDisplayName(columnName),
        type: inferDimensionType(row.column_type ?? row.type),
      });
    }
  }

  return dimensions;
}

export async function loadDashboardDimensionValues(
  options: {
    dashboardId: string;
    field: string;
    filters: Filter[];
    limit?: number;
    search?: string;
  },
  depsOverride: Partial<BrowserFilterEngineDeps> = {},
): Promise<Array<{ value: string | number | boolean; label: string }>> {
  const parsedField = parseField(options.field);
  if (!parsedField) {
    return [];
  }

  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(200, Number(options.limit)))
    : 50;
  const search = options.search?.trim() ?? "";

  const deps = resolveDeps(depsOverride);
  const joinDefs = await deps.readJoinDefs(options.dashboardId);
  const charts = await deps.listCharts(options.dashboardId);
  const backend = resolveDashboardBackend(charts, deps);
  const materialization = await ensureDashboardMaterialization(
    options.dashboardId,
    charts,
    joinDefs,
    backend,
    deps,
  );
  const sourceRefByTable = new Map(
    materialization.tableRefs.map((tableRef) => [
      tableRef.tableName,
      tableRef.sourceReference,
    ]),
  );
  const sourceCatalogContextByTable = new Map(
    materialization.tableRefs.map((tableRef) => [
      tableRef.tableName,
      tableRef.catalogContext ?? null,
    ]),
  );

  const effectiveFilters = options.filters.filter(
    (filter) => filter.field !== options.field,
  );
  if (search.length > 0) {
    effectiveFilters.push({
      field: options.field,
      op: "contains",
      values: [search],
    });
  }

  const preferredBaseRef =
    materialization.resolvedRefByTable.get(parsedField.tableName) ??
    sourceRefByTable.get(parsedField.tableName) ??
    quoteExecutionIdentifier(parsedField.tableName);
  const preferredCatalogContext = resolveCatalogContextForReference(
    preferredBaseRef,
    sourceCatalogContextByTable.get(parsedField.tableName) ?? null,
  );
  const filteredBaseSql =
    `SELECT ${quoteIdent(parsedField.columnName)} AS "value"\n` +
    `FROM ${preferredBaseRef}`;

  try {
    const filtered = applyFiltersToSql(
      filteredBaseSql,
      effectiveFilters,
      joinDefs,
      {
        tableReferences: materialization.resolvedRefByTable,
      },
    );
    const valueSql =
      `SELECT DISTINCT "value"\n` +
      `FROM (\n${indentSql(filtered.sql, 2)}\n) AS "values_src"\n` +
      `WHERE "value" IS NOT NULL AND CAST("value" AS VARCHAR) <> ''\n` +
      `ORDER BY "value" ASC\n` +
      `LIMIT ${limit};`;
    const rows = await deps.runRuntimeSql(
      valueSql,
      backend,
      preferredCatalogContext,
    );
    return toDimensionValues(rows);
  } catch (error) {
    console.warn(
      `[dashboard-filters] Materialized dimension value query failed for ${options.field}; using same-table fallback.`,
      error,
    );
  }

  const sourceRef =
    sourceRefByTable.get(parsedField.tableName) ??
    quoteExecutionIdentifier(parsedField.tableName);
  const sourceCatalogContext = resolveCatalogContextForReference(
    sourceRef,
    sourceCatalogContextByTable.get(parsedField.tableName) ?? null,
  );
  const sameTableFilters = effectiveFilters.filter((filter) => {
    const parsed = parseField(filter.field);
    return parsed?.tableName === parsedField.tableName;
  });

  const whereClauses = sameTableFilters
    .map((filter) => {
      const parsed = parseField(filter.field);
      if (!parsed) {
        return null;
      }
      return renderFilterClause(`src.${quoteIdent(parsed.columnName)}`, filter);
    })
    .filter((clause): clause is string => typeof clause === "string");

  whereClauses.push(`src.${quoteIdent(parsedField.columnName)} IS NOT NULL`);
  whereClauses.push(
    `CAST(src.${quoteIdent(parsedField.columnName)} AS VARCHAR) <> ''`,
  );

  const fallbackSql =
    `SELECT DISTINCT src.${quoteIdent(parsedField.columnName)} AS "value"\n` +
    `FROM (\n  SELECT * FROM ${sourceRef}\n) AS src\n` +
    `WHERE ${whereClauses.join(" AND ")}\n` +
    `ORDER BY "value" ASC\n` +
    `LIMIT ${limit};`;

  const rows = await deps.runRuntimeSql(
    fallbackSql,
    backend,
    sourceCatalogContext,
  );
  return toDimensionValues(rows);
}

export async function listMaterializedTablesForBackend(
  backend: SqlBackend,
  depsOverride: Partial<BrowserFilterEngineDeps> = {},
): Promise<string[]> {
  const deps = resolveDeps(depsOverride);
  const sql =
    `SELECT DISTINCT table_name\n` +
    `FROM information_schema.tables\n` +
    `WHERE table_schema = '${EXECUTION_ALIAS_SCHEMA}'\n` +
    `ORDER BY table_name`;
  const rows = await deps.runRuntimeSql(sql, backend);
  return rows.map((row) => String(row.table_name ?? "").trim()).filter(Boolean);
}

export async function listMaterializedTablesForActiveBackend(
  depsOverride: Partial<BrowserFilterEngineDeps> = {},
): Promise<string[]> {
  const deps = resolveDeps(depsOverride);
  const backend = deps.resolveBackend();
  return listMaterializedTablesForBackend(backend, deps);
}

async function ensureDashboardMaterialization(
  dashboardId: string,
  charts: DbDashboardChart[],
  joinDefs: JoinDefinition[],
  backend: SqlBackend,
  deps: BrowserFilterEngineDeps,
  forceRefresh = false,
): Promise<MaterializationCacheEntry> {
  const tableRefs = buildMaterializationTableRefs(charts, joinDefs);
  const plannedTables = planMaterializedTables(tableRefs);
  const signature = buildMaterializationSignature(charts, joinDefs);
  const runtimeFingerprint = await deps.resolveRuntimeFingerprint(backend);
  const cache = deps.getMaterializationCache();
  const cacheKey = `${dashboardId}:${backend}:${runtimeFingerprint}`;
  if (forceRefresh) {
    cache.delete(cacheKey);
    inflightMaterializationCache.delete(cacheKey);
  }
  const cached = cache.get(cacheKey);
  if (cached && cached.signature === signature) {
    return cached;
  }
  const inflight = inflightMaterializationCache.get(cacheKey);
  if (inflight && inflight.signature === signature) {
    return inflight.promise;
  }

  const promise = (async () => {
    const materializedTables = new Set<string>();
    const resolvedRefByTable = new Map<string, string>();
    const realizedAliasKindByTable = new Map<string, MaterializedAliasKind>();

    if (plannedTables.length > 0) {
      await deps.runRuntimeSql(
        `CREATE SCHEMA IF NOT EXISTS ${quoteExecutionIdentifier(EXECUTION_ALIAS_SCHEMA)};`,
        backend,
      );
    }

    for (const tableRef of plannedTables) {
      const aliasRef = getExecutionAliasRef(tableRef.tableName);

      if (tableRef.strategy === "direct") {
        resolvedRefByTable.set(tableRef.tableName, tableRef.sourceReference);
        realizedAliasKindByTable.set(tableRef.tableName, "direct");
        continue;
      }

      try {
        if (tableRef.sourceDescriptor.kind === "motherduck") {
          const dbIdentifier = tableRef.sourceDescriptor.dbIdentifier;
          if (!dbIdentifier) {
            throw new Error(
              `MotherDuck source ${tableRef.tableName} is missing a database identifier.`,
            );
          }

          const attachmentPlan = buildAttachmentPlan({
            type: "motherduck",
            identifier: dbIdentifier.startsWith("duckdb:")
              ? dbIdentifier.slice("duckdb:".length)
              : dbIdentifier,
            alias: buildExecutionAttachmentAlias(tableRef.tableName),
            readOnly: false,
            duckdbExtension: "motherduck",
          });
          const attachedSourceReference = buildMaterializationSourceReference(
            tableRef,
            attachmentPlan.alias,
          );

          try {
            await deps.runRuntimeSql(
              buildDetachStatement(attachmentPlan.alias, { ifExists: true }),
              backend,
            );
            for (const statement of attachmentPlan.statements) {
              await deps.runRuntimeSql(statement, backend);
            }

            await deps.runRuntimeSql(
              `CREATE OR REPLACE TABLE ${aliasRef} AS SELECT * FROM ${attachedSourceReference};`,
              backend,
            );
          } finally {
            try {
              await deps.runRuntimeSql(
                buildDetachStatement(attachmentPlan.alias, { ifExists: true }),
                backend,
              );
            } catch {
              // Best-effort detach only.
            }
          }
        } else if (tableRef.mode === "external-cache") {
          const dbIdentifier = tableRef.sourceDescriptor.dbIdentifier;
          const externalConnection =
            tableRef.sourceDescriptor.connection ??
            (dbIdentifier ? detectExternalConnection(dbIdentifier) : null);
          if (!externalConnection) {
            throw new Error(
              `External cache source ${tableRef.tableName} is missing a resolvable connection.`,
            );
          }

          if (isSqlBackedSourceConnection(externalConnection)) {
            await deps.runRuntimeSql(externalConnection.setupSql, backend);
            await deps.runRuntimeSql(
              `CREATE OR REPLACE TABLE ${aliasRef} AS SELECT * FROM ${tableRef.sourceReference};`,
              backend,
              tableRef.catalogContext ?? null,
            );
            materializedTables.add(tableRef.tableName);
            resolvedRefByTable.set(tableRef.tableName, aliasRef);
            realizedAliasKindByTable.set(tableRef.tableName, "table");
            continue;
          }

          const attachmentPlan = buildAttachmentPlan({
            ...externalConnection,
            alias: buildExecutionAttachmentAlias(tableRef.tableName),
          });

          try {
            await deps.runRuntimeSql(
              buildDetachStatement(attachmentPlan.alias, { ifExists: true }),
              backend,
            );
            for (const statement of attachmentPlan.statements) {
              await deps.runRuntimeSql(statement, backend);
            }

            await deps.runRuntimeSql(
              `CREATE OR REPLACE TABLE ${aliasRef} AS SELECT * FROM ${tableRef.sourceReference};`,
              backend,
              attachmentPlan.alias,
            );
          } finally {
            try {
              await deps.runRuntimeSql(
                buildDetachStatement(attachmentPlan.alias, { ifExists: true }),
                backend,
              );
            } catch {
              // Best-effort detach only.
            }
          }
        } else {
          const sourceReference = buildMaterializationSourceReference(tableRef);
          const createAliasSql =
            tableRef.strategy === "view"
              ? `CREATE OR REPLACE VIEW ${aliasRef} AS SELECT * FROM ${sourceReference};`
              : `CREATE OR REPLACE TABLE ${aliasRef} AS SELECT * FROM ${sourceReference};`;

          await deps.runRuntimeSql(
            createAliasSql,
            backend,
            tableRef.catalogContext ?? null,
          );
        }
        materializedTables.add(tableRef.tableName);
        resolvedRefByTable.set(tableRef.tableName, aliasRef);
        realizedAliasKindByTable.set(
          tableRef.tableName,
          tableRef.strategy === "view" ? "view" : "table",
        );
      } catch (error) {
        console.warn(
          `[dashboard-filters] Failed to realize ${tableRef.strategy} alias for ${tableRef.tableName} from ${tableRef.sourceReference}:`,
          error,
        );
        resolvedRefByTable.set(tableRef.tableName, tableRef.sourceReference);
        realizedAliasKindByTable.set(tableRef.tableName, "direct");
      }
    }

    const entry: MaterializationCacheEntry = {
      signature,
      runtimeFingerprint,
      tableRefs,
      plannedTables,
      resolvedRefByTable,
      realizedAliasKindByTable,
      materializedTables,
      backend,
    };
    cache.set(cacheKey, entry);
    return entry;
  })();

  inflightMaterializationCache.set(cacheKey, { signature, promise });
  try {
    return await promise;
  } finally {
    const current = inflightMaterializationCache.get(cacheKey);
    if (current?.promise === promise) {
      inflightMaterializationCache.delete(cacheKey);
    }
  }
}

async function describeTableWithFallbacks(
  tableName: string,
  references: string[],
  backend: SqlBackend,
  deps: BrowserFilterEngineDeps,
  catalogContext?: string | null,
): Promise<Record<string, unknown>[] | null> {
  let lastError: unknown = null;

  for (const reference of references) {
    try {
      return await deps.runRuntimeSql(
        `DESCRIBE ${reference};`,
        backend,
        resolveCatalogContextForReference(reference, catalogContext),
      );
    } catch (error) {
      lastError = error;
    }
  }

  console.warn(
    `[dashboard-filters] Failed to introspect dimensions for ${tableName}:`,
    lastError,
  );
  return null;
}

function buildDescribeCandidates(
  tableRef: MaterializedTableRef,
  materialization: MaterializationCacheEntry,
): string[] {
  const aliasKind = materialization.realizedAliasKindByTable.get(
    tableRef.tableName,
  );
  const candidates = [
    aliasKind === "view" || aliasKind === "table"
      ? getExecutionAliasRef(tableRef.tableName)
      : null,
    materialization.resolvedRefByTable.get(tableRef.tableName),
    tableRef.sourceReference,
  ];

  return Array.from(
    new Set(
      candidates.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  );
}

async function runDashboardRuntimeSql(
  sql: string,
  backend: SqlBackend,
  catalogContext?: string | null,
): Promise<Record<string, unknown>[]> {
  try {
    const result = await runQuery({
      sql,
      backendPreference: backend,
      catalogContext,
    });
    return result.rows;
  } catch (error) {
    if (catalogContext && isMissingCatalogContextError(error)) {
      const retried = await runQuery({
        sql,
        backendPreference: backend,
        catalogContext: null,
      });
      return retried.rows;
    }
    throw error;
  }
}

async function runChartSql(
  chart: DbDashboardChart,
  backend: SqlBackend,
): Promise<Result[]> {
  const backendPreference = chart.sqlBackend ?? backend;
  const sourceDescriptor = resolveChartSourceDescriptor(
    chart,
    backendPreference,
  );
  const dbIdentifier = sourceDescriptor.dbIdentifier ?? undefined;

  try {
    const result = await runQuery({
      sql: chart.sql,
      dbIdentifier,
      backendPreference,
      catalogContext:
        sourceDescriptor.kind === "external"
          ? null
          : (sourceDescriptor.catalogContext ?? null),
    });
    return result.rows as Result[];
  } catch (error) {
    if (
      sourceDescriptor.catalogContext &&
      sourceDescriptor.kind !== "external" &&
      isMissingCatalogContextError(error)
    ) {
      const result = await runQuery({
        sql: chart.sql,
        dbIdentifier,
        backendPreference,
        catalogContext: null,
      });
      return result.rows as Result[];
    }
    throw error;
  }
}

function resolveDashboardBackend(
  charts: DbDashboardChart[],
  deps: BrowserFilterEngineDeps,
): SqlBackend {
  const explicitBackends = Array.from(
    new Set(
      charts
        .map(
          (chart) =>
            resolveChartSourceDescriptor(chart, deps.resolveBackend())
              .runtimeBackend,
        )
        .filter((backend): backend is SqlBackend => Boolean(backend)),
    ),
  );

  if (explicitBackends.length === 1) {
    return explicitBackends[0];
  }

  return deps.resolveBackend();
}

function resolveActiveBackend(): SqlBackend {
  return resolveSqlBackend({
    backendPreference: getSqlBackendPreference(),
  });
}

async function resolveRuntimeFingerprintForBackend(
  backend: SqlBackend,
): Promise<string> {
  return resolveSqlRuntimeFingerprint(backend);
}

function toDimensionValues(
  rows: Record<string, unknown>[],
): Array<{ value: string | number | boolean; label: string }> {
  return rows
    .map((row) => row.value)
    .filter(
      (value): value is string | number | boolean =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        (typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"),
    )
    .map((value) => ({ value, label: String(value) }));
}

function parseField(
  field: string,
): { tableName: string; columnName: string } | null {
  const parts = field
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const tablePart = parts.length === 2 ? parts[0] : parts[parts.length - 2];
  const columnPart = parts[parts.length - 1];
  const tableName = canonicalTable(tablePart);
  if (!tableName || !columnPart) {
    return null;
  }
  return { tableName, columnName: columnPart };
}

function renderFilterClause(expr: string, filter: Filter): string | null {
  const values = filter.values ?? [];
  switch (filter.op) {
    case "eq":
      return values.length >= 1 ? `${expr} = ${sqlLiteral(values[0])}` : null;
    case "neq":
      return values.length >= 1 ? `${expr} != ${sqlLiteral(values[0])}` : null;
    case "gt":
      return values.length >= 1 ? `${expr} > ${sqlLiteral(values[0])}` : null;
    case "gte":
      return values.length >= 1 ? `${expr} >= ${sqlLiteral(values[0])}` : null;
    case "lt":
      return values.length >= 1 ? `${expr} < ${sqlLiteral(values[0])}` : null;
    case "lte":
      return values.length >= 1 ? `${expr} <= ${sqlLiteral(values[0])}` : null;
    case "between":
      return values.length >= 2
        ? `${expr} BETWEEN ${sqlLiteral(values[0])} AND ${sqlLiteral(values[1])}`
        : null;
    case "in":
      return values.length === 0
        ? "1 = 0"
        : `${expr} IN (${values.map((value) => sqlLiteral(value)).join(", ")})`;
    case "not_in":
      return values.length === 0
        ? "1 = 1"
        : `${expr} NOT IN (${values.map((value) => sqlLiteral(value)).join(", ")})`;
    case "contains":
      return values.length >= 1
        ? `${expr} ILIKE ${sqlLiteral(`%${String(values[0] ?? "")}%`)}`
        : null;
    case "starts_with":
      return values.length >= 1
        ? `${expr} ILIKE ${sqlLiteral(`${String(values[0] ?? "")}%`)}`
        : null;
    case "is_null":
      return `${expr} IS NULL`;
    case "is_not_null":
      return `${expr} IS NOT NULL`;
    default:
      return null;
  }
}

function formatDisplayName(fieldName: string): string {
  return fieldName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferDimensionType(
  rawType: unknown,
): "string" | "number" | "boolean" | "time" {
  const value = String(rawType ?? "").toLowerCase();
  if (
    value.includes("int") ||
    value.includes("decimal") ||
    value.includes("numeric") ||
    value.includes("double") ||
    value.includes("real") ||
    value.includes("float")
  ) {
    return "number";
  }
  if (value.includes("bool")) {
    return "boolean";
  }
  if (value.includes("date") || value.includes("time")) {
    return "time";
  }
  return "string";
}

function indentSql(sql: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return sql
    .split("\n")
    .map((line) => `${pad}${line}`)
    .join("\n");
}

function rewriteSqlToResolvedReferences(
  sql: string,
  tableRefs: MaterializedTableRef[],
  resolvedRefByTable: Map<string, string>,
): string {
  return tableRefs.reduce((currentSql, tableRef) => {
    const resolvedRef = resolvedRefByTable.get(tableRef.tableName);
    if (!resolvedRef || resolvedRef === tableRef.sourceReference) {
      return currentSql;
    }

    return currentSql.split(tableRef.sourceReference).join(resolvedRef);
  }, sql);
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}
