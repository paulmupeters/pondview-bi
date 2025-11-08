import type { Filter, QueryAST } from "./types";

type CompileResult = {
  sql: string;
  params: unknown[];
  selectedAliases: string[];
};

export function compileToDuckdb(
  dataModel: DataModel,
  q: QueryAST,
  ctx: { timezone?: string; rls?: Filter[] } = {},
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
      const agg = aggSql(f.measure.agg, f.sqlExpr);
      selectExprs.push(`${agg} AS "${f.alias}"`);
      selectAliases.push(f.alias);
    }
  }

  // 4) FROM + JOINs
  const fromSql = `FROM ${quoteIdent(explore.base)} AS ${aliasFor(
    explore.base,
    aliasMap,
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
            (o) => `"${resolveAlias(fields, o.field)}" ${o.dir.toUpperCase()}`,
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
function quoteIdent(id: string) {
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
function renderFilter(expr: string, f: Filter) {
  switch (f.op) {
    case "eq":
      return { clause: `${expr} = $${1}`, values: [f.values?.[0]] };
    case "in": {
      const vals = f.values || [];
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      return { clause: `${expr} IN (${placeholders})`, values: vals };
    }
    case "between": {
      const [a, b] = f.values as [unknown, unknown];
      return { clause: `${expr} BETWEEN $1 AND $2`, values: [a, b] };
    }
    case "is_null":
      return { clause: `${expr} IS NULL`, values: [] };
    case "is_not_null":
      return { clause: `${expr} IS NOT NULL`, values: [] };
    // add others...
    default:
      throw new Error(`Unsupported op ${f.op}`);
  }
}
