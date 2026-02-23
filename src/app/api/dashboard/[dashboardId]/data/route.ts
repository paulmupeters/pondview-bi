import type { NextRequest } from "next/server";
import { runSqlNormalized } from "@/lib/db/router";
import { applyFiltersToSql } from "@/lib/filters/apply-filters";
import { normalizeFilterPayload } from "@/lib/filters/normalize-filters";
import { type JoinDefinition, loadJoinDefs } from "@/lib/joins/loader";
import { runMaterializedSqlNormalized } from "@/lib/materialization/query";
import { materializeTablesForDashboard } from "@/lib/materialization/table-materializer";
import { listChartsByDashboard } from "@/lib/repositories/dashboard";
import type { Result } from "@/lib/types";
import type { Filter } from "@/lib/types/filters";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> },
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
          { status: 400 },
        );
      }
      dashboardFilters = normalizeFilterPayload(parsed);
    } catch (error) {
      console.error("[Dashboard Data] Failed to parse filters:", error);
      return Response.json({ error: "Invalid filters JSON" }, { status: 400 });
    }
  }

  const charts = await listChartsByDashboard(dashboardId);
  let joinDefs: JoinDefinition[] = [];
  let materializationReady = false;
  if (dashboardFilters.length > 0) {
    try {
      joinDefs = await loadJoinDefs();
      await materializeTablesForDashboard(dashboardId);
      materializationReady = true;
    } catch (error) {
      console.error(
        "[Dashboard Data] New filter path setup failed; semantic fallback may be used:",
        error,
      );
    }
  }

  const results = await Promise.all(
    charts.map(async (chart) => {
      let sqlToExecute = chart.sql;
      let filtersApplied = false;
      let executeOnMaterializedDb = false;
      const dbIdentifier = chart.dbIdentifier || "md:my_db";

      if (dashboardFilters.length > 0 && materializationReady) {
        try {
          const filterResult = applyFiltersToSql(
            chart.sql,
            dashboardFilters,
            joinDefs,
          );
          if (filterResult.appliedFilters > 0) {
            sqlToExecute = filterResult.sql;
            filtersApplied = true;
            executeOnMaterializedDb = true;
          } else {
            if (filterResult.skippedFilters.length > 0) {
              console.warn(
                `[Dashboard Data] Could not apply ${filterResult.skippedFilters.length} filter(s) with new path for chart ${chart.id}.`,
              );
            }
          }
        } catch (newPathError) {
          console.error(
            `[Dashboard Data] New filter path failed for chart ${chart.id}; semantic fallback may be used:`,
            newPathError,
          );
        }
      }

      try {
        console.log("executeOnMaterializedDb", executeOnMaterializedDb);
        console.log("sqlToExecute", sqlToExecute);
        const rows = executeOnMaterializedDb
          ? await runMaterializedSqlNormalized(sqlToExecute)
          : await runSqlNormalized(dbIdentifier, sqlToExecute);
        return { ...chart, rows, filtersApplied };
      } catch (executionError) {
        if (executeOnMaterializedDb) {
          console.warn(
            `[Dashboard Data] Filtered execution failed for chart ${chart.id}; retrying with stored SQL.`,
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
