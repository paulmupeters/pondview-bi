import {
  exportPublishedNotebookProjectFiles,
  exportSavedQueryProjectFiles,
} from "@/lib/project-artifacts/collect";
import { toProjectArtifactId } from "@/lib/project-artifacts/export";
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

function getNotebookArtifactId(input: {
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

  return toProjectArtifactId(input.title, "notebook");
}

function getNotebookScopePath(input: {
  notebookId: string;
  title: string | null;
  projectPath?: string | null;
}): string {
  return `pondview/notebooks/${getNotebookArtifactId(input)}`;
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

  const previousScopePath = snapshot.notebook.projectPath?.trim() || null;
  const nextScopePath = getNotebookScopePath({
    notebookId,
    title: snapshot.notebook.title,
    projectPath: snapshot.notebook.projectPath ?? null,
  });

  const files = await exportPublishedNotebookProjectFiles({
    notebookId,
    artifactId: getNotebookArtifactId({
      notebookId,
      title: snapshot.notebook.title,
      projectPath: snapshot.notebook.projectPath ?? null,
    }),
  });

  if (previousScopePath && previousScopePath !== nextScopePath) {
    const previousPaths = (await listOpenProjectFiles())
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

  const scopePath = getNotebookScopePath(input);
  const pathsToDelete = (await listOpenProjectFiles())
    .map((file) => file.path)
    .filter((path) => path === scopePath || path.startsWith(`${scopePath}/`));

  if (pathsToDelete.length > 0) {
    await deleteOpenProjectFiles(pathsToDelete);
  }
}
