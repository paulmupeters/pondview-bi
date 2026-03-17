export type ExplorerTableReference = {
  catalog?: string;
  schema?: string;
  table: string;
  includeCatalog?: boolean;
};

function normalizeSegment(value?: string): string {
  return (value ?? "").trim();
}

export function buildExplorerTableReference({
  catalog,
  schema,
  table,
  includeCatalog = false,
}: ExplorerTableReference): string {
  const normalizedCatalog = normalizeSegment(catalog);
  const normalizedSchema = normalizeSegment(schema);
  const normalizedTable = normalizeSegment(table);

  if (!normalizedTable) {
    return "";
  }

  const parts: string[] = [];

  if (includeCatalog && normalizedCatalog) {
    parts.push(normalizedCatalog);
  }

  if (normalizedSchema) {
    const shouldIncludeSchema =
      includeCatalog || normalizedSchema.toLowerCase() !== "main";
    if (shouldIncludeSchema) {
      parts.push(normalizedSchema);
    }
  }

  parts.push(normalizedTable);
  return parts.join(".");
}
