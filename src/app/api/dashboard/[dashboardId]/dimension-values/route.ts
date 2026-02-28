import type { NextRequest } from "next/server";
import { applyFiltersToSql } from "@/lib/filters/apply-filters";
import { normalizeFilterPayload } from "@/lib/filters/normalize-filters";
import { canonicalTable, loadJoinDefs } from "@/lib/joins/loader";
import { runMaterializedSqlRaw } from "@/lib/materialization/query";
import { materializeTablesForDashboard } from "@/lib/materialization/table-materializer";
import type { Filter } from "@/lib/types/filters";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> }
) {
  const { dashboardId } = await params;
  const { searchParams } = new URL(req.url);

  const field = searchParams.get("field");
  if (!field) {
    return Response.json(
      { error: "field parameter is required" },
      { status: 400 }
    );
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
        dashboardFilters = normalizeFilterPayload(parsed).filter(
          (f) => f.field !== field
        );
      }
    } catch (error) {
      console.error("[Dimension Values] Failed to parse filters:", error);
    }
  }

  const parsedField = parseField(field);
  if (!parsedField) {
    return Response.json(
      { error: "Field must be in format 'table.column'" },
      { status: 400 }
    );
  }

  const { tableName, columnName } = parsedField;

  try {
    await materializeTablesForDashboard(dashboardId);
    const joinDefs = await loadJoinDefs();
    const filters = [...dashboardFilters];

    if (search) {
      filters.push({
        field,
        op: "contains",
        values: [search],
      });
    }

    const baseSql =
      `SELECT ${quoteIdent(columnName)} AS "value"\n` +
      `FROM "mat"."${tableName.replace(/"/g, '""')}"`;
    const filtered = applyFiltersToSql(baseSql, filters, joinDefs);
    const materializedSql =
      `SELECT DISTINCT "value"\n` +
      `FROM (\n${indentSql(filtered.sql, 2)}\n) AS "values_src"\n` +
      `WHERE "value" IS NOT NULL AND CAST("value" AS VARCHAR) <> ''\n` +
      `ORDER BY "value" ASC\n` +
      `LIMIT ${limit};`;

    const rows = await runMaterializedSqlRaw(materializedSql);
    const values = rows
      .map((row) => row.value)
      .filter((v) => v !== null && v !== undefined && v !== "")
      .map((v) => ({
        value: v,
        label: String(v),
      }));

    return Response.json({
      values,
      field,
      limit,
      count: values.length,
    });
  } catch (newPathError) {
    console.error("[Dimension Values] Materialized query path failed.", newPathError);
    return Response.json(
      {
        error: "Failed to fetch dimension values",
        details:
          newPathError instanceof Error ? newPathError.message : String(newPathError),
      },
      { status: 500 }
    );
  }
}

function parseField(field: string): { tableName: string; columnName: string } | null {
  const parts = field
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const tablePart = parts.length === 2 ? parts[0] : parts[parts.length - 2];
  const columnPart = parts[parts.length - 1];
  const tableName = canonicalTable(tablePart);
  if (!tableName || !columnPart) {
    return null;
  }
  return { tableName, columnName: columnPart };
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function indentSql(sql: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return sql
    .split("\n")
    .map((line) => `${pad}${line}`)
    .join("\n");
}
