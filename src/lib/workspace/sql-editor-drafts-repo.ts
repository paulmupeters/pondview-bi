import { getPreference, setPreference } from "@/lib/workspace/preferences-repo";

const SQL_EDITOR_DRAFTS_KEY = "workspace:sql-editor-drafts";
const MAX_SQL_EDITOR_DRAFTS = 25;

export type DraftSqlQuery = {
  id: string;
  name: string;
  sql: string;
  createdAt: number;
  updatedAt: number;
};

function formatFallbackDraftName(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `Draft ${year}-${month}-${day} ${hours}:${minutes}`;
}

export function deriveDraftSqlQueryName(
  sql: string,
  timestamp = Date.now(),
): string {
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
  return formatFallbackDraftName(timestamp);
}

function normalizeRow(value: unknown): DraftSqlQuery | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<DraftSqlQuery>;
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

function normalizeList(value: unknown): DraftSqlQuery[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeRow(entry))
    .filter((entry): entry is DraftSqlQuery => entry !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_SQL_EDITOR_DRAFTS);
}

export async function listDraftSqlQueries(): Promise<DraftSqlQuery[]> {
  const stored = await getPreference<unknown>(SQL_EDITOR_DRAFTS_KEY);
  return normalizeList(stored);
}

export async function replaceDraftSqlQueries(
  drafts: DraftSqlQuery[],
): Promise<DraftSqlQuery[]> {
  const normalized = normalizeList(drafts);
  await setPreference(SQL_EDITOR_DRAFTS_KEY, normalized);
  return normalized;
}
