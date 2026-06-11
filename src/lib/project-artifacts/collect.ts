import {
  type AnalysisNotebookSnapshot,
  getAnalysisNotebookSnapshot,
} from "@/lib/workspace/analysis-notebook-repo";
import {
  type DbDashboard,
  type DbDashboardChart,
  type DbDashboardMeasure,
  type DbDashboardSlicer,
  getDashboardWithCharts,
  type JoinDefinition,
  listJoinDefsByDashboard,
  listMeasuresByDashboard,
  listSlicersByDashboard,
} from "@/lib/workspace/dashboard-repo";
import {
  listSavedSqlQueries,
  type SavedSqlQuery,
} from "@/lib/workspace/saved-sql-queries-repo";
import {
  createProjectArtifactSourceRefResolver,
  type ExportedDashboardArtifact,
  type ExportedPublishedNotebookArtifact,
  type ExportedSharedQueryArtifact,
  exportDashboardArtifact,
  exportPublishedNotebookArtifact,
  exportSavedQueryArtifact,
  type ProjectArtifactSourceMapping,
  type ProjectArtifactSourceRefResolver,
  type ProjectArtifactTextFile,
  serializeDashboardArtifact,
  serializePublishedNotebookArtifact,
  serializeSharedQueryArtifact,
} from "./export";

type SourceResolutionOptions = {
  sourceMappings?: ProjectArtifactSourceMapping[];
  resolveSourceRef?: ProjectArtifactSourceRefResolver;
  fallbackSourceRef?: string | null;
  requireSourceRefs?: boolean;
};

export type DashboardProjectArtifactCollectorDeps = {
  getDashboardWithCharts: (dashboardId: string) => Promise<{
    dashboard: DbDashboard;
    charts: DbDashboardChart[];
  } | null>;
  listMeasuresByDashboard: (
    dashboardId: string,
  ) => Promise<DbDashboardMeasure[]>;
  listSlicersByDashboard: (dashboardId: string) => Promise<DbDashboardSlicer[]>;
  listJoinDefsByDashboard: (dashboardId: string) => Promise<JoinDefinition[]>;
};

export type SavedQueryProjectArtifactCollectorDeps = {
  listSavedSqlQueries: () => Promise<SavedSqlQuery[]>;
};

export type NotebookProjectArtifactCollectorDeps = {
  getAnalysisNotebookSnapshot: (
    notebookId: string,
  ) => Promise<AnalysisNotebookSnapshot>;
};

export type ExportDashboardProjectArtifactInput = SourceResolutionOptions & {
  dashboardId: string;
  artifactId?: string;
};

export type ExportSavedQueryProjectArtifactInput = {
  queryId: string;
  group?: string;
  artifactId?: string;
  kind?: "query" | "view";
  sourceRef?: string | null;
  catalogContext?: string | null;
  description?: string | null;
  tags?: string[];
  requireSourceRef?: boolean;
};

export type ExportAllSavedQueriesProjectArtifactsInput = Omit<
  ExportSavedQueryProjectArtifactInput,
  "queryId" | "artifactId" | "description" | "tags"
>;

export type ExportPublishedNotebookProjectArtifactInput =
  SourceResolutionOptions & {
    notebookId: string;
    artifactId?: string;
    description?: string | null;
  };

const defaultDashboardDeps: DashboardProjectArtifactCollectorDeps = {
  getDashboardWithCharts: (dashboardId) => getDashboardWithCharts(dashboardId),
  listMeasuresByDashboard: (dashboardId) => listMeasuresByDashboard(dashboardId),
  listSlicersByDashboard: (dashboardId) => listSlicersByDashboard(dashboardId),
  listJoinDefsByDashboard: (dashboardId) => listJoinDefsByDashboard(dashboardId),
};

const defaultSavedQueryDeps: SavedQueryProjectArtifactCollectorDeps = {
  listSavedSqlQueries: () => listSavedSqlQueries(),
};

const defaultNotebookDeps: NotebookProjectArtifactCollectorDeps = {
  getAnalysisNotebookSnapshot: (notebookId) =>
    getAnalysisNotebookSnapshot(notebookId),
};

function composeSourceRefResolver(
  input: SourceResolutionOptions,
): ProjectArtifactSourceRefResolver | undefined {
  const mappingResolver = input.sourceMappings
    ? createProjectArtifactSourceRefResolver(input.sourceMappings)
    : undefined;

  if (!input.resolveSourceRef && !mappingResolver) {
    return undefined;
  }

  return (sourceInput) =>
    input.resolveSourceRef?.(sourceInput) ??
    mappingResolver?.(sourceInput) ??
    null;
}

export async function exportDashboardProjectArtifact(
  input: ExportDashboardProjectArtifactInput,
  deps = defaultDashboardDeps,
): Promise<ExportedDashboardArtifact> {
  const snapshot = await deps.getDashboardWithCharts(input.dashboardId);
  if (!snapshot) {
    throw new Error(`Dashboard "${input.dashboardId}" was not found.`);
  }

  const [measures, slicers, joins] = await Promise.all([
    deps.listMeasuresByDashboard(input.dashboardId),
    deps.listSlicersByDashboard(input.dashboardId),
    deps.listJoinDefsByDashboard(input.dashboardId),
  ]);

  return exportDashboardArtifact({
    dashboard: snapshot.dashboard,
    charts: snapshot.charts,
    measures,
    slicers,
    joins,
    artifactId: input.artifactId,
    resolveSourceRef: composeSourceRefResolver(input),
    fallbackSourceRef: input.fallbackSourceRef,
    requireSourceRefs: input.requireSourceRefs,
  });
}

export async function exportDashboardProjectFiles(
  input: ExportDashboardProjectArtifactInput,
  deps = defaultDashboardDeps,
): Promise<ProjectArtifactTextFile[]> {
  return serializeDashboardArtifact(
    await exportDashboardProjectArtifact(input, deps),
  );
}

export async function exportSavedQueryProjectArtifact(
  input: ExportSavedQueryProjectArtifactInput,
  deps = defaultSavedQueryDeps,
): Promise<ExportedSharedQueryArtifact> {
  const query = (await deps.listSavedSqlQueries()).find(
    (entry) => entry.id === input.queryId,
  );
  if (!query) {
    throw new Error(`Saved SQL query "${input.queryId}" was not found.`);
  }

  return exportSavedQueryArtifact({
    query,
    group: input.group,
    artifactId: input.artifactId,
    kind: input.kind,
    sourceRef: input.sourceRef,
    catalogContext: input.catalogContext,
    description: input.description,
    tags: input.tags,
    requireSourceRef: input.requireSourceRef,
  });
}

export async function exportSavedQueryProjectFiles(
  input: ExportSavedQueryProjectArtifactInput,
  deps = defaultSavedQueryDeps,
): Promise<ProjectArtifactTextFile[]> {
  return serializeSharedQueryArtifact(
    await exportSavedQueryProjectArtifact(input, deps),
  );
}

export async function exportAllSavedQueryProjectFiles(
  input: ExportAllSavedQueriesProjectArtifactsInput = {},
  deps = defaultSavedQueryDeps,
): Promise<ProjectArtifactTextFile[]> {
  const queries = await deps.listSavedSqlQueries();
  return queries.flatMap((query) =>
    serializeSharedQueryArtifact(
      exportSavedQueryArtifact({
        query,
        group: input.group,
        kind: input.kind,
        sourceRef: input.sourceRef,
        catalogContext: input.catalogContext,
        requireSourceRef: input.requireSourceRef,
      }),
    ),
  );
}

export async function exportPublishedNotebookProjectArtifact(
  input: ExportPublishedNotebookProjectArtifactInput,
  deps = defaultNotebookDeps,
): Promise<ExportedPublishedNotebookArtifact> {
  const snapshot = await deps.getAnalysisNotebookSnapshot(input.notebookId);
  if (!snapshot.notebook) {
    throw new Error(`Analysis notebook "${input.notebookId}" was not found.`);
  }

  return exportPublishedNotebookArtifact({
    notebook: snapshot.notebook,
    cells: snapshot.cells,
    artifactId: input.artifactId,
    description: input.description,
    resolveSourceRef: composeSourceRefResolver(input),
    fallbackSourceRef: input.fallbackSourceRef,
    requireSourceRefs: input.requireSourceRefs,
  });
}

export async function exportPublishedNotebookProjectFiles(
  input: ExportPublishedNotebookProjectArtifactInput,
  deps = defaultNotebookDeps,
): Promise<ProjectArtifactTextFile[]> {
  return serializePublishedNotebookArtifact(
    await exportPublishedNotebookProjectArtifact(input, deps),
  );
}
