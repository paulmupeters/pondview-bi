import {
  buildAttachmentPlan,
  buildDetachStatement,
} from "@/lib/duckdb/duckdb-attachments";
import { runQuery } from "@/lib/sql/run-query";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import {
  getBridgeRuntimeState,
  refreshBridgeHealth,
} from "@/lib/sql/sql-runtime";

export const SAMPLE_DASHBOARD_URL = "https://data.pondview.app/stations.duckdb";
export const SAMPLE_DASHBOARD_ALIAS = "sample";

export type AddSampleDashboardResult = {
  alias: string;
  backend: SqlBackend;
  url: string;
};

async function resolveSampleDashboardBackend(): Promise<SqlBackend> {
  await refreshBridgeHealth().catch(() => "offline");

  const bridgeState = getBridgeRuntimeState();
  if (bridgeState.isQueryReady) {
    return "bridge";
  }

  return "duckdb-wasm";
}

export async function addSampleDashboard(): Promise<AddSampleDashboardResult> {
  const backend = await resolveSampleDashboardBackend();
  const plan = buildAttachmentPlan({
    type: "httpfs",
    identifier: SAMPLE_DASHBOARD_URL,
    alias: SAMPLE_DASHBOARD_ALIAS,
    readOnly: true,
    duckdbExtension: "httpfs",
  });

  await runQuery({
    sql: buildDetachStatement(plan.alias, { ifExists: true }),
    backendPreference: backend,
  }).catch(() => {
    // Best-effort cleanup only; a fresh runtime may not have the alias yet.
  });

  for (const statement of plan.statements) {
    await runQuery({
      sql: statement,
      backendPreference: backend,
    });
  }

  return {
    alias: plan.alias,
    backend,
    url: SAMPLE_DASHBOARD_URL,
  };
}
