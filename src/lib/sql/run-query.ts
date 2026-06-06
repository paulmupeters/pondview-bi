import { runBridgeQuery } from "@/lib/bridge/pondview-bridge";
import { runWithCatalogContext } from "@/lib/duckdb/catalog-context";
import {
  buildAttachmentPlan,
  buildDetachStatement,
} from "@/lib/duckdb/duckdb-attachments";
import { isMotherDuckIdentifier } from "@/lib/duckdb/motherduck";
import { rewriteSqlForAttachedDatabase } from "@/lib/duckdb/rewrite-sql";
import { getProjectRuntimeSelection } from "@/lib/project-runtime";
import { runQueryWasm } from "@/lib/sql/run-query-wasm";
import {
  assertWasmCompatibleDbIdentifier,
  resolveSqlBackend,
  type SqlBackend,
  type SqlBackendPreference,
} from "@/lib/sql/sql-runtime";

export type RunQueryOptions = {
  sql: string;
  dbIdentifier?: string;
  catalogContext?: string | null;
  setupSql?: string | null;
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
  resolveProjectSetupSql: (input: {
    backend: SqlBackend;
    dbIdentifier?: string;
    catalogContext?: string | null;
  }) => string | null;
};

const defaultDeps: RunQueryDeps = {
  resolveBackend: resolveSqlBackend,
  assertWasmCompatibleIdentifier: assertWasmCompatibleDbIdentifier,
  runBridge: runBridgeQuery,
  runWasm: runQueryWasm,
  resolveProjectSetupSql: ({ backend, dbIdentifier, catalogContext }) => {
    const selection = getProjectRuntimeSelection();
    if (!selection?.setupSql || selection.runtimeBackend !== backend) {
      return null;
    }
    const normalizedDbIdentifier = dbIdentifier?.trim() || null;
    const normalizedCatalogContext = catalogContext?.trim() || null;
    if (
      normalizedDbIdentifier !== (selection.dbIdentifier ?? null) ||
      normalizedCatalogContext !== (selection.catalogContext ?? null)
    ) {
      return null;
    }
    return selection.setupSql;
  },
};

export function createRunQuery(partialDeps: Partial<RunQueryDeps> = {}) {
  const deps: RunQueryDeps = {
    ...defaultDeps,
    ...partialDeps,
  };

  return async function runQuery({
    sql,
    dbIdentifier,
    catalogContext,
    setupSql,
    signal,
    backendPreference = "auto",
  }: RunQueryOptions): Promise<RunQueryResult> {
    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      throw new Error("SQL query is required");
    }

    const normalizedIdentifier = dbIdentifier?.trim();
    const backend = deps.resolveBackend({ backendPreference, dbIdentifier });
    const resolvedSetupSql =
      setupSql ??
      deps.resolveProjectSetupSql({
        backend,
        dbIdentifier: normalizedIdentifier,
        catalogContext,
      });

    if (isMotherDuckIdentifier(normalizedIdentifier) && normalizedIdentifier) {
      if (backend === "duckdb-wasm") {
        deps.assertWasmCompatibleIdentifier(dbIdentifier);
      }

      const runRemoteSql =
        backend === "bridge"
          ? (statement: string) => deps.runBridge(statement, signal)
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
      if (resolvedSetupSql?.trim()) {
        await deps.runBridge(resolvedSetupSql, signal);
      }
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

    deps.assertWasmCompatibleIdentifier(dbIdentifier);
    if (resolvedSetupSql?.trim()) {
      await deps.runWasm({
        sql: resolvedSetupSql,
        signal,
        dbIdentifier,
      });
    }
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
