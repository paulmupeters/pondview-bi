import { isHiddenRuntimeSchema } from "@/lib/sql/runtime-table-schemas";

export type DataCatalogTableInput = {
  catalog?: string;
  schema: string;
  name: string;
  type: string;
  columns?: { name: string; type?: string }[];
};

export type DataCatalogTableEntry = {
  catalog: string;
  name: string;
  type: string;
  columns?: { name: string; type?: string }[];
};

export type DataCatalogGroup = {
  catalog: string;
  schema: string;
  tables: DataCatalogTableEntry[];
};

export const DEFAULT_DATA_CATALOG = "default";

export function buildDataCatalogGroups(
  tables: DataCatalogTableInput[],
): DataCatalogGroup[] {
  const grouped = new Map<string, DataCatalogTableEntry[]>();
  const groupLabels = new Map<string, { catalog: string; schema: string }>();

  for (const table of tables) {
    const schema = table.schema.trim();
    const catalog = table.catalog?.trim() || DEFAULT_DATA_CATALOG;

    if (
      schema.length === 0 ||
      table.name.trim().length === 0 ||
      isHiddenRuntimeSchema(schema) ||
      isHiddenRuntimeSchema(catalog)
    ) {
      continue;
    }

    const key = `${catalog}\u0000${schema}`;
    const entry = {
      catalog,
      name: table.name,
      type: table.type,
      columns: table.columns,
    };
    const existing = grouped.get(key);

    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(key, [entry]);
      groupLabels.set(key, { catalog, schema });
    }
  }

  return Array.from(grouped.entries())
    .map(([key, entries]) => {
      const labels = groupLabels.get(key);
      return {
        catalog: labels?.catalog ?? DEFAULT_DATA_CATALOG,
        schema: labels?.schema ?? "",
        tables: [...entries].sort((a, b) => a.name.localeCompare(b.name)),
      };
    })
    .sort(
      (a, b) =>
        a.catalog.localeCompare(b.catalog) || a.schema.localeCompare(b.schema),
    );
}
