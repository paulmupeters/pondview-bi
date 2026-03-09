import { nanoid } from "nanoid";
import {
  getPreference,
  setPreference,
} from "@/lib/workspace/preferences-repo";

const SAVED_SQL_QUERIES_KEY = "workspace:saved-sql-queries";
const MAX_SAVED_SQL_QUERIES = 100;

export type SavedSqlQuery = {
  id: string;
  name: string;
  sql: string;
  createdAt: number;
  updatedAt: number;
};

function formatFallbackName(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `Query ${year}-${month}-${day} ${hours}:${minutes}`;
}

function deriveNameFromSql(sql: string, timestamp: number): string {
  const lines = sql.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (
      trimmed.startsWith("--") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("*/")
    ) {
      continue;
    }
    return trimmed.slice(0, 48);
  }
  return formatFallbackName(timestamp);
}

function normalizeRow(value: unknown): SavedSqlQuery | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<SavedSqlQuery>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.sql !== "string" ||
    typeof candidate.createdAt !== "number" ||
    typeof candidate.updatedAt !== "number"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name,
    sql: candidate.sql,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

function normalizeList(value: unknown): SavedSqlQuery[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeRow(entry))
    .filter((entry): entry is SavedSqlQuery => entry !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_SAVED_SQL_QUERIES);
}

export async function listSavedSqlQueries(): Promise<SavedSqlQuery[]> {
  const stored = await getPreference<unknown>(SAVED_SQL_QUERIES_KEY);
  return normalizeList(stored);
}

export async function saveSqlQuery(sql: string): Promise<SavedSqlQuery[]> {
  const normalizedSql = sql.trim();
  if (!normalizedSql) {
    return listSavedSqlQueries();
  }

  const now = Date.now();
  const existing = await listSavedSqlQueries();
  const duplicate = existing.find((entry) => entry.sql === normalizedSql);

  let next: SavedSqlQuery[];
  if (duplicate) {
    const updated: SavedSqlQuery = {
      ...duplicate,
      updatedAt: now,
    };
    next = [updated, ...existing.filter((entry) => entry.id !== duplicate.id)];
  } else {
    const created: SavedSqlQuery = {
      id: `saved-sql-${nanoid()}`,
      name: deriveNameFromSql(normalizedSql, now),
      sql: normalizedSql,
      createdAt: now,
      updatedAt: now,
    };
    next = [created, ...existing];
  }

  const persisted = next.slice(0, MAX_SAVED_SQL_QUERIES);
  await setPreference(SAVED_SQL_QUERIES_KEY, persisted);
  return persisted;
}

export async function deleteSavedSqlQuery(id: string): Promise<SavedSqlQuery[]> {
  const existing = await listSavedSqlQueries();
  const next = existing.filter((entry) => entry.id !== id);
  await setPreference(SAVED_SQL_QUERIES_KEY, next);
  return next;
}
