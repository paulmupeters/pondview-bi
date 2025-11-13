import { join } from "node:path";
import type { NextRequest } from "next/server";
import { loadModelsFromDirectory } from "@/../semantic-layer/model-loader";
import { compileToDuckdb } from "@/../semantic-layer/query-builder";
import type { DataModel, Filter, QueryAST } from "@/../semantic-layer/types";
import { runSqlNormalized } from "@/lib/db/router";
import { listChartsByDashboard } from "@/lib/repositories/dashboard";
import {
  applyMaterializationsToDataModel,
  listMaterializations,
} from "@/lib/materialization/semantic-layer";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> }
) {
  const { dashboardId } = await params;
  const { searchParams } = new URL(req.url);
  
  const field = searchParams.get("field");
  if (!field) {
    return Response.json({ error: "field parameter is required" }, { status: 400 });
  }
  
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;
  
  const search = searchParams.get("search") || "";
  
  // Parse filters from query params (exclude the current field to avoid self-filter lockout)
  const filtersParam = searchParams.get("filters");
  let dashboardFilters: Filter[] = [];
  
  if (filtersParam) {
    try {
      const parsed = JSON.parse(filtersParam);
      if (Array.isArray(parsed)) {
        dashboardFilters = parsed.filter((f: Filter) => f.field !== field);
      }
    } catch (error) {
      console.error("[Dimension Values] Failed to parse filters:", error);
    }
  }
  
  // Load semantic models
  const modelsDir = join(process.cwd(), "semantic-layer", "models");
  let dataModel: DataModel | null = null;
  try {
    dataModel = loadModelsFromDirectory(modelsDir);
    try {
      const materializations = await listMaterializations();
      if (materializations.length > 0) {
        dataModel = applyMaterializationsToDataModel(
          dataModel,
          materializations
        );
      }
    } catch (materializationError) {
      console.warn(
        "[Dimension Values] Materialization metadata unavailable:",
        materializationError
      );
    }
  } catch (error) {
    console.error("[Dimension Values] Failed to load models:", error);
    return Response.json(
      { error: "Failed to load semantic layer models" },
      { status: 500 }
    );
  }
  
  if (!dataModel) {
    return Response.json(
      { error: "Semantic layer models not available" },
      { status: 500 }
    );
  }
  
  // Get database identifier from dashboard charts
  const charts = await listChartsByDashboard(dashboardId);
  const dbIdentifier = charts.length > 0 && charts[0].dbIdentifier
    ? charts[0].dbIdentifier
    : "md:my_db";
  
  // Parse field to get explore and dimension
  const parts = field.split(".");
  if (parts.length !== 2) {
    return Response.json(
      { error: "Field must be in format 'explore.dimension'" },
      { status: 400 }
    );
  }
  
  const [exploreName, dimensionName] = parts;
  
  // Find the explore and dimension
  const explore = dataModel.explores.find((e) => e.name === exploreName);
  if (!explore) {
    return Response.json(
      { error: `Explore "${exploreName}" not found` },
      { status: 404 }
    );
  }
  
  const dimension = explore.dimensions.find((d) => d.name === dimensionName);
  if (!dimension) {
    return Response.json(
      { error: `Dimension "${dimensionName}" not found in explore "${exploreName}"` },
      { status: 404 }
    );
  }
  
  // Build QueryAST to fetch distinct values
  const filters: Filter[] = [...dashboardFilters];
  
  // Add search filter for string dimensions
  if (search && dimension.type === "string") {
    filters.push({
      field,
      op: "contains",
      values: [search],
    });
  }
  
  const ast: QueryAST = {
    explore: exploreName,
    fields: [field],
    filters,
    orderBy: [{ field, dir: "asc" }],
    limit,
  };
  
  try {
    const compiled = compileToDuckdb(dataModel, ast);
    
    // Apply params to SQL
    let sqlToExecute = compiled.sql;
    for (let i = 0; i < compiled.params.length; i++) {
      const placeholder = new RegExp(`\\$${i + 1}(?!\\d)`, "g");
      sqlToExecute = sqlToExecute.replace(placeholder, sqlLiteral(compiled.params[i]));
    }
    
    // Execute query - the query builder groups by dimension, so we get distinct values
    const rows = await runSqlNormalized(
      dbIdentifier,
      sqlToExecute
    );
    
    // Extract values from results
    // The alias will be the simple field name (e.g. "Country" instead of "unicorns_Country")
    const alias = dimensionName;
    const values = rows
      .map((row) => row[alias])
      .filter((v) => v !== null && v !== undefined && v !== "")
      .map((v) => ({
        value: v,
        label: String(v),
      }));
    
    // Remove duplicates (in case of any edge cases)
    const uniqueValues = Array.from(
      new Map(values.map((v) => [String(v.value), v])).values()
    );
    
    return Response.json({
      values: uniqueValues,
      field,
      limit,
      count: uniqueValues.length,
    });
  } catch (error) {
    console.error("[Dimension Values] Error executing query:", error);
    return Response.json(
      {
        error: "Failed to fetch dimension values",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
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

