import { canonicalTable } from "@/lib/joins/loader";

const TABLE_REF_PATTERN =
  /\b(?:from|join)\s+((?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)(?:\.(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\w+))?)(?:\s+(?:as\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi;

const BASE_FROM_PATTERN =
  /\bfrom\s+((?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)(?:\.(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\w+))?)(?:\s+(?:as\s+)?([A-Za-z_][A-Za-z0-9_]*))?/i;

export interface SqlTableReference {
  rawReference: string;
  tableName: string;
  alias?: string;
}

export interface BaseTableReference extends SqlTableReference {
  matchedFromClause: string;
}

export function extractTableNamesFromSql(sql: string): string[] {
  const refs = extractTableReferencesFromSql(sql);
  return Array.from(new Set(refs.map((ref) => ref.tableName)));
}

export function extractTableReferencesFromSql(sql: string): SqlTableReference[] {
  const references: SqlTableReference[] = [];
  const matcher = new RegExp(TABLE_REF_PATTERN.source, TABLE_REF_PATTERN.flags);
  let match = matcher.exec(sql);

  while (match) {
    const rawReference = (match[1] ?? "").trim();
    if (rawReference && !rawReference.startsWith("(")) {
      const tableName = canonicalTable(rawReference);
      if (tableName) {
        references.push({
          rawReference,
          tableName,
          alias: match[2]?.trim() || undefined,
        });
      }
    }
    match = matcher.exec(sql);
  }

  return references;
}

export function findBaseTableReference(sql: string): BaseTableReference | null {
  const match = BASE_FROM_PATTERN.exec(sql);
  if (!match) {
    return null;
  }

  const rawReference = (match[1] ?? "").trim();
  if (!rawReference || rawReference.startsWith("(")) {
    return null;
  }

  const tableName = canonicalTable(rawReference);
  if (!tableName) {
    return null;
  }

  return {
    rawReference,
    tableName,
    alias: match[2]?.trim() || undefined,
    matchedFromClause: match[0],
  };
}
