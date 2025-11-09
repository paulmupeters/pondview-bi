import { join } from "node:path";
import type { NextRequest } from "next/server";
import { loadModelsFromDirectory } from "@/../semantic-layer/model-loader";
import { compileToDuckdb } from "@/../semantic-layer/query-builder";
import type { DataModel, Filter, QueryAST } from "@/../semantic-layer/types";
import { runSqlNormalized } from "@/lib/db/router";
import { listChartsByDashboard } from "@/lib/repositories/dashboard";
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

  // Load semantic models (best-effort)
  const modelsDir = join(process.cwd(), "semantic-layer", "models");
  let dataModel: DataModel | null = null;
  try {
    dataModel = loadModelsFromDirectory(modelsDir);
  } catch (error) {
    console.error("[Dashboard Data] Failed to load models:", error);
    dataModel = null;
  }

  const charts = await listChartsByDashboard(dashboardId);

  const results = await Promise.all(
    charts.map(async (chart) => {
      try {
        let sqlToExecute = chart.sql;
        let filtersApplied = false;

        if (
          chart.semanticQueryJson &&
          dataModel &&
          dashboardFilters.length > 0
        ) {
          try {
            const queryAST: QueryAST = JSON.parse(chart.semanticQueryJson);
            const mergedQuery: QueryAST = {
              ...queryAST,
              filters: [...(queryAST.filters || []), ...dashboardFilters],
            };
            const compiled = compileToDuckdb(dataModel, mergedQuery);
            sqlToExecute = applyParams(compiled.sql, compiled.params);
            filtersApplied = true;
            console.log(
              `[Dashboard Data] Applied ${
                dashboardFilters.length
              } filter(s) to chart ${chart.id}${
                chart.exploreName ? ` (${chart.exploreName})` : ""
              }`
            );
          } catch (compileError) {
            console.error(
              `[Dashboard Data] Failed to compile query for chart ${chart.id}:`,
              compileError
            );
            sqlToExecute = chart.sql;
            filtersApplied = false;
          }
        }

        const rows = await runSqlNormalized(
          chart.dbIdentifier || "md:my_db",
          sqlToExecute
        );
        return { ...chart, rows, filtersApplied };
      } catch (executionError) {
        console.error(
          `[Dashboard Data] Error executing chart ${chart.id}:`,
          executionError
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
    })
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
