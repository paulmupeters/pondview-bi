import type { HttpDuckDbConfig } from "@/lib/api/types/duckdb";
import { runBridgeQuery } from "@/lib/bridge/pondview-bridge";
import { runWithCatalogContext } from "@/lib/duckdb/catalog-context";
import {
  buildAttachmentPlan,
  buildDetachStatement,
} from "@/lib/duckdb/duckdb-attachments";
import { runDuckDbHttpQuery } from "@/lib/duckdb/duckdb-http-browser";
import { isMotherDuckIdentifier } from "@/lib/duckdb/motherduck";
import { rewriteSqlForAttachedDatabase } from "@/lib/duckdb/rewrite-sql";
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
  catalogContext?: string | null;
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
  runDuckDbHttp: typeof runDuckDbHttpQuery;
  runWasm: typeof runQueryWasm;
};

const defaultDeps: RunQueryDeps = {
  resolveBackend: resolveSqlBackend,
  assertWasmCompatibleIdentifier: assertWasmCompatibleDbIdentifier,
  runBridge: runBridgeQuery,
  runDuckDbHttp: runDuckDbHttpQuery,
  runWasm: runQueryWasm,
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
    catalogContext,
    signal,
    backendPreference = "auto",
  }: RunQueryOptions): Promise<RunQueryResult> {
    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      throw new Error("SQL query is required");
    }

    const normalizedIdentifier = dbIdentifier?.trim();
    const backend = deps.resolveBackend({ backendPreference, dbIdentifier });

    if (isMotherDuckIdentifier(normalizedIdentifier) && normalizedIdentifier) {
      if (backend === "duckdb-wasm") {
        deps.assertWasmCompatibleIdentifier(dbIdentifier);
      }

      const runRemoteSql =
        backend === "bridge"
          ? (statement: string) => deps.runBridge(statement, signal)
          : backend === "duckdb-http"
            ? (statement: string) =>
                deps.runDuckDbHttp(statement, signal, config)
            : null;

      if (!runRemoteSql) {
        deps.assertWasmCompatibleIdentifier(dbIdentifier);
        throw new Error("Remote SQL runner is unavailable for this backend.");
      }
      const remoteSqlRunner = runRemoteSql;

      const plan = buildAttachmentPlan({
        type: "motherduck",
        identifier: normalizedIdentifier.startsWith("duckdb:")
          ? normalizedIdentifier.slice("duckdb:".length)
          : normalizedIdentifier,
        alias: "motherduck",
        readOnly: false,
        duckdbExtension: "motherduck",
      });

      for (const statement of plan.statements) {
        await remoteSqlRunner(statement);
      }

      try {
        const rewrittenSql = rewriteSqlForAttachedDatabase(
          trimmedSql,
          plan.alias,
        );
        const result = await runWithCatalogContext({
          sql: rewrittenSql,
          selectedCatalog: plan.alias,
          runQuery: remoteSqlRunner,
        });
        return {
          ...result,
          backend,
        };
      } finally {
        try {
          await remoteSqlRunner(
            buildDetachStatement(plan.alias, { ifExists: true }),
          );
        } catch {
          // Best-effort detach only.
        }
      }
    }
    if (backend === "bridge") {
      const result = await runWithCatalogContext({
        sql: trimmedSql,
        selectedCatalog: catalogContext,
        runQuery: (statement: string) => deps.runBridge(statement, signal),
      });
      return {
        ...result,
        backend,
      };
    }

    if (backend === "duckdb-http") {
      const result = await runWithCatalogContext({
        sql: trimmedSql,
        selectedCatalog: catalogContext,
        runQuery: (statement: string) =>
          deps.runDuckDbHttp(statement, signal, config),
      });
      return {
        ...result,
        backend,
      };
    }

    deps.assertWasmCompatibleIdentifier(dbIdentifier);
    const result = await runWithCatalogContext({
      sql: trimmedSql,
      selectedCatalog: catalogContext,
      runQuery: (statement: string) =>
        deps.runWasm({
          sql: statement,
          signal,
          dbIdentifier,
        }),
    });
    return {
      ...result,
      backend,
    };
  };
}

export const runQuery = createRunQuery();
