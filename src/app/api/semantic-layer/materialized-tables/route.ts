import type { NextRequest } from "next/server";
import { runMaterializedSqlRaw } from "@/lib/materialization/query";
import { listTableMaterializations } from "@/lib/materialization/table-materializer";

export const runtime = "nodejs";

export type MaterializedTableColumn = {
  name: string;
  type: string;
};

export type MaterializedTableDetail = {
  tableName: string;
  sourceName?: string;
  targetTable?: string;
  sourceHash?: string;
  rowCount?: number;
  updatedAt?: string;
  columns: MaterializedTableColumn[];
  columnCount: number;
  introspectionError?: string;
};

export async function GET(_req: NextRequest) {
  try {
    const { searchParams } = new URL(_req.url);
    const includeDetails = isTruthy(searchParams.get("details"));

    const rows = await runMaterializedSqlRaw(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'mat'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `,
    );
    const tableNames = rows.map((row) => String(row.table_name ?? ""));
    const tables = tableNames.filter(Boolean);

    if (!includeDetails) {
      return Response.json({ tables });
    }

    const trackingRows = await listTableMaterializations();
    const trackingByTargetTable = new Map<
      string,
      (typeof trackingRows)[number]
    >();
    for (const row of trackingRows) {
      const targetTableName = extractTargetTableName(row.targetTable);
      if (targetTableName) {
        trackingByTargetTable.set(targetTableName, row);
      }
    }

    const details = await Promise.all(
      tables.map(async (tableName): Promise<MaterializedTableDetail> => {
        const tracking = trackingByTargetTable.get(tableName);
        try {
          const columnRows = await runMaterializedSqlRaw(
            `DESCRIBE "mat"."${tableName.replace(/"/g, '""')}";`,
          );
          const columns = columnRows
            .map((row) => ({
              name: String(row.column_name ?? "").trim(),
              type: String(row.column_type ?? "").trim(),
            }))
            .filter((column) => column.name.length > 0);

          return {
            tableName,
            sourceName: tracking?.sourceName,
            targetTable: tracking?.targetTable,
            sourceHash: tracking?.sourceHash,
            rowCount: tracking?.rowCount,
            updatedAt: tracking?.updatedAt,
            columns,
            columnCount: columns.length,
          };
        } catch (error) {
          return {
            tableName,
            sourceName: tracking?.sourceName,
            targetTable: tracking?.targetTable,
            sourceHash: tracking?.sourceHash,
            rowCount: tracking?.rowCount,
            updatedAt: tracking?.updatedAt,
            columns: [],
            columnCount: 0,
            introspectionError:
              error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    return Response.json({ tables, details });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    console.error("[Materialized Tables API] Error:", message);
    return Response.json(
      { error: message, tables: [], details: [] },
      { status: 500 },
    );
  }
}

function extractTargetTableName(targetTable: string | undefined): string {
  if (!targetTable) {
    return "";
  }
  const parts = targetTable.split(".");
  const tableName = parts[parts.length - 1] ?? "";
  return tableName.replace(/["`]/g, "").trim();
}

function isTruthy(value: string | null): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
