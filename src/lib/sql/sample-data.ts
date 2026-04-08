import {
  type RunQueryOptions,
  type RunQueryResult,
  runQuery,
} from "@/lib/sql/run-query";
import { RUNTIME_SCHEMA_EXCLUSION_SQL } from "@/lib/sql/runtime-table-schemas";
import type { SqlBackend, SqlBackendPreference } from "@/lib/sql/sql-runtime";
import {
  resolveDbIdentifierForSqlBackend,
  resolveSqlBackend,
} from "@/lib/sql/sql-runtime";

export const SAMPLE_DATA_TABLE_NAME = "unicorns";
export const SAMPLE_DATA_URL = "https://data.pondview.app/unicorns.csv";
export const SAMPLE_DATA_SQL = `CREATE TABLE ${SAMPLE_DATA_TABLE_NAME} AS SELECT * FROM read_csv_auto('${SAMPLE_DATA_URL}')`;

export const LIST_VISIBLE_TABLES_SQL = `
  SELECT table_catalog, table_schema, table_name, table_type
  FROM information_schema.tables
  WHERE table_schema NOT IN (${RUNTIME_SCHEMA_EXCLUSION_SQL})
  ORDER BY table_catalog, table_schema, table_name
`;

export type SampleDataRuntimeOptions = {
  backendPreference?: SqlBackendPreference;
  dbIdentifier?: string | null;
};

export type ResolvedSampleDataRuntime = {
  backend: SqlBackend;
  dbIdentifier?: string;
};

export type VisibleRuntimeTablesResult = ResolvedSampleDataRuntime & {
  hasVisibleTables: boolean;
  tableCount: number;
};

export type EnsureSampleDataResult = ResolvedSampleDataRuntime & {
  created: boolean;
  skipped: boolean;
};

type SampleDataDeps = {
  resolveBackend: typeof resolveSqlBackend;
  resolveDbIdentifier: typeof resolveDbIdentifierForSqlBackend;
  runSql: (options: RunQueryOptions) => Promise<RunQueryResult>;
};

const defaultDeps: SampleDataDeps = {
  resolveBackend: resolveSqlBackend,
  resolveDbIdentifier: resolveDbIdentifierForSqlBackend,
  runSql: runQuery,
};

export function resolveSampleDataRuntime(
  options: SampleDataRuntimeOptions = {},
  deps: Pick<
    SampleDataDeps,
    "resolveBackend" | "resolveDbIdentifier"
  > = defaultDeps,
): ResolvedSampleDataRuntime {
  const backend = deps.resolveBackend({
    backendPreference: options.backendPreference,
    dbIdentifier: options.dbIdentifier ?? undefined,
  });
  const dbIdentifier = deps.resolveDbIdentifier(options.dbIdentifier, backend);

  return { backend, dbIdentifier };
}

export async function hasVisibleTablesInRuntime(
  options: SampleDataRuntimeOptions = {},
  deps: Partial<SampleDataDeps> = {},
): Promise<VisibleRuntimeTablesResult> {
  const mergedDeps = { ...defaultDeps, ...deps };
  const runtime = resolveSampleDataRuntime(options, mergedDeps);
  const result = await mergedDeps.runSql({
    sql: LIST_VISIBLE_TABLES_SQL,
    backendPreference: runtime.backend,
    dbIdentifier: runtime.dbIdentifier,
  });

  return {
    ...runtime,
    hasVisibleTables: result.rows.length > 0,
    tableCount: result.rows.length,
  };
}

export async function ensureSampleDataForEmptyRuntime(
  options: SampleDataRuntimeOptions = {},
  deps: Partial<SampleDataDeps> = {},
): Promise<EnsureSampleDataResult> {
  const mergedDeps = { ...defaultDeps, ...deps };
  const visibleTables = await hasVisibleTablesInRuntime(options, mergedDeps);

  if (visibleTables.hasVisibleTables) {
    return {
      backend: visibleTables.backend,
      dbIdentifier: visibleTables.dbIdentifier,
      created: false,
      skipped: true,
    };
  }

  await mergedDeps.runSql({
    sql: SAMPLE_DATA_SQL,
    backendPreference: visibleTables.backend,
    dbIdentifier: visibleTables.dbIdentifier,
  });

  return {
    backend: visibleTables.backend,
    dbIdentifier: visibleTables.dbIdentifier,
    created: true,
    skipped: false,
  };
}
