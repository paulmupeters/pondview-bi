import { isHiddenRuntimeSchema } from "@/lib/sql/runtime-table-schemas";
import type { SqlBackend } from "@/lib/sql/sql-runtime";

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
  origin?: DataCatalogOrigin;
};

export const DEFAULT_DATA_CATALOG = "default";

export type DataCatalogSourceInput = {
  type: string;
  alias?: string;
  attachAs?: string;
  databaseName?: string;
  schema?: string;
  table?: string;
  tables?: string[];
  readOnly?: boolean;
};

export type DataCatalogOrigin = {
  label: string;
  description: string;
};

export type DataCatalogGroupOptions = {
  sqlBackend?: SqlBackend;
  currentCatalog?: string | null;
  bridgeDatabaseMode?: "memory" | "file";
  connectedSources?: DataCatalogSourceInput[];
};

export function buildDataCatalogGroups(
  tables: DataCatalogTableInput[],
  options: DataCatalogGroupOptions = {},
): DataCatalogGroup[] {
  const grouped = new Map<string, DataCatalogTableEntry[]>();
  const groupLabels = new Map<string, { catalog: string; schema: string }>();
  const connectedSources = options.connectedSources ?? [];
  const sourceByAlias = buildSourceAliasMap(connectedSources);
  const sourceTables = buildConnectedSourceTableInputs(connectedSources);

  for (const table of mergeTableInputs(tables, sourceTables)) {
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
      const catalog = labels?.catalog ?? DEFAULT_DATA_CATALOG;
      const schema = labels?.schema ?? "";
      const origin = resolveCatalogOrigin(
        { catalog, schema, tables: entries },
        options,
        sourceByAlias,
      );
      const group: DataCatalogGroup = {
        catalog,
        schema,
        tables: [...entries].sort((a, b) => a.name.localeCompare(b.name)),
      };
      if (origin) {
        group.origin = origin;
      }
      return group;
    })
    .sort(
      (a, b) =>
        a.catalog.localeCompare(b.catalog) || a.schema.localeCompare(b.schema),
    );
}

function mergeTableInputs(
  runtimeTables: DataCatalogTableInput[],
  connectedSourceTables: DataCatalogTableInput[],
): DataCatalogTableInput[] {
  if (connectedSourceTables.length === 0) {
    return runtimeTables;
  }

  const seen = new Set<string>();
  const merged: DataCatalogTableInput[] = [];

  for (const table of [...runtimeTables, ...connectedSourceTables]) {
    const schema = table.schema.trim().toLowerCase();
    const catalog = (
      table.catalog?.trim() || DEFAULT_DATA_CATALOG
    ).toLowerCase();
    const name = table.name.trim().toLowerCase();
    const key = `${catalog}\u0000${schema}\u0000${name}`;

    if (schema.length === 0 || name.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(table);
  }

  return merged;
}

function buildConnectedSourceTableInputs(
  sources: DataCatalogSourceInput[],
): DataCatalogTableInput[] {
  return sources.flatMap((source) => {
    if (source.type.trim().toLowerCase() !== "quack") {
      return [];
    }

    const catalog =
      source.attachAs?.trim() ||
      source.alias?.trim() ||
      source.databaseName?.trim() ||
      DEFAULT_DATA_CATALOG;
    const schema = source.schema?.trim() || "main";
    const tableNames = [
      ...(source.tables ?? []),
      ...(source.table ? [source.table] : []),
    ]
      .map((tableName) => tableName.trim())
      .filter(Boolean);

    return Array.from(new Set(tableNames)).map((name) => ({
      catalog,
      schema,
      name,
      type: "BASE TABLE",
    }));
  });
}

function buildSourceAliasMap(
  sources: DataCatalogSourceInput[],
): Map<string, DataCatalogSourceInput> {
  const sourceByAlias = new Map<string, DataCatalogSourceInput>();

  for (const source of sources) {
    const alias = (source.attachAs ?? source.alias)?.trim().toLowerCase();
    if (alias) {
      sourceByAlias.set(alias, source);
    }
  }

  return sourceByAlias;
}

function resolveCatalogOrigin(
  group: {
    catalog: string;
    schema: string;
    tables: DataCatalogTableEntry[];
  },
  options: DataCatalogGroupOptions,
  sourceByAlias: Map<string, DataCatalogSourceInput>,
): DataCatalogOrigin | undefined {
  const normalizedCatalog = group.catalog.trim().toLowerCase();
  const matchedSource =
    sourceByAlias.get(normalizedCatalog) ??
    findMatchingSourceBySelection(group, options.connectedSources ?? []);

  if (matchedSource) {
    if (
      options.sqlBackend === "bridge" &&
      isAttachedDuckDbSourceType(matchedSource.type)
    ) {
      return {
        label: "Bridge attached database",
        description:
          matchedSource.type.trim().toLowerCase() === "httpfs"
            ? "Remote DuckDB file attached via Bridge"
            : "DuckDB file attached via Bridge",
      };
    }

    return {
      label: getSourceTypeLabel(matchedSource.type),
      description: matchedSource.readOnly
        ? "Attached source · read-only"
        : "Attached source",
    };
  }

  if (normalizedCatalog === "motherduck") {
    return {
      label: "MotherDuck",
      description: "Attached cloud DuckDB source",
    };
  }

  if (!options.sqlBackend) {
    return undefined;
  }

  const isCurrentCatalog =
    Boolean(options.currentCatalog?.trim()) &&
    normalizedCatalog === options.currentCatalog?.trim().toLowerCase();

  if (options.sqlBackend === "bridge") {
    if (!isCurrentCatalog) {
      return undefined;
    }

    const runtimeDescription =
      options.bridgeDatabaseMode === "file"
        ? "DuckDB file via Bridge"
        : "In-memory DuckDB via Bridge";

    return {
      label: "Bridge primary database",
      description: runtimeDescription,
    };
  }

  return {
    label: isCurrentCatalog
      ? "DuckDB WASM local database"
      : "DuckDB WASM attached database",
    description: isCurrentCatalog
      ? "Browser-local DuckDB runtime"
      : "Attached in the browser-local DuckDB runtime",
  };
}

function findMatchingSourceBySelection(
  group: {
    catalog: string;
    schema: string;
    tables: DataCatalogTableEntry[];
  },
  sources: DataCatalogSourceInput[],
): DataCatalogSourceInput | undefined {
  const normalizedCatalog = group.catalog.trim().toLowerCase();
  const normalizedSchema = group.schema.trim().toLowerCase();
  const groupTableNames = new Set(
    group.tables.map((table) => table.name.trim().toLowerCase()),
  );

  return sources.find((source) => {
    if (source.databaseName?.trim().toLowerCase() === normalizedCatalog) {
      return true;
    }

    const sourceSchema = source.schema?.trim().toLowerCase();
    if (sourceSchema && sourceSchema !== normalizedSchema) {
      return false;
    }

    const selectedTables = [
      ...(source.tables ?? []),
      ...(source.table ? [source.table] : []),
    ]
      .map((tableName) => tableName.trim().toLowerCase())
      .filter(Boolean);

    if (selectedTables.length === 0) {
      return Boolean(sourceSchema);
    }

    return selectedTables.some((tableName) => groupTableNames.has(tableName));
  });
}

function isAttachedDuckDbSourceType(type: string): boolean {
  const normalizedType = type.trim().toLowerCase();
  return normalizedType === "duckdb" || normalizedType === "httpfs";
}

function getSourceTypeLabel(type: string): string {
  switch (type.trim().toLowerCase()) {
    case "duckdb":
      return "DuckDB file";
    case "httpfs":
      return "Remote DuckDB file";
    case "motherduck":
      return "MotherDuck";
    case "postgres":
      return "Postgres";
    case "mysql":
      return "MySQL";
    case "sqlite":
      return "SQLite";
    case "quack":
      return "Quack remote DuckDB";
    default:
      return type
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}
