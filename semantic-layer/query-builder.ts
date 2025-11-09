import type {
  DataModel,
  ExploreDef,
  FieldDef,
  Filter,
  QueryAST,
  TimeDim,
} from "./types";

type CompileResult = {
  sql: string;
  params: unknown[];
  selectedAliases: string[];
};

export function compileToDuckdb(
  dataModel: DataModel,
  q: QueryAST,
  ctx: { timezone?: string; rls?: Filter[] } = {}
): CompileResult {
  const { explore } = resolveExplore(dataModel, q.explore);
  const aliasMap = new Map<string, string>(); // source -> alias
  const params: unknown[] = [];
  const baseAlias = aliasFor(explore.base, aliasMap);
  aliasMap.set(explore.name, baseAlias);

  // 1) Determine needed fields
  const fields = q.fields.map((f) => resolveField(dataModel, q.explore, f));

  // 2) Assign smart aliases (use simple names unless there are conflicts)
  assignFieldAliases(fields);

  const filters = [...(q.filters || []), ...(ctx.rls || [])];

  // 2) Plan joins
  const joinPlan = planJoins(dataModel, explore, fields, filters, aliasMap);

  // 3) Build SELECT
  const selectExprs: string[] = [];
  const groupByExprs: string[] = [];
  const selectAliases: string[] = [];

  for (const f of fields) {
    if (f.kind === "dimension") {
      const exprWithGrain = applyTimeGrainIfNeeded(f, q.timeDimensions);
      const expr = applyTableAliases(exprWithGrain, aliasMap);
      selectExprs.push(`${expr} AS "${f.alias}"`);
      groupByExprs.push(expr);
      selectAliases.push(f.alias);
    } else {
      const sqlExpr = applyTableAliases(f.sqlExpr, aliasMap);
      const agg = aggSql(f.measure?.agg || "count", sqlExpr);
      selectExprs.push(`${agg} AS "${f.alias}"`);
      selectAliases.push(f.alias);
    }
  }

  // 4) FROM + JOINs
  const fromSql = `FROM ${quoteIdent(explore.base)} AS ${baseAlias}`;
  const joinSql = joinPlan
    .map((j) => {
      const joinType = j.required ? "INNER JOIN" : "LEFT JOIN";
      return `${joinType} ${quoteIdent(j.toTable)} AS ${j.toAlias} ON ${j.on}`;
    })
    .join("\n");

  // 5) WHERE (filters)
  const whereClauses: string[] = [];
  for (const flt of filters) {
    const resolved = resolveField(dataModel, q.explore, flt.field) as FieldDef;
    const filterExpr = applyTableAliases(
      applyTimeGrainIfNeeded(resolved, q.timeDimensions),
      aliasMap
    );
    const { clause, values } = renderFilter(filterExpr, flt, params.length + 1);
    whereClauses.push(clause);
    params.push(...values);
  }

  // 6) GROUP BY
  const groupBy =
    groupByExprs.length > 0 ? `GROUP BY ${groupByExprs.join(", ")}` : "";

  // 7) ORDER BY
  const orderBy = q.orderBy?.length
    ? "ORDER BY " +
      q.orderBy
        .map((o) => `"${resolveAlias(fields, o.field)}" ${o.dir.toUpperCase()}`)
        .join(", ")
    : "";

  // 8) LIMIT/OFFSET
  const limit = Number.isFinite(q.limit) ? `LIMIT ${q.limit}` : "LIMIT 5000";
  const offset =
    Number.isFinite(q.offset) && (q.offset as number) > 0
      ? `OFFSET ${q.offset}`
      : "";

  const sql =
    `SELECT\n  ${selectExprs.join(",\n  ")}\n` +
    `${fromSql}\n` +
    (joinSql ? `${joinSql}\n` : "") +
    (whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}\n` : "") +
    (groupBy ? `${groupBy}\n` : "") +
    (orderBy ? `${orderBy}\n` : "") +
    `${limit}\n${offset}`;

  return { sql, params, selectedAliases: selectAliases };
}

// helpers (sketches)
function quoteIdent(id: string): string {
  return id.includes(".") ? id.split(".").map(quoteIdent).join(".") : `"${id}"`;
}
function aggSql(agg: string, expr: string) {
  switch (agg) {
    case "sum":
      return `SUM(${expr})`;
    case "avg":
      return `AVG(${expr})`;
    case "min":
      return `MIN(${expr})`;
    case "max":
      return `MAX(${expr})`;
    case "count":
      return `COUNT(*)`;
    case "count_distinct":
      return `COUNT(DISTINCT ${expr})`;
    default:
      throw new Error(`Unsupported agg ${agg}`);
  }
}
function renderFilter(expr: string, f: Filter, paramIndex: number) {
  switch (f.op) {
    case "eq":
      return { clause: `${expr} = $${paramIndex}`, values: [f.values?.[0]] };
    case "neq":
      return { clause: `${expr} != $${paramIndex}`, values: [f.values?.[0]] };
    case "in": {
      const vals = f.values || [];
      const placeholders = vals.map((_, i) => `$${paramIndex + i}`).join(", ");
      return { clause: `${expr} IN (${placeholders})`, values: vals };
    }
    case "not_in": {
      const vals = f.values || [];
      const placeholders = vals.map((_, i) => `$${paramIndex + i}`).join(", ");
      return { clause: `${expr} NOT IN (${placeholders})`, values: vals };
    }
    case "gt":
      return { clause: `${expr} > $${paramIndex}`, values: [f.values?.[0]] };
    case "gte":
      return { clause: `${expr} >= $${paramIndex}`, values: [f.values?.[0]] };
    case "lt":
      return { clause: `${expr} < $${paramIndex}`, values: [f.values?.[0]] };
    case "lte":
      return { clause: `${expr} <= $${paramIndex}`, values: [f.values?.[0]] };
    case "between": {
      const [a, b] = f.values as [unknown, unknown];
      return {
        clause: `${expr} BETWEEN $${paramIndex} AND $${paramIndex + 1}`,
        values: [a, b],
      };
    }
    case "contains":
      return {
        clause: `${expr} LIKE $${paramIndex}`,
        values: [`%${f.values?.[0]}%`],
      };
    case "starts_with":
      return {
        clause: `${expr} LIKE $${paramIndex}`,
        values: [`${f.values?.[0]}%`],
      };
    case "is_null":
      return { clause: `${expr} IS NULL`, values: [] };
    case "is_not_null":
      return { clause: `${expr} IS NOT NULL`, values: [] };
    default:
      throw new Error(`Unsupported op ${f.op}`);
  }
}

// Resolve explore from data model
function resolveExplore(
  dataModel: DataModel,
  exploreName: string
): { explore: ExploreDef } {
  const explore = dataModel.explores.find((e) => e.name === exploreName);
  if (!explore) {
    throw new Error(`Explore "${exploreName}" not found in data model`);
  }
  return { explore };
}

// Resolve a field reference like "orders.region" or "orders.revenue"
function resolveField(
  dataModel: DataModel,
  exploreName: string,
  fieldRef: string
): FieldDef {
  const [explorePrefix, fieldName] = fieldRef.includes(".")
    ? fieldRef.split(".")
    : [exploreName, fieldRef];

  const { explore } = resolveExplore(dataModel, explorePrefix);

  // Try dimensions first
  const dimension = explore.dimensions.find((d) => d.name === fieldName);
  if (dimension) {
    return {
      kind: "dimension",
      alias: fieldName, // Start with simple name, will be disambiguated later if needed
      sqlExpr: dimension.sql,
      dimension,
      exploreName: explore.name,
    };
  }

  // Try measures
  const measure = explore.measures?.find((m) => m.name === fieldName);
  if (measure) {
    return {
      kind: "measure",
      alias: fieldName, // Start with simple name, will be disambiguated later if needed
      sqlExpr: measure.sql,
      measure,
      exploreName: explore.name,
    };
  }

  throw new Error(
    `Field "${fieldName}" not found in explore "${explore.name}"`
  );
}

// Assign aliases to fields, using simple names unless there are conflicts
function assignFieldAliases(fields: FieldDef[]): void {
  const aliasCount = new Map<string, number>();

  // Count how many times each simple name appears
  for (const field of fields) {
    const simpleName =
      field.dimension?.name || field.measure?.name || field.alias;
    aliasCount.set(simpleName, (aliasCount.get(simpleName) || 0) + 1);
  }

  // Assign final aliases
  for (const field of fields) {
    const simpleName =
      field.dimension?.name || field.measure?.name || field.alias;
    const count = aliasCount.get(simpleName) || 0;

    // If there's a conflict (same field name from different explores), use qualified name
    if (count > 1) {
      field.alias = `${field.exploreName}_${simpleName}`;
    } else {
      field.alias = simpleName;
    }
  }
}

// Plan which joins are needed based on fields and filters
type JoinPlanItem = {
  toTable: string;
  toAlias: string;
  on: string;
  required: boolean;
};

function planJoins(
  dataModel: DataModel,
  explore: ExploreDef,
  _fields: FieldDef[],
  _filters: Filter[],
  aliasMap: Map<string, string>
): JoinPlanItem[] {
  // For now, simple implementation - include all joins defined in the explore
  // In a real implementation, this would analyze which joins are actually needed
  const joins = explore.joins || [];

  return joins.map((join) => {
    const targetExplore = dataModel.explores.find((e) => e.name === join.to);
    const targetTable = targetExplore ? targetExplore.base : join.to;
    const toAlias = aliasFor(targetTable, aliasMap);
    aliasMap.set(join.name, toAlias);
    aliasMap.set(join.to, toAlias);
    const onExpr = applyTableAliases(join.on, aliasMap);

    return {
      toTable: targetTable,
      toAlias,
      on: onExpr,
      required: join.required || false,
    };
  });
}

// Apply time grain to a dimension field if it's a time dimension
function applyTimeGrainIfNeeded(
  field: FieldDef | string,
  timeDimensions?: TimeDim[]
): string {
  // If field is already a string expression, return as-is
  if (typeof field === "string") {
    return field;
  }

  // If it's not a dimension, return the SQL expression
  if (field.kind !== "dimension" || !field.dimension) {
    return field.sqlExpr;
  }

  // Check if this field has a time dimension configuration
  const fieldFullName = `${field.exploreName}.${field.dimension.name}`;
  const timeDim = timeDimensions?.find((td) => td.field === fieldFullName);

  if (!timeDim || !timeDim.grain || field.dimension.type !== "time") {
    return field.sqlExpr;
  }

  // Apply time grain using DuckDB's date_trunc function
  const expr = field.sqlExpr;
  switch (timeDim.grain) {
    case "day":
      return `DATE_TRUNC('day', ${expr})`;
    case "week":
      return `DATE_TRUNC('week', ${expr})`;
    case "month":
      return `DATE_TRUNC('month', ${expr})`;
    case "quarter":
      return `DATE_TRUNC('quarter', ${expr})`;
    case "year":
      return `DATE_TRUNC('year', ${expr})`;
    default:
      return expr;
  }
}

// Generate or retrieve alias for a table
function aliasFor(tableName: string, aliasMap: Map<string, string>): string {
  const existing = aliasMap.get(tableName);
  if (existing) {
    return existing;
  }
  const aliasIndex = new Set(aliasMap.values()).size;
  const alias = `t${aliasIndex}`;
  aliasMap.set(tableName, alias);
  return alias;
}

function applyTableAliases(
  expr: string,
  aliasMap: Map<string, string>
): string {
  if (!expr) {
    return expr;
  }

  let result = expr;
  // Sort by length descending to replace longer names first (prevents partial matches)
  const entries = Array.from(aliasMap.entries()).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [table, alias] of entries) {
    if (!alias || table === alias) {
      continue;
    }

    // Simple approach: replace "table." with "alias."
    // Using replaceAll for all occurrences
    const searchStr = `${table}.`;
    const replaceStr = `${alias}.`;
    result = result.replaceAll(searchStr, replaceStr);
  }

  return result;
}

// Resolve field reference to its alias in the SELECT clause
function resolveAlias(fields: FieldDef[], fieldRef: string): string {
  const field = fields.find((f) => {
    const fullName = `${f.exploreName}.${f.dimension?.name || f.measure?.name}`;
    const simpleName = f.dimension?.name || f.measure?.name;
    return (
      fullName === fieldRef || simpleName === fieldRef || f.alias === fieldRef
    );
  });

  if (!field) {
    throw new Error(`Cannot resolve alias for field "${fieldRef}"`);
  }

  return field.alias;
}
