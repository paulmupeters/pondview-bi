import {
  deleteAnalysisCellsByNotebookId,
  upsertAnalysisCell,
  upsertAnalysisNotebook,
} from "@/lib/workspace/analysis-notebook-repo";
import { replaceDashboardFromProject } from "@/lib/workspace/dashboard-repo";
import {
  type SavedSqlQuery,
  upsertSavedSqlQuery,
} from "@/lib/workspace/saved-sql-queries-repo";
import type {
  WorkspaceAnalysisCell,
  WorkspaceAnalysisNotebook,
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
  upsertSavedSqlQuery: (query: SavedSqlQuery) => Promise<SavedSqlQuery[]>;
  replaceDashboardFromProject: typeof replaceDashboardFromProject;
  upsertAnalysisNotebook: (
    notebook: WorkspaceAnalysisNotebook,
  ) => Promise<void>;
  deleteAnalysisCellsByNotebookId: (notebookId: string) => Promise<void>;
  upsertAnalysisCell: (cell: WorkspaceAnalysisCell) => Promise<void>;
};

const defaultImportDeps: ProjectArtifactImportDeps = {
  upsertSavedSqlQuery,
  replaceDashboardFromProject,
  upsertAnalysisNotebook,
  deleteAnalysisCellsByNotebookId,
  upsertAnalysisCell,
};

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
  const hydrated = hydratePublishedNotebookArtifact(artifact, options);
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
  const hydrated = hydrateDashboardArtifact(artifact, options);
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
}> {
  const hydrationOptions = {
    ...options,
    localSourceBindings:
      options.localSourceBindings ?? parsed.localSourceBindings ?? null,
    defaultSourceRef:
      options.defaultSourceRef ?? parsed.projectManifest?.defaultSourceRef,
  };

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
  };
}
