import {
  exportPublishedNotebookProjectFiles,
  exportSavedQueryProjectFiles,
} from "@/lib/project-artifacts/collect";
import {
  type ProjectArtifactTextFile,
  toProjectArtifactId,
} from "@/lib/project-artifacts/export";
import {
  getAnalysisNotebookSnapshot,
  upsertAnalysisNotebook,
} from "@/lib/workspace/analysis-notebook-repo";
import type { SavedSqlQuery } from "@/lib/workspace/saved-sql-queries-repo";
import { listSavedSqlQueries } from "@/lib/workspace/saved-sql-queries-repo";
import {
  deleteOpenProjectFiles,
  getOpenProject,
  listOpenProjectFiles,
  replaceOpenProjectFiles,
} from "./index";

function getSavedQueryGroup(query: SavedSqlQuery): string {
  if (!query.projectPath) {
    return "shared";
  }

  const normalizedPath = query.projectPath.replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter(Boolean);
  const queriesIndex = segments.indexOf("queries");
  if (queriesIndex === -1) {
    return "shared";
  }

  const group = segments[queriesIndex + 1];
  return group?.trim() ? group : "shared";
}

function getSavedQueryArtifactId(query: SavedSqlQuery): string {
  if (query.projectPath) {
    const normalizedPath = query.projectPath.replace(/\\/g, "/");
    const fileName = normalizedPath.split("/").filter(Boolean).at(-1) ?? "";
    const withoutExtension = fileName.replace(/\.query\.json$/i, "");
    if (withoutExtension.trim()) {
      return withoutExtension.trim();
    }
  }

  return toProjectArtifactId(query.name, "saved-query");
}

function getSavedQueryScopePath(query: SavedSqlQuery): string {
  return `pondview/queries/${getSavedQueryGroup(query)}`;
}

function getSavedQueryArtifactPaths(query: SavedSqlQuery): string[] {
  const group = getSavedQueryGroup(query);
  const artifactId = getSavedQueryArtifactId(query);
  const rootPath = `pondview/queries/${group}`;
  return [
    `${rootPath}/${artifactId}.query.json`,
    `${rootPath}/${artifactId}.sql`,
  ];
}

function normalizeProjectPath(path: string | null | undefined): string | null {
  const normalized =
    typeof path === "string"
      ? path.trim().replace(/\\/g, "/").replace(/\/+$/, "")
      : "";
  return normalized.length > 0 ? normalized : null;
}

function getManifestId(file: ProjectArtifactTextFile): string | null {
  try {
    const parsed = JSON.parse(file.content) as { id?: unknown };
    return typeof parsed.id === "string" && parsed.id.trim()
      ? parsed.id.trim()
      : null;
  } catch {
    return null;
  }
}

export function findPublishedNotebookProjectPathByManifestId(
  files: ProjectArtifactTextFile[],
  notebookId: string,
): string | null {
  for (const file of files) {
    const path = normalizeProjectPath(file.path);
    if (!path || !/^pondview\/notebooks\/[^/]+\/notebook\.json$/.test(path)) {
      continue;
    }

    if (getManifestId(file) === notebookId) {
      return path.replace(/\/notebook\.json$/, "");
    }
  }

  return null;
}

export function getPublishedNotebookProjectArtifactId(input: {
  notebookId: string;
  title: string | null;
  projectPath?: string | null;
}): string {
  if (input.projectPath) {
    const normalizedPath = input.projectPath.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter(Boolean);
    const notebooksIndex = segments.indexOf("notebooks");
    const artifactId = segments[notebooksIndex + 1];
    if (artifactId?.trim()) {
      return artifactId.trim();
    }
  }

  const titleId = toProjectArtifactId(input.title, "notebook");
  const notebookId = toProjectArtifactId(input.notebookId, "notebook");
  return titleId === notebookId ? titleId : `${titleId}-${notebookId}`;
}

export function getPublishedNotebookProjectScopePath(input: {
  notebookId: string;
  title: string | null;
  projectPath?: string | null;
}): string {
  return `pondview/notebooks/${getPublishedNotebookProjectArtifactId(input)}`;
}

export async function syncSavedQueryProjectArtifact(
  queryId: string,
): Promise<void> {
  const project = await getOpenProject();
  if (!project) {
    return;
  }

  const query = (await listSavedSqlQueries()).find(
    (entry) => entry.id === queryId,
  );
  if (!query) {
    return;
  }

  const files = await exportSavedQueryProjectFiles({
    queryId: query.id,
    group: getSavedQueryGroup(query),
    artifactId: getSavedQueryArtifactId(query),
    kind: query.kind ?? "query",
    sourceRef: query.sourceRef ?? null,
    catalogContext: query.catalogContext ?? null,
    description: query.description ?? null,
    tags: query.tags,
    requireSourceRef: false,
  });

  await replaceOpenProjectFiles(getSavedQueryScopePath(query), files);
}

export async function deleteSavedQueryProjectArtifact(
  query: Pick<SavedSqlQuery, "name" | "projectPath">,
): Promise<void> {
  const project = await getOpenProject();
  if (!project) {
    return;
  }

  const artifactLikeQuery: SavedSqlQuery = {
    id: "deleted-query",
    name: query.name,
    sql: "",
    createdAt: 0,
    updatedAt: 0,
    projectPath: query.projectPath ?? null,
  };

  await deleteOpenProjectFiles(getSavedQueryArtifactPaths(artifactLikeQuery));
}

export async function syncPublishedNotebookProjectArtifact(
  notebookId: string,
): Promise<void> {
  const project = await getOpenProject();
  if (!project) {
    return;
  }

  const snapshot = await getAnalysisNotebookSnapshot(notebookId);
  if (!snapshot.notebook) {
    return;
  }

  const projectFiles = await listOpenProjectFiles();
  const previousScopePath =
    normalizeProjectPath(snapshot.notebook.projectPath) ??
    findPublishedNotebookProjectPathByManifestId(projectFiles, notebookId);
  const nextScopePath = getPublishedNotebookProjectScopePath({
    notebookId,
    title: snapshot.notebook.title,
    projectPath: previousScopePath,
  });

  const files = await exportPublishedNotebookProjectFiles({
    notebookId,
    artifactId: getPublishedNotebookProjectArtifactId({
      notebookId,
      title: snapshot.notebook.title,
      projectPath: previousScopePath,
    }),
  });

  if (previousScopePath && previousScopePath !== nextScopePath) {
    const previousPaths = projectFiles
      .map((file) => file.path)
      .filter(
        (path) =>
          path === previousScopePath ||
          path.startsWith(`${previousScopePath}/`),
      );
    if (previousPaths.length > 0) {
      await deleteOpenProjectFiles(previousPaths);
    }
  }

  await replaceOpenProjectFiles(nextScopePath, files);
  await upsertAnalysisNotebook({
    ...snapshot.notebook,
    projectId: project.id,
    projectPath: nextScopePath,
  });
}

export async function deletePublishedNotebookProjectArtifact(input: {
  notebookId: string;
  title: string | null;
  projectPath?: string | null;
}): Promise<void> {
  const project = await getOpenProject();
  if (!project) {
    return;
  }

  if (!input.projectPath?.trim()) {
    return;
  }

  const scopePath = getPublishedNotebookProjectScopePath(input);
  const pathsToDelete = (await listOpenProjectFiles())
    .map((file) => file.path)
    .filter((path) => path === scopePath || path.startsWith(`${scopePath}/`));

  if (pathsToDelete.length > 0) {
    await deleteOpenProjectFiles(pathsToDelete);
  }
}
