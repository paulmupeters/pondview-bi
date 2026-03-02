import { extractTableNamesFromSql } from "@/lib/filters/parse-tables";
import { runMaterializedSqlRaw } from "@/lib/materialization/query";
import {
  materializeTablesForDashboard,
  type TableMaterializationResult,
} from "@/lib/materialization/table-materializer";
import { listChartsByDashboard } from "@/lib/repositories/dashboard";
import type { AvailableDimension } from "@/lib/types/filters";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
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
      const materializationResults = await materializeTablesForDashboard(dashboardId);
      const materializedTables = resolveMaterializedTableNames(materializationResults);
      const { dimensions, skippedTables } = await loadDimensionsFromMaterializedTables(
        materializedTables.length > 0 ? materializedTables : tableNames
      );
      const message = buildDimensionsLoadMessage(materializationResults, skippedTables);
      return Response.json({
        dimensions,
        conformGroups: {},
        ...(message ? { message } : {}),
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
): Promise<{ dimensions: AvailableDimension[]; skippedTables: string[] }> {
  const dimensions: AvailableDimension[] = [];
  const seenFields = new Set<string>();
  const skippedTables: string[] = [];

  for (const tableName of tableNames) {
    let rows: Record<string, unknown>[];
    try {
      rows = await runMaterializedSqlRaw(`DESCRIBE "mat"."${tableName.replace(/"/g, '""')}";`);
    } catch (error) {
      skippedTables.push(tableName);
      console.warn(`[Dimensions API] Skipping unavailable table "${tableName}"`, error);
      continue;
    }

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

  return { dimensions, skippedTables };
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

function resolveMaterializedTableNames(results: TableMaterializationResult[]): string[] {
  const tables = new Set<string>();
  for (const result of results) {
    if ((result.status !== "materialized" && result.status !== "skipped") || !result.targetTable) {
      continue;
    }
    const tableName = parseTableName(result.targetTable);
    if (tableName) {
      tables.add(tableName);
    }
  }
  return Array.from(tables);
}

function buildDimensionsLoadMessage(
  materializationResults: TableMaterializationResult[],
  skippedTables: string[]
): string | undefined {
  const materializationFailures = materializationResults.filter(
    (result) => result.status === "missing_source" || result.status === "error"
  );
  if (materializationFailures.length === 0 && skippedTables.length === 0) {
    return undefined;
  }

  const messages: string[] = [];
  if (materializationFailures.length > 0) {
    messages.push(
      `Some tables could not be materialized: ${summarizeNames(
        materializationFailures.map((result) => result.tableName)
      )}`
    );
  }
  if (skippedTables.length > 0) {
    messages.push(`Skipped unavailable tables during introspection: ${summarizeNames(skippedTables)}`);
  }
  return messages.join(". ");
}

function parseTableName(targetTable: string): string {
  const parts = targetTable.split(".");
  const tablePart = parts[parts.length - 1] ?? "";
  return tablePart.replace(/["`]/g, "").trim();
}

function summarizeNames(values: string[], max = 5): string {
  const unique = Array.from(new Set(values.filter(Boolean)));
  if (unique.length === 0) {
    return "none";
  }
  if (unique.length <= max) {
    return unique.join(", ");
  }
  return `${unique.slice(0, max).join(", ")} (+${unique.length - max} more)`;
}
