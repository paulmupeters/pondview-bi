import type { NextRequest } from "next/server";
import { compileToDuckdb } from "@/../semantic-layer/query-builder";
import type { Filter, QueryAST } from "@/../semantic-layer/types";
import { runSqlNormalized } from "@/lib/db/router";
import { listChartsByDashboard } from "@/lib/repositories/dashboard";
import { loadMaterializedModel } from "@/lib/semantic-layer/load-materialized-model";
import type { Result } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> }
) {

  const { dashboardId } = await params;
  const { searchParams } = new URL(req.url);

  // Parse filters from query params
  const filtersParam = searchParams.get("filters");
  let dashboardFilters: Filter[] = [];

  if (filtersParam) {
    try {
      const parsed = JSON.parse(filtersParam);
      if (!Array.isArray(parsed)) {
        return Response.json(
          { error: "Filters must be an array" },
          { status: 400 }
        );
      }
      dashboardFilters = parsed;
    } catch (error) {
      console.error("[Dashboard Data] Failed to parse filters:", error);
      return Response.json({ error: "Invalid filters JSON" }, { status: 400 });
    }
  }

  const charts = await listChartsByDashboard(dashboardId);
  const semanticExploreNames = collectSemanticExploreNames(charts);
  const dataModel =
    semanticExploreNames.length > 0
      ? await loadMaterializedModel({ exploreNames: semanticExploreNames })
      : null;

  const results = await Promise.all(
    charts.map(async (chart) => {
      let sqlToExecute = chart.sql;
      let filtersApplied = false;
      let semanticAttempted = false;
      const dbIdentifier = chart.dbIdentifier || "md:my_db";

      if (chart.semanticQueryJson && dataModel) {
        semanticAttempted = true;
        try {
          const queryAST: QueryAST = JSON.parse(chart.semanticQueryJson);
          const mergedQuery: QueryAST = {
            ...queryAST,
            filters: [...(queryAST.filters || []), ...dashboardFilters],
          };
          const compiled = compileToDuckdb(dataModel, mergedQuery);
          sqlToExecute = applyParams(compiled.sql, compiled.params);
          filtersApplied = dashboardFilters.length > 0;
        } catch (compileError) {
          console.error(
            `[Dashboard Data] Failed semantic compile for chart ${chart.id}; falling back to stored SQL:`,
            compileError,
          );
          semanticAttempted = false;
          sqlToExecute = chart.sql;
          filtersApplied = false;
        }
      }

      try {
        const rows = await runSqlNormalized(
          dbIdentifier,
          sqlToExecute,
        );
        return { ...chart, rows, filtersApplied };
      } catch (executionError) {
        if (semanticAttempted) {
          console.warn(
            `[Dashboard Data] Semantic execution failed for chart ${chart.id}; retrying with stored SQL.`,
            executionError,
          );
          try {
            const fallbackRows = await runSqlNormalized(
              dbIdentifier,
              chart.sql,
            );
            return {
              ...chart,
              rows: fallbackRows,
              filtersApplied: false,
            };
          } catch (fallbackError) {
            console.error(
              `[Dashboard Data] Fallback execution also failed for chart ${chart.id}:`,
              fallbackError,
            );
            return {
              ...chart,
              rows: [] as Result[],
              filtersApplied: false,
              error:
                fallbackError instanceof Error
                  ? fallbackError.message
                  : String(fallbackError),
            };
          }
        }

        console.error(
          `[Dashboard Data] Error executing chart ${chart.id}:`,
          executionError,
        );
        return {
          ...chart,
          rows: [] as Result[],
          filtersApplied: false,
          error:
            executionError instanceof Error
              ? executionError.message
              : String(executionError),
        };
      }
    }),
  );

  return Response.json({ charts: results });
}

function applyParams(sql: string, params: unknown[]): string {
  let out = sql;
  for (let i = 0; i < params.length; i++) {
    const placeholder = new RegExp(`\\$${i + 1}(?!\\d)`, "g");
    out = out.replace(placeholder, sqlLiteral(params[i]));
  }
  return out;
}

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  const t = typeof v;
  if (t === "number") return Number.isFinite(v as number) ? String(v) : "NULL";
  if (t === "boolean") return (v as boolean) ? "TRUE" : "FALSE";
  if (v instanceof Date)
    return `'${(v as Date).toISOString().replace(/'/g, "''")}'`;
  // Default: treat as string
  return `'${String(v).replace(/'/g, "''")}'`;
}

function collectSemanticExploreNames(
  charts: Array<{
    exploreName: string | null;
    semanticQueryJson: string | null;
  }>,
): string[] {
  const names = new Set<string>();
  for (const chart of charts) {
    if (chart.exploreName) {
      names.add(chart.exploreName);
    }
    if (!chart.semanticQueryJson) {
      continue;
    }
    try {
      const ast = JSON.parse(chart.semanticQueryJson) as QueryAST;
      if (typeof ast.explore === "string" && ast.explore.trim().length > 0) {
        names.add(ast.explore);
      }
    } catch {
      // Chart can still run with stored SQL; ignore malformed semantic payload here.
    }
  }
  return Array.from(names);
}

