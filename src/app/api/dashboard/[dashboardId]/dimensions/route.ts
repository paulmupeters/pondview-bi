import type { NextRequest } from "next/server";
import { extractTableNamesFromSql } from "@/lib/filters/parse-tables";
import { runMaterializedSqlRaw } from "@/lib/materialization/query";
import { materializeTablesForDashboard } from "@/lib/materialization/table-materializer";
import { listChartsByDashboard } from "@/lib/repositories/dashboard";
import type { AvailableDimension } from "@/lib/types/filters";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  try {
    const { dashboardId } = await params;

    // Get charts for this dashboard
    const charts = await listChartsByDashboard(dashboardId);
    const tableNames = Array.from(
      new Set(charts.flatMap((chart) => extractTableNamesFromSql(chart.sql))),
    );

    if (tableNames.length === 0) {
      return Response.json({
        dimensions: [],
        conformGroups: {},
        message: "No chart source tables found for this dashboard.",
      });
    }

    try {
      await materializeTablesForDashboard(dashboardId);
      const dimensions = await loadDimensionsFromMaterializedTables(tableNames);
      return Response.json({
        dimensions,
        conformGroups: {},
      });
    } catch (error) {
      console.error("[Dimensions API] Failed to introspect materialized tables:", error);
      return Response.json(
        {
          error: "Failed to load dimensions from materialized tables",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("[Dimensions API] Unexpected error:", error);
    return Response.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

function formatDisplayName(fieldName: string): string {
  return fieldName.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

async function loadDimensionsFromMaterializedTables(
  tableNames: string[]
): Promise<AvailableDimension[]> {
  const dimensions: AvailableDimension[] = [];
  const seenFields = new Set<string>();

  for (const tableName of tableNames) {
    const rows = await runMaterializedSqlRaw(
      `DESCRIBE "mat"."${tableName.replace(/"/g, '""')}";`
    );
    for (const row of rows) {
      const columnName = String(row.column_name ?? "").trim();
      if (!columnName) {
        continue;
      }
      const field = `${tableName}.${columnName}`;
      if (seenFields.has(field)) {
        continue;
      }
      seenFields.add(field);
      dimensions.push({
        exploreName: tableName,
        field,
        displayName: formatDisplayName(columnName),
        type: inferDimensionType(row.column_type),
      });
    }
  }

  return dimensions;
}

function inferDimensionType(rawType: unknown): "string" | "number" | "boolean" | "time" {
  const t = String(rawType ?? "").toLowerCase();
  if (
    t.includes("int") ||
    t.includes("decimal") ||
    t.includes("numeric") ||
    t.includes("double") ||
    t.includes("real") ||
    t.includes("float")
  ) {
    return "number";
  }
  if (t.includes("bool")) {
    return "boolean";
  }
  if (t.includes("date") || t.includes("time")) {
    return "time";
  }
  return "string";
}
