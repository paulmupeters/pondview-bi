import {
  deleteAnalysisCellsByNotebookId,
  deleteAnalysisNotebook,
  listAnalysisNotebooks,
  upsertAnalysisCell,
  upsertAnalysisNotebook,
} from "@/lib/workspace/analysis-notebook-repo";
import {
  deleteDashboard,
  listDashboards,
  replaceDashboardFromProject,
} from "@/lib/workspace/dashboard-repo";
import {
  deleteSavedSqlQuery,
  listSavedSqlQueries,
  type SavedSqlQuery,
  upsertSavedSqlQuery,
} from "@/lib/workspace/saved-sql-queries-repo";
import type {
  WorkspaceAnalysisCell,
  WorkspaceAnalysisNotebook,
  WorkspaceDashboard,
} from "@/lib/workspace/workspace-db";
import type {
  ExportedDashboardArtifact,
  ExportedPublishedNotebookArtifact,
  ExportedSharedQueryArtifact,
} from "./export";
import {
  hydrateDashboardArtifact,
  hydratePublishedNotebookArtifact,
  hydrateSharedQueryArtifact,
  type ProjectArtifactHydrationOptions,
} from "./hydrate";
import type { ParsedProjectArtifacts } from "./parse";

export type ProjectArtifactImportDeps = {
  listSavedSqlQueries: () => Promise<SavedSqlQuery[]>;
  upsertSavedSqlQuery: (query: SavedSqlQuery) => Promise<SavedSqlQuery[]>;
  deleteSavedSqlQuery: (queryId: string) => Promise<SavedSqlQuery[]>;
  listDashboards: () => Promise<WorkspaceDashboard[]>;
  replaceDashboardFromProject: typeof replaceDashboardFromProject;
  deleteDashboard: (dashboardId: string) => Promise<{ deleted: boolean }>;
  listAnalysisNotebooks: () => Promise<WorkspaceAnalysisNotebook[]>;
  upsertAnalysisNotebook: (
    notebook: WorkspaceAnalysisNotebook,
  ) => Promise<void>;
  deleteAnalysisCellsByNotebookId: (notebookId: string) => Promise<void>;
  upsertAnalysisCell: (cell: WorkspaceAnalysisCell) => Promise<void>;
  deleteAnalysisNotebook: (notebookId: string) => Promise<void>;
};

const defaultImportDeps: ProjectArtifactImportDeps = {
  listSavedSqlQueries,
  upsertSavedSqlQuery,
  deleteSavedSqlQuery,
  listDashboards,
  replaceDashboardFromProject,
  deleteDashboard,
  listAnalysisNotebooks,
  upsertAnalysisNotebook,
  deleteAnalysisCellsByNotebookId,
  upsertAnalysisCell,
  deleteAnalysisNotebook,
};

type ProjectImportReconciliationResult = {
  deletedDashboardIds: string[];
  deletedSavedQueryIds: string[];
  deletedNotebookIds: string[];
};

function normalizeProjectPath(path: string | null | undefined): string | null {
  const normalized =
    typeof path === "string" ? path.trim().replace(/\\/g, "/") : "";
  return normalized.length > 0 ? normalized : null;
}

function isProjectOwnedPath(
  path: string | null | undefined,
  rootPath: string,
): boolean {
  const normalizedPath = normalizeProjectPath(path);
  return normalizedPath
    ? normalizedPath === rootPath || normalizedPath.startsWith(`${rootPath}/`)
    : false;
}

type ProjectPathBackedAsset = {
  id: string;
  projectPath?: string | null;
  createdAt?: number;
};

function getProjectArtifactPathId(rootPath: string): string | null {
  const pathSegments = normalizeProjectPath(rootPath)?.split("/") ?? [];
  return pathSegments.at(-1)?.trim() || null;
}

function selectExistingProjectPathAsset<T extends ProjectPathBackedAsset>(
  assets: T[],
  rootPath: string,
  manifestId: string,
): T | null {
  const normalizedRootPath = normalizeProjectPath(rootPath);
  if (!normalizedRootPath) {
    return null;
  }

  const matches = assets.filter(
    (asset) => normalizeProjectPath(asset.projectPath) === normalizedRootPath,
  );
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0] ?? null;
  }

  const artifactPathId = getProjectArtifactPathId(rootPath);
  const preferNonManifestId = manifestId === artifactPathId;

  return (
    [...matches].sort((left, right) => {
      if (preferNonManifestId) {
        const leftIsManifestId = left.id === manifestId;
        const rightIsManifestId = right.id === manifestId;
        if (leftIsManifestId !== rightIsManifestId) {
          return leftIsManifestId ? 1 : -1;
        }
      } else {
        const leftIsManifestId = left.id === manifestId;
        const rightIsManifestId = right.id === manifestId;
        if (leftIsManifestId !== rightIsManifestId) {
          return leftIsManifestId ? -1 : 1;
        }
      }

      return (
        (left.createdAt ?? Number.MAX_SAFE_INTEGER) -
        (right.createdAt ?? Number.MAX_SAFE_INTEGER)
      );
    })[0] ?? null
  );
}

function filterAnalysisNotebooksByProjectId(
  notebooks: WorkspaceAnalysisNotebook[],
  projectId: string | null | undefined,
): WorkspaceAnalysisNotebook[] {
  if (!projectId) {
    return notebooks;
  }

  return notebooks.filter((notebook) => notebook.projectId === projectId);
}

async function reconcileProjectOwnedQueries(
  parsed: ParsedProjectArtifacts,
  deps: ProjectArtifactImportDeps,
): Promise<string[]> {
  const importedPaths = new Set(
    parsed.sharedQueries
      .map((artifact) => normalizeProjectPath(artifact.metadataPath))
      .filter((path): path is string => path !== null),
  );
  const deletedIds: string[] = [];

  for (const query of await deps.listSavedSqlQueries()) {
    const projectPath = normalizeProjectPath(query.projectPath);
    if (!isProjectOwnedPath(projectPath, "pondview/queries")) {
      continue;
    }
    if (projectPath && importedPaths.has(projectPath)) {
      continue;
    }

    await deps.deleteSavedSqlQuery(query.id);
    deletedIds.push(query.id);
  }

  return deletedIds;
}

async function reconcileProjectOwnedDashboards(
  parsed: ParsedProjectArtifacts,
  deps: ProjectArtifactImportDeps,
): Promise<string[]> {
  const importedPaths = new Set(
    parsed.dashboards
      .map((artifact) => normalizeProjectPath(artifact.rootPath))
      .filter((path): path is string => path !== null),
  );
  const deletedIds: string[] = [];

  for (const dashboard of await deps.listDashboards()) {
    const projectPath = normalizeProjectPath(dashboard.projectPath);
    if (!isProjectOwnedPath(projectPath, "pondview/dashboards")) {
      continue;
    }
    if (projectPath && importedPaths.has(projectPath)) {
      continue;
    }

    const deleted = await deps.deleteDashboard(dashboard.id);
    if (deleted.deleted) {
      deletedIds.push(dashboard.id);
    }
  }

  return deletedIds;
}

async function reconcileProjectOwnedNotebooks(
  parsed: ParsedProjectArtifacts,
  deps: ProjectArtifactImportDeps,
  projectId?: string | null,
): Promise<string[]> {
  const importedPaths = new Set(
    parsed.publishedNotebooks
      .map((artifact) => normalizeProjectPath(artifact.rootPath))
      .filter((path): path is string => path !== null),
  );
  const deletedIds: string[] = [];

  for (const notebook of await deps.listAnalysisNotebooks()) {
    if (projectId && notebook.projectId !== projectId) {
      continue;
    }

    const projectPath = normalizeProjectPath(notebook.projectPath);
    if (!isProjectOwnedPath(projectPath, "pondview/notebooks")) {
      continue;
    }
    if (projectPath && importedPaths.has(projectPath)) {
      continue;
    }

    await deps.deleteAnalysisNotebook(notebook.id);
    deletedIds.push(notebook.id);
  }

  return deletedIds;
}

async function reconcileImportedProjectArtifacts(
  parsed: ParsedProjectArtifacts,
  deps: ProjectArtifactImportDeps,
  options: ProjectArtifactHydrationOptions,
): Promise<ProjectImportReconciliationResult> {
  const [deletedSavedQueryIds, deletedDashboardIds, deletedNotebookIds] =
    await Promise.all([
      reconcileProjectOwnedQueries(parsed, deps),
      reconcileProjectOwnedDashboards(parsed, deps),
      reconcileProjectOwnedNotebooks(parsed, deps, options.projectId),
    ]);

  return {
    deletedDashboardIds,
    deletedSavedQueryIds,
    deletedNotebookIds,
  };
}

export async function importSharedQueryProjectArtifact(
  artifact: ExportedSharedQueryArtifact,
  options: ProjectArtifactHydrationOptions = {},
  deps = defaultImportDeps,
): Promise<SavedSqlQuery> {
  const query = hydrateSharedQueryArtifact(artifact, options);
  await deps.upsertSavedSqlQuery(query);
  return query;
}

export async function importPublishedNotebookProjectArtifact(
  artifact: ExportedPublishedNotebookArtifact,
  options: ProjectArtifactHydrationOptions = {},
  deps = defaultImportDeps,
): Promise<{
  notebook: WorkspaceAnalysisNotebook;
  cells: WorkspaceAnalysisCell[];
}> {
  const existingNotebook = selectExistingProjectPathAsset(
    filterAnalysisNotebooksByProjectId(
      await deps.listAnalysisNotebooks(),
      options.projectId,
    ),
    artifact.rootPath,
    artifact.manifest.id,
  );
  const hydrated = hydratePublishedNotebookArtifact(
    existingNotebook && existingNotebook.id !== artifact.manifest.id
      ? {
          ...artifact,
          manifest: {
            ...artifact.manifest,
            id: existingNotebook.id,
          },
        }
      : artifact,
    options,
  );
  await deps.upsertAnalysisNotebook(hydrated.notebook);
  await deps.deleteAnalysisCellsByNotebookId(hydrated.notebook.id);
  for (const cell of hydrated.cells) {
    await deps.upsertAnalysisCell(cell);
  }
  return hydrated;
}

export async function importDashboardProjectArtifact(
  artifact: ExportedDashboardArtifact,
  options: ProjectArtifactHydrationOptions = {},
  deps = defaultImportDeps,
): Promise<{ id: string }> {
  const existingDashboard = selectExistingProjectPathAsset(
    await deps.listDashboards(),
    artifact.rootPath,
    artifact.manifest.id,
  );
  const hydrated = hydrateDashboardArtifact(
    existingDashboard && existingDashboard.id !== artifact.manifest.id
      ? {
          ...artifact,
          manifest: {
            ...artifact.manifest,
            id: existingDashboard.id,
          },
        }
      : artifact,
    options,
  );
  return deps.replaceDashboardFromProject({
    dashboard: hydrated.dashboard,
    charts: hydrated.charts,
    measures: hydrated.measures,
    slicers: hydrated.slicers,
    joinDefs: hydrated.joins,
  });
}

export async function importParsedProjectArtifacts(
  parsed: ParsedProjectArtifacts,
  options: ProjectArtifactHydrationOptions = {},
  deps = defaultImportDeps,
): Promise<{
  dashboards: { id: string }[];
  sharedQueries: SavedSqlQuery[];
  publishedNotebooks: {
    notebook: WorkspaceAnalysisNotebook;
    cells: WorkspaceAnalysisCell[];
  }[];
  reconciliation: ProjectImportReconciliationResult;
}> {
  const hydrationOptions = {
    ...options,
    localSourceBindings:
      options.localSourceBindings ?? parsed.localSourceBindings ?? null,
    defaultSourceRef:
      options.defaultSourceRef ?? parsed.projectManifest?.defaultSourceRef,
  };
  const reconciliation = await reconcileImportedProjectArtifacts(
    parsed,
    deps,
    hydrationOptions,
  );

  const dashboards = [];
  for (const dashboard of parsed.dashboards) {
    dashboards.push(
      await importDashboardProjectArtifact(dashboard, hydrationOptions, deps),
    );
  }

  const sharedQueries = [];
  for (const query of parsed.sharedQueries) {
    sharedQueries.push(
      await importSharedQueryProjectArtifact(query, hydrationOptions, deps),
    );
  }

  const publishedNotebooks = [];
  for (const notebook of parsed.publishedNotebooks) {
    publishedNotebooks.push(
      await importPublishedNotebookProjectArtifact(
        notebook,
        hydrationOptions,
        deps,
      ),
    );
  }

  return {
    dashboards,
    sharedQueries,
    publishedNotebooks,
    reconciliation,
  };
}
