function stripDuckDbPrefix(identifier: string): string {
  return identifier.startsWith("duckdb:")
    ? identifier.slice("duckdb:".length)
    : identifier;
}

export function isMotherDuckIdentifier(value?: string): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return false;
  }

  return stripDuckDbPrefix(trimmed).startsWith("md:");
}

export function extractMotherDuckDatabaseName(value?: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const identifier = stripDuckDbPrefix(trimmed);
  const withoutPrefix = identifier.startsWith("md:")
    ? identifier.slice("md:".length)
    : identifier;
  const queryIndex = withoutPrefix.indexOf("?");
  return (
    (queryIndex >= 0
      ? withoutPrefix.slice(0, queryIndex)
      : withoutPrefix
    ).trim()
  );
}

export function buildMotherDuckIdentifier(databaseNameOrIdentifier: string): string {
  const databaseName = extractMotherDuckDatabaseName(databaseNameOrIdentifier);
  if (!databaseName) {
    return "";
  }

  return `md:${databaseName}`;
}
