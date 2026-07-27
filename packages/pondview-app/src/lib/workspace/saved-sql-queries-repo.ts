import { nanoid } from "nanoid";
import type { ProjectArtifactTextFile } from "@/lib/project-artifacts/export";
import { getOpenProject, listOpenProjectFiles } from "@/lib/project-store";
import {
  deleteSavedQueryProjectArtifact,
  getSavedQueryProjectArtifactMetadataPath,
  syncSavedQueryProjectArtifact,
} from "@/lib/project-store/project-artifact-sync";
import { getPreference, setPreference } from "@/lib/workspace/preferences-repo";

const SAVED_SQL_QUERIES_KEY = "workspace:saved-sql-queries";
const MAX_SAVED_SQL_QUERIES = 100;

export type SavedSqlQuery = {
  id: string;
  projectId?: string | null;
  name: string;
  sql: string;
  kind?: "query" | "view";
  sourceRef?: string | null;
  catalogContext?: string | null;
  description?: string | null;
  tags?: string[];
  projectPath?: string | null;
  createdAt: number;
  updatedAt: number;
};

type SavedSqlQueriesRepoDeps = {
  getPreference: typeof getPreference;
  setPreference: typeof setPreference;
  getActiveProjectId: () => Promise<string | null>;
  getActiveProjectFiles: () => Promise<ProjectArtifactTextFile[]>;
  syncProjectArtifact: typeof syncSavedQueryProjectArtifact;
  deleteProjectArtifact: typeof deleteSavedQueryProjectArtifact;
};

const defaultRepoDeps: SavedSqlQueriesRepoDeps = {
  getPreference,
  setPreference,
  getActiveProjectId: async () => (await getOpenProject())?.id ?? null,
  getActiveProjectFiles: listOpenProjectFiles,
  syncProjectArtifact: syncSavedQueryProjectArtifact,
  deleteProjectArtifact: deleteSavedQueryProjectArtifact,
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

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function deriveSavedSqlQueryName(
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
    projectId:
      typeof candidate.projectId === "string" && candidate.projectId.trim()
        ? candidate.projectId.trim()
        : null,
    name: candidate.name,
    sql: candidate.sql,
    kind: candidate.kind === "view" ? "view" : "query",
    sourceRef:
      typeof candidate.sourceRef === "string" ? candidate.sourceRef : null,
    catalogContext:
      typeof candidate.catalogContext === "string"
        ? candidate.catalogContext
        : null,
    description:
      typeof candidate.description === "string" ? candidate.description : null,
    tags: Array.isArray(candidate.tags)
      ? candidate.tags.filter((tag): tag is string => typeof tag === "string")
      : undefined,
    projectPath:
      typeof candidate.projectPath === "string" ? candidate.projectPath : null,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

function normalizeList(value: unknown): SavedSqlQuery[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const countsByProject = new Map<string, number>();
  return value
    .map((entry) => normalizeRow(entry))
    .filter((entry): entry is SavedSqlQuery => entry !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .filter((entry) => {
      const projectKey = entry.projectId ?? "";
      const count = countsByProject.get(projectKey) ?? 0;
      if (count >= MAX_SAVED_SQL_QUERIES) {
        return false;
      }
      countsByProject.set(projectKey, count + 1);
      return true;
    });
}

async function resolveProjectId(
  projectId: string | null | undefined,
  deps: SavedSqlQueriesRepoDeps,
): Promise<string | null> {
  if (projectId !== undefined) {
    return projectId?.trim() || null;
  }
  return deps.getActiveProjectId();
}

function filterByProject(
  queries: SavedSqlQuery[],
  projectId: string | null,
): SavedSqlQuery[] {
  return queries.filter((query) => (query.projectId ?? null) === projectId);
}

function normalizeProjectPath(path: string | null | undefined): string | null {
  const normalized =
    typeof path === "string" ? path.trim().replace(/\\/g, "/") : "";
  return normalized || null;
}

function ensureProjectPath(query: SavedSqlQuery): SavedSqlQuery {
  if (normalizeProjectPath(query.projectPath)) {
    return query;
  }
  return {
    ...query,
    projectPath: getSavedQueryProjectArtifactMetadataPath(query),
  };
}

function claimLegacyQueriesForProject(
  queries: SavedSqlQuery[],
  projectId: string,
  files: ProjectArtifactTextFile[],
): { changed: boolean; queries: SavedSqlQuery[] } {
  const filesByPath = new Map(
    files.map((file) => [normalizeProjectPath(file.path), file.content]),
  );
  const artifacts: Array<{
    metadataPath: string;
    name: string;
    sql: string;
  }> = [];

  for (const file of files) {
    const metadataPath = normalizeProjectPath(file.path);
    if (
      !metadataPath ||
      !/^pondview\/queries\/[^/]+\/[^/]+\.query\.json$/i.test(metadataPath)
    ) {
      continue;
    }
    try {
      const metadata = JSON.parse(file.content) as { name?: unknown };
      const sqlPath = metadataPath.replace(/\.query\.json$/i, ".sql");
      const sql = filesByPath.get(sqlPath);
      if (typeof metadata.name === "string" && typeof sql === "string") {
        artifacts.push({
          metadataPath,
          name: metadata.name.trim(),
          sql: sql.trim(),
        });
      }
    } catch {
      // Invalid project artifacts are handled by the project parser.
    }
  }

  let changed = false;
  const claimed = queries.map((query) => {
    if ((query.projectId ?? null) !== null) {
      return query;
    }
    const normalizedQueryPath = normalizeProjectPath(query.projectPath);
    const artifact = artifacts.find(
      (candidate) =>
        (normalizedQueryPath !== null &&
          candidate.metadataPath === normalizedQueryPath) ||
        (candidate.name === query.name.trim() &&
          candidate.sql === query.sql.trim()),
    );
    if (!artifact) {
      return query;
    }
    changed = true;
    return {
      ...query,
      projectId,
      projectPath: artifact.metadataPath,
    };
  });

  return { changed, queries: claimed };
}

function replaceProjectQueries(
  allQueries: SavedSqlQuery[],
  projectId: string | null,
  projectQueries: SavedSqlQuery[],
): SavedSqlQuery[] {
  return normalizeList([
    ...projectQueries.map((query) => ({ ...query, projectId })),
    ...allQueries.filter((query) => (query.projectId ?? null) !== projectId),
  ]);
}

async function readProjectQueries(
  projectId: string | null | undefined,
  deps: SavedSqlQueriesRepoDeps,
): Promise<{
  all: SavedSqlQuery[];
  projectId: string | null;
  scoped: SavedSqlQuery[];
}> {
  const resolvedProjectId = await resolveProjectId(projectId, deps);
  let all = normalizeList(
    await deps.getPreference<unknown>(SAVED_SQL_QUERIES_KEY),
  );

  if (resolvedProjectId) {
    const claimed = claimLegacyQueriesForProject(
      all,
      resolvedProjectId,
      await deps.getActiveProjectFiles(),
    );
    all = claimed.queries;
    if (claimed.changed) {
      await deps.setPreference(SAVED_SQL_QUERIES_KEY, all);
    }
  }

  return {
    all,
    projectId: resolvedProjectId,
    scoped: filterByProject(all, resolvedProjectId),
  };
}

export async function migrateLegacySavedSqlQueriesToProject(
  projectId: string,
  deps: SavedSqlQueriesRepoDeps = defaultRepoDeps,
): Promise<void> {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) {
    return;
  }
  const all = normalizeList(
    await deps.getPreference<unknown>(SAVED_SQL_QUERIES_KEY),
  );
  const claimed = claimLegacyQueriesForProject(
    all,
    normalizedProjectId,
    await deps.getActiveProjectFiles(),
  );
  if (claimed.changed) {
    await deps.setPreference(SAVED_SQL_QUERIES_KEY, claimed.queries);
  }
}

export async function listSavedSqlQueries(
  projectId?: string | null,
  deps: SavedSqlQueriesRepoDeps = defaultRepoDeps,
): Promise<SavedSqlQuery[]> {
  return (await readProjectQueries(projectId, deps)).scoped;
}

export async function saveSqlQuery(
  input: {
    sql: string;
    name: string;
    kind?: "query" | "view";
    sourceRef?: string | null;
    catalogContext?: string | null;
    description?: string | null;
    tags?: string[];
    projectPath?: string | null;
  },
  deps: SavedSqlQueriesRepoDeps = defaultRepoDeps,
): Promise<SavedSqlQuery[]> {
  const normalizedSql = input.sql.trim();
  const normalizedName = input.name.trim();

  if (!normalizedSql || !normalizedName) {
    return listSavedSqlQueries(undefined, deps);
  }

  const now = Date.now();
  const state = await readProjectQueries(undefined, deps);
  const existing = state.scoped;
  const duplicate = existing.find((entry) => entry.sql === normalizedSql);
  const duplicateByName = existing.find(
    (entry) => normalizeName(entry.name) === normalizeName(normalizedName),
  );

  let next: SavedSqlQuery[];
  if (duplicate) {
    const updated: SavedSqlQuery = {
      ...duplicate,
      name: normalizedName,
      kind: input.kind ?? duplicate.kind,
      sourceRef: input.sourceRef ?? duplicate.sourceRef,
      catalogContext: input.catalogContext ?? duplicate.catalogContext,
      description: input.description ?? duplicate.description,
      tags: input.tags ?? duplicate.tags,
      projectPath: input.projectPath ?? duplicate.projectPath,
      updatedAt: now,
    };
    next = [
      updated,
      ...existing.filter(
        (entry) =>
          entry.id !== duplicate.id &&
          normalizeName(entry.name) !== normalizeName(normalizedName),
      ),
    ];
  } else if (duplicateByName) {
    const replaced: SavedSqlQuery = {
      ...duplicateByName,
      sql: normalizedSql,
      kind: input.kind ?? duplicateByName.kind,
      sourceRef: input.sourceRef ?? duplicateByName.sourceRef,
      catalogContext: input.catalogContext ?? duplicateByName.catalogContext,
      description: input.description ?? duplicateByName.description,
      tags: input.tags ?? duplicateByName.tags,
      projectPath: input.projectPath ?? duplicateByName.projectPath,
      updatedAt: now,
    };
    next = [
      replaced,
      ...existing.filter((entry) => entry.id !== duplicateByName.id),
    ];
  } else {
    const created: SavedSqlQuery = {
      id: `saved-sql-${nanoid()}`,
      projectId: state.projectId,
      name: normalizedName,
      sql: normalizedSql,
      kind: input.kind ?? "query",
      sourceRef: input.sourceRef ?? null,
      catalogContext: input.catalogContext ?? null,
      description: input.description ?? null,
      tags: input.tags,
      projectPath: input.projectPath ?? null,
      createdAt: now,
      updatedAt: now,
    };
    next = [created, ...existing];
  }

  const persisted = next
    .slice(0, MAX_SAVED_SQL_QUERIES)
    .map((query) => ensureProjectPath(query));
  await deps.setPreference(
    SAVED_SQL_QUERIES_KEY,
    replaceProjectQueries(state.all, state.projectId, persisted),
  );
  const savedQuery = persisted.find(
    (entry) =>
      entry.sql === normalizedSql &&
      normalizeName(entry.name) === normalizeName(normalizedName),
  );
  if (savedQuery) {
    await deps.syncProjectArtifact(savedQuery.id);
  }
  return persisted;
}

export async function upsertSavedSqlQuery(
  query: SavedSqlQuery,
  deps: SavedSqlQueriesRepoDeps = defaultRepoDeps,
): Promise<SavedSqlQuery[]> {
  const normalizedSql = query.sql.trim();
  const normalizedName = query.name.trim();
  if (!query.id.trim() || !normalizedSql || !normalizedName) {
    return listSavedSqlQueries(undefined, deps);
  }

  const activeProjectId = await resolveProjectId(undefined, deps);
  const targetProjectId =
    typeof query.projectId === "string" && query.projectId.trim()
      ? query.projectId.trim()
      : activeProjectId;
  const state = await readProjectQueries(targetProjectId, deps);
  const now = query.updatedAt || Date.now();
  const existing = state.scoped;
  const createdAt =
    query.createdAt ||
    existing.find((entry) => entry.id === query.id)?.createdAt ||
    now;
  const upserted = ensureProjectPath({
    ...query,
    id: query.id.trim(),
    projectId: targetProjectId,
    name: normalizedName,
    sql: normalizedSql,
    kind: query.kind ?? "query",
    sourceRef: query.sourceRef ?? null,
    catalogContext: query.catalogContext ?? null,
    description: query.description ?? null,
    projectPath: query.projectPath ?? null,
    createdAt,
    updatedAt: now,
  });
  const next = [
    upserted,
    ...existing.filter((entry) => entry.id !== upserted.id),
  ].slice(0, MAX_SAVED_SQL_QUERIES);

  await deps.setPreference(
    SAVED_SQL_QUERIES_KEY,
    replaceProjectQueries(state.all, targetProjectId, next),
  );
  await deps.syncProjectArtifact(upserted.id);
  return next;
}

export async function renameSavedSqlQuery(
  id: string,
  name: string,
  deps: SavedSqlQueriesRepoDeps = defaultRepoDeps,
): Promise<SavedSqlQuery[]> {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return listSavedSqlQueries(undefined, deps);
  }

  const now = Date.now();
  const state = await readProjectQueries(undefined, deps);
  const existing = state.scoped;
  const target = existing.find((entry) => entry.id === id);
  if (!target) {
    return existing;
  }

  const updated = ensureProjectPath({
    ...target,
    name: normalizedName,
    updatedAt: now,
  });

  const next = [
    updated,
    ...existing.filter(
      (entry) =>
        entry.id !== id &&
        normalizeName(entry.name) !== normalizeName(normalizedName),
    ),
  ].slice(0, MAX_SAVED_SQL_QUERIES);

  await deps.setPreference(
    SAVED_SQL_QUERIES_KEY,
    replaceProjectQueries(state.all, state.projectId, next),
  );
  await deps.syncProjectArtifact(updated.id);
  return next;
}

export async function deleteSavedSqlQuery(
  id: string,
  deps: SavedSqlQueriesRepoDeps = defaultRepoDeps,
): Promise<SavedSqlQuery[]> {
  const state = await readProjectQueries(undefined, deps);
  const existing = state.scoped;
  const deleted = existing.find((entry) => entry.id === id) ?? null;
  const next = existing.filter((entry) => entry.id !== id);
  await deps.setPreference(
    SAVED_SQL_QUERIES_KEY,
    replaceProjectQueries(state.all, state.projectId, next),
  );
  if (deleted) {
    await deps.deleteProjectArtifact(deleted);
  }
  return next;
}

export {
  exportWorkspace,
  importWorkspace,
  resetWorkspace,
  validateWorkspaceImport,
} from "@/lib/workspace/export-import";
