import type { HttpDuckDbConfig } from "@/lib/api/types/duckdb";
import { runBridgeQuery } from "@/lib/bridge/pondview-bridge";
import { runQueryWasm } from "@/lib/sql/run-query-wasm";
import {
  assertWasmCompatibleDbIdentifier,
  resolveSqlBackend,
  type SqlBackend,
  type SqlBackendPreference,
} from "@/lib/sql/sql-runtime";

export type RunQueryOptions = {
  sql: string;
  config?: HttpDuckDbConfig;
  dbIdentifier?: string;
  signal?: AbortSignal;
  backendPreference?: SqlBackendPreference;
};

export type RunQueryResult = {
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
  durationMs: number;
  backend: SqlBackend;
};

type RunQueryDeps = {
  resolveBackend: typeof resolveSqlBackend;
  assertWasmCompatibleIdentifier: typeof assertWasmCompatibleDbIdentifier;
  runBridge: typeof runBridgeQuery;
  runWasm: typeof runQueryWasm;
};

const defaultDeps: RunQueryDeps = {
  resolveBackend: resolveSqlBackend,
  assertWasmCompatibleIdentifier: assertWasmCompatibleDbIdentifier,
  runBridge: runBridgeQuery,
  runWasm: runQueryWasm,
};

export function createRunQuery(partialDeps: Partial<RunQueryDeps> = {}) {
  const deps: RunQueryDeps = {
    ...defaultDeps,
    ...partialDeps,
  };

  return async function runQuery({
    sql,
    // Kept for signature compatibility in browser mode.
    config: _config,
    dbIdentifier,
    signal,
    backendPreference = "auto",
  }: RunQueryOptions): Promise<RunQueryResult> {
    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      throw new Error("SQL query is required");
    }

    const backend = deps.resolveBackend({ backendPreference, dbIdentifier });
    if (backend === "bridge") {
      const result = await deps.runBridge(trimmedSql, signal);
      return {
        ...result,
        backend,
      };
    }

    deps.assertWasmCompatibleIdentifier(dbIdentifier);
    const result = await deps.runWasm({ sql: trimmedSql, signal, dbIdentifier });
    return {
      ...result,
      backend,
    };
  };
}

export const runQuery = createRunQuery();
