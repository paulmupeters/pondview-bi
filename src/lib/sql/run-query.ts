import type { HttpDuckDbConfig } from "@/lib/api/types/duckdb";
import { runBridgeQuery } from "@/lib/bridge/pondview-bridge";

export type RunQueryOptions = {
  sql: string;
  config?: HttpDuckDbConfig;
  dbIdentifier?: string;
  signal?: AbortSignal;
};

export type RunQueryResult = {
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
  durationMs: number;
};

export async function runQuery({
  sql,
  // Kept for signature compatibility in browser mode.
  config: _config,
  dbIdentifier: _dbIdentifier,
  signal,
}: RunQueryOptions): Promise<RunQueryResult> {
  const trimmedSql = sql.trim();
  if (!trimmedSql) {
    throw new Error("SQL query is required");
  }

  return runBridgeQuery(trimmedSql, signal);
}
