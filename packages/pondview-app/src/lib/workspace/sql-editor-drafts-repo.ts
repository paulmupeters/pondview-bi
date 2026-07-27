import { getOpenProject } from "@/lib/project-store";
import { getPreference, setPreference } from "@/lib/workspace/preferences-repo";

const SQL_EDITOR_DRAFTS_KEY = "workspace:sql-editor-drafts";
const MAX_SQL_EDITOR_DRAFTS = 25;

export type DraftSqlQuery = {
  id: string;
  projectId?: string | null;
  name: string;
  sql: string;
  createdAt: number;
  updatedAt: number;
};

type SqlQueryDraftsRepoDeps = {
  getPreference: typeof getPreference;
  setPreference: typeof setPreference;
  getActiveProjectId: () => Promise<string | null>;
};

const defaultRepoDeps: SqlQueryDraftsRepoDeps = {
  getPreference,
  setPreference,
  getActiveProjectId: async () => (await getOpenProject())?.id ?? null,
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
    projectId:
      typeof candidate.projectId === "string" && candidate.projectId.trim()
        ? candidate.projectId.trim()
        : null,
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

  const countsByProject = new Map<string, number>();
  return value
    .map((entry) => normalizeRow(entry))
    .filter((entry): entry is DraftSqlQuery => entry !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .filter((entry) => {
      const projectKey = entry.projectId ?? "";
      const count = countsByProject.get(projectKey) ?? 0;
      if (count >= MAX_SQL_EDITOR_DRAFTS) {
        return false;
      }
      countsByProject.set(projectKey, count + 1);
      return true;
    });
}

async function resolveProjectId(
  projectId: string | null | undefined,
  deps: SqlQueryDraftsRepoDeps,
): Promise<string | null> {
  if (projectId !== undefined) {
    return projectId?.trim() || null;
  }
  return deps.getActiveProjectId();
}

export async function migrateLegacyDraftSqlQueriesToProject(
  projectId: string,
  deps: SqlQueryDraftsRepoDeps = defaultRepoDeps,
): Promise<void> {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) {
    return;
  }
  const all = normalizeList(
    await deps.getPreference<unknown>(SQL_EDITOR_DRAFTS_KEY),
  );
  if (!all.some((draft) => (draft.projectId ?? null) === null)) {
    return;
  }
  await deps.setPreference(
    SQL_EDITOR_DRAFTS_KEY,
    all.map((draft) =>
      (draft.projectId ?? null) === null
        ? { ...draft, projectId: normalizedProjectId }
        : draft,
    ),
  );
}

export async function listDraftSqlQueries(
  projectId?: string | null,
  deps: SqlQueryDraftsRepoDeps = defaultRepoDeps,
): Promise<DraftSqlQuery[]> {
  const resolvedProjectId = await resolveProjectId(projectId, deps);
  const all = normalizeList(
    await deps.getPreference<unknown>(SQL_EDITOR_DRAFTS_KEY),
  );
  return all.filter((draft) => (draft.projectId ?? null) === resolvedProjectId);
}

export async function replaceDraftSqlQueries(
  drafts: DraftSqlQuery[],
  projectId?: string | null,
  deps: SqlQueryDraftsRepoDeps = defaultRepoDeps,
): Promise<DraftSqlQuery[]> {
  const resolvedProjectId = await resolveProjectId(projectId, deps);
  const all = normalizeList(
    await deps.getPreference<unknown>(SQL_EDITOR_DRAFTS_KEY),
  );
  const normalized = normalizeList(
    drafts.map((draft) => ({ ...draft, projectId: resolvedProjectId })),
  );
  await deps.setPreference(SQL_EDITOR_DRAFTS_KEY, [
    ...normalized,
    ...all.filter((draft) => (draft.projectId ?? null) !== resolvedProjectId),
  ]);
  return normalized;
}
