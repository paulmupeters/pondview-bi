import { quoteIdentifier } from "@/lib/duckdb/duckdb-attachments";

type CatalogQueryResult = {
  rows: Record<string, unknown>[];
};

export type CatalogQueryRunner<
  T extends CatalogQueryResult = CatalogQueryResult,
> = (sql: string) => Promise<T>;

const CURRENT_CATALOG_SQLS = [
  "SELECT current_catalog() AS current_catalog;",
  "SELECT current_database() AS current_catalog;",
];

function normalizeCatalogName(value?: string | null): string | null {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function buildUseCatalogStatement(catalog: string): string {
  return `USE ${quoteIdentifier(catalog)};`;
}

export async function resolveCurrentCatalog<T extends CatalogQueryResult>(
  runQuery: CatalogQueryRunner<T>,
): Promise<string | null> {
  for (const sql of CURRENT_CATALOG_SQLS) {
    try {
      const result = await runQuery(sql);
      const value = normalizeCatalogName(
        String(result.rows[0]?.current_catalog ?? ""),
      );
      if (value) {
        return value;
      }
    } catch {
      // Fall through to the next supported catalog introspection query.
    }
  }

  return null;
}

export async function runWithCatalogContext<T extends CatalogQueryResult>({
  sql,
  selectedCatalog,
  currentCatalog,
  runQuery,
}: {
  sql: string;
  selectedCatalog?: string | null;
  currentCatalog?: string | null;
  runQuery: CatalogQueryRunner<T>;
}): Promise<T> {
  const normalizedSelected = normalizeCatalogName(selectedCatalog);
  if (!normalizedSelected) {
    return runQuery(sql);
  }

  const normalizedCurrent =
    currentCatalog === undefined
      ? await resolveCurrentCatalog(runQuery)
      : normalizeCatalogName(currentCatalog);
  if (
    !normalizedCurrent ||
    normalizedCurrent.toLowerCase() === normalizedSelected.toLowerCase()
  ) {
    return runQuery(sql);
  }

  await runQuery(buildUseCatalogStatement(normalizedSelected));

  try {
    return await runQuery(sql);
  } finally {
    try {
      await runQuery(buildUseCatalogStatement(normalizedCurrent));
    } catch {
      // Best-effort restore only.
    }
  }
}
