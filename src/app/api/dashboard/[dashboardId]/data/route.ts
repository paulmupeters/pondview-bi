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
  req: Request,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  const { searchParams } = new URL(req.url);

  // Parse dashboard-level filters from query params.
  const dashboardFiltersParam =
    searchParams.get("dashboardFilters") ?? searchParams.get("filters");
  let dashboardFilters: Filter[] = [];

  if (dashboardFiltersParam) {
    try {
      const parsed = JSON.parse(dashboardFiltersParam);
      if (!Array.isArray(parsed)) {
        return Response.json(
          { error: "dashboardFilters must be an array" },
          { status: 400 },
        );
      }
      dashboardFilters = normalizeFilterPayload(parsed);
    } catch (error) {
      console.error(
        "[Dashboard Data] Failed to parse dashboard filters:",
        error,
      );
      return Response.json(
        { error: "Invalid dashboard filters JSON" },
        { status: 400 },
      );
    }
  }

  // Parse chart-level filters map from query params.
  const chartFiltersById: Record<string, Filter[]> = {};
  const chartFiltersParam = searchParams.get("chartFilters");
  if (chartFiltersParam) {
    try {
      const parsed = JSON.parse(chartFiltersParam) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return Response.json(
          { error: "chartFilters must be an object keyed by chart id" },
          { status: 400 },
        );
      }
      for (const [chartId, rawFilters] of Object.entries(parsed)) {
        chartFiltersById[chartId] = normalizeFilterPayload(rawFilters);
      }
    } catch (error) {
      console.error("[Dashboard Data] Failed to parse chart filters:", error);
      return Response.json(
        { error: "Invalid chart filters JSON" },
        { status: 400 },
      );
    }
  }

  const charts = await listChartsByDashboard(dashboardId);
  let joinDefs: JoinDefinition[] = [];
  let materializationReady = false;
  const hasAnyFilters =
    dashboardFilters.length > 0 ||
    Object.values(chartFiltersById).some((filters) => filters.length > 0);
  if (hasAnyFilters) {
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
      const effectiveFilters = [
        ...dashboardFilters,
        ...(chartFiltersById[chart.id] ?? []),
      ];
      let sqlToExecute = chart.sql;
      let filtersApplied = false;
      let appliedFiltersCount = 0;
      let skippedFilters: Array<{ field: string; reason: string }> = [];
      let executeOnMaterializedDb = false;
      const dbIdentifier = chart.dbIdentifier || "md:my_db";

      if (effectiveFilters.length > 0 && materializationReady) {
        try {
          const filterResult = applyFiltersToSql(
            chart.sql,
            effectiveFilters,
            joinDefs,
          );
          appliedFiltersCount = filterResult.appliedFilters;
          skippedFilters = filterResult.skippedFilters;
          if (filterResult.appliedFilters > 0) {
            sqlToExecute = filterResult.sql;
            filtersApplied = true;
            executeOnMaterializedDb = true;
          } else {
            if (filterResult.skippedFilters.length > 0) {
              console.warn(
                `[Dashboard Data] Could not apply ${filterResult.skippedFilters.length} filter(s) for chart ${chart.id}.`,
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
        const rows = executeOnMaterializedDb
          ? await runMaterializedSqlNormalized(sqlToExecute)
          : await runSqlNormalized(dbIdentifier, sqlToExecute);
        return {
          ...chart,
          rows,
          filtersApplied,
          appliedFiltersCount,
          skippedFilters,
        };
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
              appliedFiltersCount: 0,
              skippedFilters,
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
              appliedFiltersCount: 0,
              skippedFilters,
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
          appliedFiltersCount: 0,
          skippedFilters,
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
