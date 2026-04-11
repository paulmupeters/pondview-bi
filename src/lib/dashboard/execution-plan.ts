import {
  buildDashboardSourceDescriptor,
  type DashboardSourceDescriptor,
} from "@/lib/dashboard/source-descriptor";
import { extractTableReferencesFromSql } from "@/lib/filters/parse-tables";
import { canonicalTable, type JoinDefinition } from "@/lib/joins/graph";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import type { DbDashboardChart } from "@/lib/workspace/dashboard-repo";

export const EXECUTION_ALIAS_SCHEMA = "pondview_exec";

export type DashboardExecutionMode = "live" | "external-cache" | "snapshot";
export type ExecutionAliasStrategy = "direct" | "view" | "table-materialize";
export type RealizedExecutionAliasKind = "direct" | "view" | "table";

export type DashboardExecutionTableRef = {
  tableName: string;
  sourceReference: string;
  catalogContext?: string | null;
  sourceDescriptor: DashboardSourceDescriptor;
  mode: DashboardExecutionMode;
};

export type PlannedDashboardExecutionTableRef = DashboardExecutionTableRef & {
  strategy: ExecutionAliasStrategy;
};

export function quoteExecutionIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function getExecutionAliasRef(tableName: string): string {
  return `${quoteExecutionIdentifier(EXECUTION_ALIAS_SCHEMA)}.${quoteExecutionIdentifier(tableName)}`;
}

export function resolveChartSourceDescriptor(
  chart: Pick<
    DbDashboardChart,
    | "sourceDescriptor"
    | "sqlBackend"
    | "dbIdentifier"
    | "catalogContext"
    | "snapshotId"
  >,
  dashboardBackend: SqlBackend,
): DashboardSourceDescriptor {
  return (
    chart.sourceDescriptor ??
    buildDashboardSourceDescriptor({
      runtimeBackend: chart.sqlBackend ?? dashboardBackend,
      dbIdentifier: chart.dbIdentifier,
      catalogContext: chart.catalogContext ?? null,
    })
  );
}

export function buildDashboardExecutionTableRefs(
  charts: DbDashboardChart[],
  joinDefs: JoinDefinition[],
  dashboardBackend: SqlBackend,
): DashboardExecutionTableRef[] {
  const tableRefByName = new Map<string, DashboardExecutionTableRef>();

  for (const chart of charts) {
    const sourceDescriptor = resolveChartSourceDescriptor(
      chart,
      dashboardBackend,
    );
    const refs = extractTableReferencesFromSql(chart.sql);
    for (const ref of refs) {
      if (!ref.tableName || tableRefByName.has(ref.tableName)) {
        continue;
      }

      tableRefByName.set(ref.tableName, {
        tableName: ref.tableName,
        sourceReference: ref.rawReference,
        catalogContext: sourceDescriptor.catalogContext ?? null,
        sourceDescriptor,
        mode: chart.snapshotId
          ? "snapshot"
          : sourceDescriptor.kind === "external"
            ? "external-cache"
            : "live",
      });
    }
  }

  for (const joinDef of joinDefs) {
    const left = canonicalTable(joinDef.leftTable);
    const right = canonicalTable(joinDef.rightTable);
    if (!left || !right) {
      continue;
    }

    if (tableRefByName.has(left) && !tableRefByName.has(right)) {
      const leftRef = tableRefByName.get(left);
      if (!leftRef) {
        continue;
      }
      tableRefByName.set(right, {
        ...leftRef,
        tableName: right,
        sourceReference: quoteExecutionIdentifier(right),
      });
    }

    if (tableRefByName.has(right) && !tableRefByName.has(left)) {
      const rightRef = tableRefByName.get(right);
      if (!rightRef) {
        continue;
      }
      tableRefByName.set(left, {
        ...rightRef,
        tableName: left,
        sourceReference: quoteExecutionIdentifier(left),
      });
    }
  }

  return Array.from(tableRefByName.values()).sort((left, right) =>
    left.tableName.localeCompare(right.tableName),
  );
}

export function planDashboardExecutionTableRefs(
  tableRefs: DashboardExecutionTableRef[],
): PlannedDashboardExecutionTableRef[] {
  return tableRefs.map((tableRef) => ({
    ...tableRef,
    strategy: classifyExecutionAliasStrategy(tableRef),
  }));
}

export function classifyExecutionAliasStrategy(
  tableRef: Pick<DashboardExecutionTableRef, "sourceReference" | "mode">,
): ExecutionAliasStrategy {
  if (tableRef.mode === "external-cache" || tableRef.mode === "snapshot") {
    return "table-materialize";
  }

  if (isSimpleReusableReference(tableRef.sourceReference)) {
    return "view";
  }

  if (looksLikeDirectReference(tableRef.sourceReference)) {
    return "direct";
  }

  return "table-materialize";
}

function isSimpleReusableReference(sourceReference: string): boolean {
  const trimmed = sourceReference.trim();
  if (!trimmed) {
    return false;
  }

  const ident = '(?:"[^"]+"|`[^`]+`|[A-Za-z_][A-Za-z0-9_$]*)';
  const pattern = new RegExp(`^${ident}(?:\\.${ident}){0,2}$`);
  return pattern.test(trimmed);
}

function looksLikeDirectReference(sourceReference: string): boolean {
  return /[\s()]/.test(sourceReference);
}
