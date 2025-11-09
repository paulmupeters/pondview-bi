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

  // 1) Determine needed fields
  const fields = q.fields.map((f) => resolveField(dataModel, q.explore, f));
  const filters = [...(q.filters || []), ...(ctx.rls || [])];

  // 2) Plan joins
  const joinPlan = planJoins(explore, fields, filters);

  // 3) Build SELECT
  const selectExprs: string[] = [];
  const groupByExprs: string[] = [];
  const selectAliases: string[] = [];

  for (const f of fields) {
    if (f.kind === "dimension") {
      const expr = applyTimeGrainIfNeeded(f, q.timeDimensions);
      selectExprs.push(`${expr} AS "${f.alias}"`);
      groupByExprs.push(expr);
      selectAliases.push(f.alias);
    } else {
      const agg = aggSql(f.measure?.agg || "count", f.sqlExpr);
      selectExprs.push(`${agg} AS "${f.alias}"`);
      selectAliases.push(f.alias);
    }
  }

  // 4) FROM + JOINs
  const fromSql = `FROM ${quoteIdent(explore.base)} AS ${aliasFor(
    explore.base,
    aliasMap
  )}`;
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
    const { clause, values } = renderFilter(
      applyTimeGrainIfNeeded(resolved, q.timeDimensions),
      flt,
      params.length + 1
    );
    whereClauses.push(clause);
    params.push(...values);
  }

  // 6) GROUP BY
  const groupBy =
    groupByExprs.length > 0 ? `GROUP BY ${groupByExprs.join(", ")}` : "";

  // 7) ORDER BY
  const orderBy =
    q.orderBy && q.orderBy.length
      ? "ORDER BY " +
        q.orderBy
          .map(
            (o) => `"${resolveAlias(fields, o.field)}" ${o.dir.toUpperCase()}`
          )
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
      return { clause: `${expr} BETWEEN $${paramIndex} AND $${paramIndex + 1}`, values: [a, b] };
    }
    case "contains":
      return { clause: `${expr} LIKE $${paramIndex}`, values: [`%${f.values?.[0]}%`] };
    case "starts_with":
      return { clause: `${expr} LIKE $${paramIndex}`, values: [`${f.values?.[0]}%`] };
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
      alias: fieldRef.replace(".", "_"),
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
      alias: fieldRef.replace(".", "_"),
      sqlExpr: measure.sql,
      measure,
      exploreName: explore.name,
    };
  }

  throw new Error(
    `Field "${fieldName}" not found in explore "${explore.name}"`
  );
}

// Plan which joins are needed based on fields and filters
type JoinPlanItem = {
  toTable: string;
  toAlias: string;
  on: string;
  required: boolean;
};

function planJoins(
  explore: ExploreDef,
  fields: FieldDef[],
  filters: Filter[]
): JoinPlanItem[] {
  // For now, simple implementation - include all joins defined in the explore
  // In a real implementation, this would analyze which joins are actually needed
  const joins = explore.joins || [];

  return joins.map((join, index) => ({
    toTable: join.to,
    toAlias: `j${index}`,
    on: join.on,
    required: join.required || false,
  }));
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
  if (aliasMap.has(tableName)) {
    return aliasMap.get(tableName)!;
  }
  const alias = `t${aliasMap.size}`;
  aliasMap.set(tableName, alias);
  return alias;
}

// Resolve field reference to its alias in the SELECT clause
function resolveAlias(fields: FieldDef[], fieldRef: string): string {
  const field = fields.find((f) => {
    const fullName = `${f.exploreName}.${f.dimension?.name || f.measure?.name}`;
    return fullName === fieldRef || f.alias === fieldRef.replace(".", "_");
  });

  if (!field) {
    throw new Error(`Cannot resolve alias for field "${fieldRef}"`);
  }

  return field.alias;
}
