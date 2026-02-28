import type { Filter } from "@/lib/types/filters";
import {
  canonicalTable,
  findJoinPath,
  type JoinDefinition,
  type JoinPathStep,
} from "@/lib/joins/loader";
import { findBaseTableReference } from "@/lib/filters/parse-tables";

export interface ApplyFiltersOptions {
  matSchema?: string;
  filteredCteName?: string;
}

export interface ApplyFiltersResult {
  sql: string;
  appliedFilters: number;
  skippedFilters: Array<{ field: string; reason: string }>;
}

const DEFAULT_MAT_SCHEMA = "mat";
const DEFAULT_CTE_NAME = "__filtered_base";

export function applyFiltersToSql(
  chartSql: string,
  filters: Filter[],
  joinDefs: JoinDefinition[],
  options: ApplyFiltersOptions = {}
): ApplyFiltersResult {
  const matSchema = options.matSchema ?? DEFAULT_MAT_SCHEMA;
  const filteredCteName = options.filteredCteName ?? DEFAULT_CTE_NAME;

  if (filters.length === 0) {
    return { sql: chartSql, appliedFilters: 0, skippedFilters: [] };
  }

  const baseRef = findBaseTableReference(chartSql);
  if (!baseRef) {
    return {
      sql: chartSql,
      appliedFilters: 0,
      skippedFilters: filters.map((filter) => ({
        field: filter.field,
        reason: "Base table reference could not be resolved from SQL",
      })),
    };
  }

  const baseTable = canonicalTable(baseRef.tableName);
  const aliasByTable = new Map<string, string>([[baseTable, "b"]]);
  const joinClauses: string[] = [];
  const whereClauses: string[] = [];
  const skippedFilters: Array<{ field: string; reason: string }> = [];

  for (const filter of filters) {
    const parsedField = parseFilterField(filter.field);
    if (!parsedField) {
      skippedFilters.push({
        field: filter.field,
        reason: "Filter field must use table.column format",
      });
      continue;
    }

    const { table: filterTable, column } = parsedField;
    let filterAlias = aliasByTable.get(filterTable);
    if (!filterAlias) {
      const path = findJoinPath(baseTable, filterTable, joinDefs);
      if (!path) {
        skippedFilters.push({
          field: filter.field,
          reason: `No join path from "${baseTable}" to "${filterTable}"`,
        });
        continue;
      }
      filterAlias = ensureJoinPath(path, aliasByTable, joinClauses, matSchema);
    }

    const clause = renderFilterClause(filterAlias, column, filter);
    if (!clause) {
      skippedFilters.push({
        field: filter.field,
        reason: `Unsupported or invalid filter values for op "${filter.op}"`,
      });
      continue;
    }
    whereClauses.push(clause);
  }

  if (whereClauses.length === 0) {
    return { sql: chartSql, appliedFilters: 0, skippedFilters };
  }

  const baseSql = [
    `${quoteIdent(filteredCteName)} AS (`,
    `  SELECT b.*`,
    `  FROM ${matTableRef(matSchema, baseTable)} AS b`,
    ...joinClauses.map((clause) => `  ${clause}`),
    `  WHERE ${whereClauses.join(" AND ")}`,
    `)`,
  ].join("\n");

  const rewrittenSql = replaceBaseFromClause(chartSql, baseRef.matchedFromClause, {
    cteName: filteredCteName,
    alias: baseRef.alias,
  });
  const sql = prependCte(rewrittenSql, baseSql);

  return {
    sql,
    appliedFilters: whereClauses.length,
    skippedFilters,
  };
}

function ensureJoinPath(
  path: JoinPathStep[],
  aliasByTable: Map<string, string>,
  joinClauses: string[],
  matSchema: string
): string {
  let currentAlias = aliasByTable.get(path[0]?.fromTable ?? "") ?? "b";

  for (const step of path) {
    const existingAlias = aliasByTable.get(step.toTable);
    if (existingAlias) {
      currentAlias = existingAlias;
      continue;
    }

    const alias = `j${aliasByTable.size}`;
    aliasByTable.set(step.toTable, alias);
    joinClauses.push(
      `LEFT JOIN ${matTableRef(matSchema, step.toTable)} AS ${alias} ON ${currentAlias}.${quoteIdent(
        step.fromColumn
      )} = ${alias}.${quoteIdent(step.toColumn)}`
    );
    currentAlias = alias;
  }

  return currentAlias;
}

function replaceBaseFromClause(
  sql: string,
  matchedFromClause: string,
  options: { cteName: string; alias?: string }
): string {
  const replacement = `FROM ${quoteIdent(options.cteName)}${
    options.alias ? ` ${options.alias}` : ""
  }`;
  const idx = sql.indexOf(matchedFromClause);
  if (idx === -1) {
    return sql;
  }
  return `${sql.slice(0, idx)}${replacement}${sql.slice(
    idx + matchedFromClause.length
  )}`;
}

function prependCte(sql: string, cteSql: string): string {
  const trimmed = sql.trim();
  if (/^with\s+recursive\b/i.test(trimmed)) {
    return trimmed.replace(/^with\s+recursive\b/i, `WITH RECURSIVE ${cteSql},`);
  }
  if (/^with\b/i.test(trimmed)) {
    return trimmed.replace(/^with\b/i, `WITH ${cteSql},`);
  }
  return `WITH ${cteSql}\n${trimmed}`;
}

function parseFilterField(field: string): { table: string; column: string } | null {
  const parts = field
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  if (parts.length === 2) {
    return {
      table: canonicalTable(parts[0]),
      column: parts[1],
    };
  }

  return {
    table: canonicalTable(parts[parts.length - 2]),
    column: parts[parts.length - 1],
  };
}

function renderFilterClause(alias: string, column: string, filter: Filter): string | null {
  const expr = `${alias}.${quoteIdent(column)}`;
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

function matTableRef(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) {
    return "NULL";
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? String(v) : "NULL";
  }
  if (typeof v === "boolean") {
    return v ? "TRUE" : "FALSE";
  }
  if (v instanceof Date) {
    return `'${v.toISOString().replace(/'/g, "''")}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}
