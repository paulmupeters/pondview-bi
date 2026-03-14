import type { HttpDuckDbConfig } from "@/lib/api/types/duckdb";
import { runBridgeQuery } from "@/lib/bridge/pondview-bridge";
import { runDuckDbHttpQuery } from "@/lib/duckdb/duckdb-http-browser";
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

type ServerDuckDbQueryResult = {
  rows: Record<string, unknown>[];
};

type RunQueryDeps = {
  resolveBackend: typeof resolveSqlBackend;
  assertWasmCompatibleIdentifier: typeof assertWasmCompatibleDbIdentifier;
  runBridge: typeof runBridgeQuery;
  runDuckDbHttp: typeof runDuckDbHttpQuery;
  runWasm: typeof runQueryWasm;
  runServerDuckDbQuery: (
    sql: string,
    dbIdentifier: string,
    signal?: AbortSignal,
  ) => Promise<ServerDuckDbQueryResult>;
};

function nowMs(): number {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
}

function isMotherDuckIdentifier(dbIdentifier?: string): boolean {
  const identifier = dbIdentifier?.trim() ?? "";
  return identifier.startsWith("md:") || identifier.startsWith("duckdb:md:");
}

async function runServerDuckDbQuery(
  sql: string,
  dbIdentifier: string,
  signal?: AbortSignal,
): Promise<ServerDuckDbQueryResult> {
  const response = await fetch("/api/duckdb/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sql,
      dbIdentifier,
    }),
    signal,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    rows?: Record<string, unknown>[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error?.trim() ||
        `DuckDB query failed: ${response.status} ${response.statusText}`,
    );
  }

  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
  };
}

const defaultDeps: RunQueryDeps = {
  resolveBackend: resolveSqlBackend,
  assertWasmCompatibleIdentifier: assertWasmCompatibleDbIdentifier,
  runBridge: runBridgeQuery,
  runDuckDbHttp: runDuckDbHttpQuery,
  runWasm: runQueryWasm,
  runServerDuckDbQuery,
};

export function createRunQuery(partialDeps: Partial<RunQueryDeps> = {}) {
  const deps: RunQueryDeps = {
    ...defaultDeps,
    ...partialDeps,
  };

  return async function runQuery({
    sql,
    config,
    dbIdentifier,
    signal,
    backendPreference = "auto",
  }: RunQueryOptions): Promise<RunQueryResult> {
    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      throw new Error("SQL query is required");
    }

    const normalizedIdentifier = dbIdentifier?.trim();

    if (isMotherDuckIdentifier(normalizedIdentifier) && normalizedIdentifier) {
      const startedAt = nowMs();
      const result = await deps.runServerDuckDbQuery(
        trimmedSql,
        normalizedIdentifier,
        signal,
      );
      const columns = Object.keys(result.rows[0] ?? {}).map((name) => ({
        name,
      }));
      return {
        rows: result.rows,
        columns,
        durationMs: Math.max(0, Math.round(nowMs() - startedAt)),
        backend: "bridge",
      };
    }

    const backend = deps.resolveBackend({ backendPreference, dbIdentifier });
    if (backend === "bridge") {
      const result = await deps.runBridge(trimmedSql, signal);
      return {
        ...result,
        backend,
      };
    }

    if (backend === "duckdb-http") {
      const result = await deps.runDuckDbHttp(trimmedSql, signal, config);
      return {
        ...result,
        backend,
      };
    }

    deps.assertWasmCompatibleIdentifier(dbIdentifier);
    const result = await deps.runWasm({
      sql: trimmedSql,
      signal,
      dbIdentifier,
    });
    return {
      ...result,
      backend,
    };
  };
}

export const runQuery = createRunQuery();
