import { applyFiltersToSql } from "@/lib/filters/apply-filters";
import { extractTableReferencesFromSql } from "@/lib/filters/parse-tables";
import { readJoinDefsFromStorage } from "@/lib/joins/browser-storage";
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
} from "@/lib/workspace/dashboard-repo";

const MATERIALIZED_SCHEMA = "mat";

export type MaterializedTableRef = {
  tableName: string;
  sourceReference: string;
};

export type MaterializationStrategy = "direct" | "view" | "table-materialize";
export type MaterializedAliasKind = "direct" | "view" | "table";

export type PlannedMaterializedTableRef = MaterializedTableRef & {
  strategy: MaterializationStrategy;
};

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

export type DashboardFilterExecutionMetadata = {
  filtersApplied: boolean;
  appliedFiltersCount: number;
  skippedFilters: Array<{ field: string; reason: string }>;
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
  ) => Promise<Record<string, unknown>[]>;
  runChartSql: (
    chart: DbDashboardChart,
    backend: SqlBackend,
  ) => Promise<Result[]>;
  resolveBackend: () => SqlBackend;
  resolveRuntimeFingerprint: (backend: SqlBackend) => Promise<string>;
  readJoinDefs: () => JoinDefinition[];
  listCharts: (dashboardId: string) => Promise<DbDashboardChart[]>;
  getMaterializationCache: () => Map<string, MaterializationCacheEntry>;
};

function defaultDeps(): BrowserFilterEngineDeps {
  return {
    runRuntimeSql: runDashboardRuntimeSql,
    runChartSql,
    resolveBackend: resolveActiveBackend,
    resolveRuntimeFingerprint: resolveRuntimeFingerprintForBackend,
    readJoinDefs: readJoinDefsFromStorage,
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
}

export function buildMaterializationSignature(
  charts: Array<{ id: string; sql: string }>,
  joinDefs: JoinDefinition[],
): string {
  const chartSignature = charts
    .map((chart) => `${chart.id}:${chart.sql}`)
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

export function buildMaterializationTableRefs(
  charts: Array<{ sql: string }>,
  joinDefs: JoinDefinition[],
): MaterializedTableRef[] {
  const tableRefByName = new Map<string, string>();
  for (const chart of charts) {
    const refs = extractTableReferencesFromSql(chart.sql);
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
      tableRefByName.set(right, quoteIdent(right));
    }
    if (tableRefByName.has(right) && !tableRefByName.has(left)) {
      tableRefByName.set(left, quoteIdent(left));
    }
  }

  return Array.from(tableRefByName.entries())
    .map(([tableName, sourceReference]) => ({
      tableName,
      sourceReference,
    }))
    .sort((left, right) => left.tableName.localeCompare(right.tableName));
}

function planMaterializedTables(
  tableRefs: MaterializedTableRef[],
): PlannedMaterializedTableRef[] {
  return tableRefs.map((tableRef) => ({
    ...tableRef,
    strategy: classifyMaterializationStrategy(tableRef.sourceReference),
  }));
}

export async function executeDashboardChartsWithFilters(
  options: {
    dashboardId: string;
    charts: DbDashboardChart[];
    dashboardFilters: Filter[];
    chartFiltersById: Record<string, Filter[]>;
  },
  depsOverride: Partial<BrowserFilterEngineDeps> = {},
): Promise<DashboardFilterExecutionResult> {
  const deps = resolveDeps(depsOverride);
  const backend = deps.resolveBackend();
  const joinDefs = deps.readJoinDefs();
  const hasAnyFilters =
    options.dashboardFilters.length > 0 ||
    Object.values(options.chartFiltersById).some(
      (filters) => filters.length > 0,
    );

  let filterPlanningReady = false;
  let materialization: MaterializationCacheEntry | null = null;
  if (hasAnyFilters) {
    materialization = await ensureDashboardMaterialization(
      options.dashboardId,
      options.charts,
      joinDefs,
      backend,
      deps,
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

      try {
        const rows = shouldExecuteFilteredSql
          ? ((await deps.runRuntimeSql(sqlToExecute, backend)) as Result[])
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

export async function loadDashboardDimensions(
  dashboardId: string,
  depsOverride: Partial<BrowserFilterEngineDeps> = {},
): Promise<AvailableDimension[]> {
  const deps = resolveDeps(depsOverride);
  const backend = deps.resolveBackend();
  const joinDefs = deps.readJoinDefs();
  const charts = await deps.listCharts(dashboardId);
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
  const backend = deps.resolveBackend();
  const joinDefs = deps.readJoinDefs();
  const charts = await deps.listCharts(options.dashboardId);
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
    quoteIdent(parsedField.tableName);
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
    const rows = await deps.runRuntimeSql(valueSql, backend);
    return toDimensionValues(rows);
  } catch (error) {
    console.warn(
      `[dashboard-filters] Materialized dimension value query failed for ${options.field}; using same-table fallback.`,
      error,
    );
  }

  const sourceRef =
    sourceRefByTable.get(parsedField.tableName) ??
    quoteIdent(parsedField.tableName);
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

  const rows = await deps.runRuntimeSql(fallbackSql, backend);
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
    `WHERE table_schema = '${MATERIALIZED_SCHEMA}'\n` +
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
): Promise<MaterializationCacheEntry> {
  const tableRefs = buildMaterializationTableRefs(charts, joinDefs);
  const plannedTables = planMaterializedTables(tableRefs);
  const signature = buildMaterializationSignature(charts, joinDefs);
  const runtimeFingerprint = await deps.resolveRuntimeFingerprint(backend);
  const cache = deps.getMaterializationCache();
  const cacheKey = `${dashboardId}:${backend}:${runtimeFingerprint}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.signature === signature) {
    return cached;
  }

  const materializedTables = new Set<string>();
  const resolvedRefByTable = new Map<string, string>();
  const realizedAliasKindByTable = new Map<string, MaterializedAliasKind>();

  if (plannedTables.length > 0) {
    await deps.runRuntimeSql(
      `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(MATERIALIZED_SCHEMA)};`,
      backend,
    );
  }

  for (const tableRef of plannedTables) {
    const aliasRef = getMaterializedAliasRef(tableRef.tableName);

    if (tableRef.strategy === "direct") {
      resolvedRefByTable.set(tableRef.tableName, tableRef.sourceReference);
      realizedAliasKindByTable.set(tableRef.tableName, "direct");
      continue;
    }

    const createAliasSql =
      tableRef.strategy === "view"
        ? `CREATE OR REPLACE VIEW ${aliasRef} AS SELECT * FROM ${tableRef.sourceReference};`
        : `CREATE OR REPLACE TABLE ${aliasRef} AS SELECT * FROM ${tableRef.sourceReference};`;

    try {
      await deps.runRuntimeSql(createAliasSql, backend);
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
}

async function describeTableWithFallbacks(
  tableName: string,
  references: string[],
  backend: SqlBackend,
  deps: BrowserFilterEngineDeps,
): Promise<Record<string, unknown>[] | null> {
  let lastError: unknown = null;

  for (const reference of references) {
    try {
      return await deps.runRuntimeSql(`DESCRIBE ${reference};`, backend);
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
      ? getMaterializedAliasRef(tableRef.tableName)
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
): Promise<Record<string, unknown>[]> {
  const result = await runQuery({
    sql,
    backendPreference: backend,
  });
  return result.rows;
}

async function runChartSql(
  chart: DbDashboardChart,
  backend: SqlBackend,
): Promise<Result[]> {
  const result = await runQuery({
    sql: chart.sql,
    dbIdentifier: chart.dbIdentifier ?? undefined,
    backendPreference: backend,
  });
  return result.rows as Result[];
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

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function getMaterializedAliasRef(tableName: string): string {
  return `${quoteIdent(MATERIALIZED_SCHEMA)}.${quoteIdent(tableName)}`;
}

function classifyMaterializationStrategy(
  sourceReference: string,
): MaterializationStrategy {
  if (isSimpleReusableReference(sourceReference)) {
    return "view";
  }
  if (looksLikeDirectReference(sourceReference)) {
    return "direct";
  }
  return "table-materialize";
}

function isSimpleReusableReference(sourceReference: string): boolean {
  const trimmed = sourceReference.trim();
  if (!trimmed) {
    return false;
  }

  const ident = '(?:"[^"]+"|`[^`]+`|[A-Za-z_][A-Za-z0-9_$]*)';
  const pattern = new RegExp(`^${ident}(?:\\.${ident}){0,2}$`);
  return pattern.test(trimmed);
}

function looksLikeDirectReference(sourceReference: string): boolean {
  return /[\s()]/.test(sourceReference);
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
