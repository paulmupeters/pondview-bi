export type ExplorerInsertSource = "runtime" | "connected-entry";

export type ExplorerInsertPayload = {
  reference: string;
  catalog?: string;
  catalogContext?: string | null;
  dbIdentifier?: string;
  source: ExplorerInsertSource;
};

export type ExplorerTableReference = {
  catalog?: string;
  schema?: string;
  table: string;
  includeCatalog?: boolean;
  includeDefaultSchema?: boolean;
};

type BuildExplorerInsertPayloadOptions = {
  catalog?: string;
  schema?: string;
  table: string;
  source: ExplorerInsertSource;
  currentCatalog?: string | null;
  dbIdentifier?: string;
};

function normalizeSegment(value?: string | null): string {
  return (value ?? "").trim();
}

export function isDefaultExplorerSchema(schema?: string): boolean {
  const normalizedSchema = normalizeSegment(schema).toLowerCase();
  return (
    normalizedSchema === "" ||
    normalizedSchema === "main" ||
    normalizedSchema === "public"
  );
}

function catalogsMatch(left?: string | null, right?: string | null): boolean {
  const normalizedLeft = normalizeSegment(left).toLowerCase();
  const normalizedRight = normalizeSegment(right).toLowerCase();
  return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
}

export function buildExplorerTableReference({
  catalog,
  schema,
  table,
  includeCatalog = false,
  includeDefaultSchema = false,
}: ExplorerTableReference): string {
  const normalizedCatalog = normalizeSegment(catalog);
  const normalizedSchema = normalizeSegment(schema) || "main";
  const normalizedTable = normalizeSegment(table);

  if (!normalizedTable) {
    return "";
  }

  const parts: string[] = [];

  if (includeCatalog && normalizedCatalog) {
    parts.push(normalizedCatalog);
  }

  if (
    normalizedSchema &&
    (includeDefaultSchema || !isDefaultExplorerSchema(normalizedSchema))
  ) {
    parts.push(normalizedSchema);
  }

  parts.push(normalizedTable);
  return parts.join(".");
}

export function buildExplorerInsertPayload({
  catalog,
  schema,
  table,
  source,
  currentCatalog,
  dbIdentifier,
}: BuildExplorerInsertPayloadOptions): ExplorerInsertPayload {
  const normalizedCatalog = normalizeSegment(catalog);
  const normalizedSchema = normalizeSegment(schema) || "main";
  const normalizedTable = normalizeSegment(table);
  const normalizedDbIdentifier = normalizeSegment(dbIdentifier);
  const defaultSchema = isDefaultExplorerSchema(normalizedSchema);
  const shouldUseCatalogName = normalizedCatalog && defaultSchema;
  const requiresCatalogContext =
    source === "runtime" &&
    !defaultSchema &&
    normalizedCatalog &&
    !catalogsMatch(normalizedCatalog, currentCatalog);

  let reference = "";

  if (shouldUseCatalogName) {
    reference = buildExplorerTableReference({
      catalog: normalizedCatalog,
      table: normalizedTable,
      includeCatalog: true,
    });
  } else {
    reference = buildExplorerTableReference({
      schema: normalizedSchema,
      table: normalizedTable,
      includeDefaultSchema: source === "runtime" && !normalizedCatalog,
    });
  }

  return {
    reference,
    catalog: normalizedCatalog || undefined,
    catalogContext: requiresCatalogContext ? normalizedCatalog : null,
    dbIdentifier: normalizedDbIdentifier || undefined,
    source,
  };
}
