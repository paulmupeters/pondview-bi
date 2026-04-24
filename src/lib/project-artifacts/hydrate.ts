import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import {
  buildDashboardSourceDescriptor,
  type DashboardSourceDescriptor,
  getDashboardSourceDescriptorCatalogContext,
  getDashboardSourceDescriptorDbIdentifier,
  getDashboardSourceDescriptorRuntimeBackend,
  serializeDashboardSourceDescriptor,
} from "@/lib/dashboard/source-descriptor";
import type { JoinDefinition } from "@/lib/joins/graph";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import type { SavedSqlQuery } from "@/lib/workspace/saved-sql-queries-repo";
import type {
  WorkspaceAnalysisCell,
  WorkspaceAnalysisNotebook,
  WorkspaceChart,
  WorkspaceDashboard,
  WorkspaceDashboardMeasure,
  WorkspaceDashboardSlicer,
} from "@/lib/workspace/workspace-db";
import type {
  ExportedDashboardArtifact,
  ExportedPublishedNotebookArtifact,
  ExportedSharedQueryArtifact,
} from "./export";
import type {
  LocalProjectSourceBinding,
  LocalProjectSourceBindings,
  ProjectVisualConfig,
} from "./types";

export type ProjectArtifactHydrationOptions = {
  now?: number;
  localSourceBindings?: LocalProjectSourceBindings | null;
  defaultSourceRef?: string | null;
  fallbackSqlBackend?: SqlBackend;
};

export type HydratedProjectDashboard = {
  dashboard: WorkspaceDashboard;
  charts: WorkspaceChart[];
  measures: WorkspaceDashboardMeasure[];
  slicers: WorkspaceDashboardSlicer[];
  joins: JoinDefinition[];
};

export type HydratedProjectNotebook = {
  notebook: WorkspaceAnalysisNotebook;
  cells: WorkspaceAnalysisCell[];
};

type HydratedSource = {
  sourceRef: string | null;
  binding: LocalProjectSourceBinding | null;
  sourceDescriptor: DashboardSourceDescriptor;
  dbIdentifier: string | null;
  catalogContext: string | null;
  sqlBackend: SqlBackend;
};

function getNow(options: ProjectArtifactHydrationOptions): number {
  return options.now ?? Date.now();
}

function getFallbackSqlBackend(
  options: ProjectArtifactHydrationOptions,
): SqlBackend {
  return options.fallbackSqlBackend ?? "duckdb-wasm";
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

function getSourceRef(
  sourceRef: string | null | undefined,
  options: ProjectArtifactHydrationOptions,
): string | null {
  return (
    normalizeOptionalString(sourceRef) ??
    normalizeOptionalString(options.defaultSourceRef) ??
    null
  );
}

function resolveHydratedSource(
  sourceRef: string | null | undefined,
  options: ProjectArtifactHydrationOptions,
): HydratedSource {
  const resolvedSourceRef = getSourceRef(sourceRef, options);
  const binding = resolvedSourceRef
    ? (options.localSourceBindings?.bindings[resolvedSourceRef] ?? null)
    : null;
  const sourceDescriptor = buildDashboardSourceDescriptor({
    runtimeBackend: binding?.runtimeBackend ?? getFallbackSqlBackend(options),
    dbIdentifier: binding?.dbIdentifier ?? null,
    catalogContext: binding?.catalogContext ?? null,
  });

  return {
    sourceRef: resolvedSourceRef,
    binding,
    sourceDescriptor,
    dbIdentifier: getDashboardSourceDescriptorDbIdentifier(sourceDescriptor),
    catalogContext:
      getDashboardSourceDescriptorCatalogContext(sourceDescriptor),
    sqlBackend:
      getDashboardSourceDescriptorRuntimeBackend(sourceDescriptor) ??
      getFallbackSqlBackend(options),
  };
}

function getProjectPathId(path: string, fallback: string): string {
  return (
    path
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.[^.]+$/, "")
      .replace(/\.query$/, "") ?? fallback
  );
}

function getWorkspaceQueryId(artifact: ExportedSharedQueryArtifact): string {
  const group = getProjectPathId(artifact.rootPath, "shared");
  return `project-query:${group}:${artifact.metadata.id}`;
}

function getDashboardScopedId(
  dashboardId: string,
  kind: string,
  artifactId: string,
): string {
  return `${dashboardId}:${kind}:${artifactId}`;
}

function getStorageStatus(sqlBackend: SqlBackend): "shared" | "best-effort" {
  return sqlBackend === "duckdb-wasm" ? "best-effort" : "shared";
}

function jsonStringify(value: unknown): string {
  return JSON.stringify(value);
}

function getVisualTitle(config: ProjectVisualConfig): string | null {
  return "title" in config && typeof config.title === "string"
    ? config.title
    : null;
}

function getVisualDescription(config: ProjectVisualConfig): string | null {
  return "description" in config && typeof config.description === "string"
    ? config.description
    : null;
}

function getNotebookCellContent(
  artifact: ExportedPublishedNotebookArtifact,
  cellId: string,
): string {
  return (
    artifact.contentFiles.find((file) => file.cellId === cellId)?.content ?? ""
  );
}

function getNotebookVisualConfig(
  artifact: ExportedPublishedNotebookArtifact,
  cellId: string,
): ProjectVisualConfig | null {
  return (
    artifact.visualFiles.find((file) => file.cellId === cellId)?.config ?? null
  );
}

function buildNotebookSqlPayload(input: {
  sql: string;
  visualConfig: ProjectVisualConfig | null;
  source: HydratedSource;
}): string | null {
  if (!input.visualConfig) {
    return null;
  }

  const payload: SqlAnalysisData = {
    stage: "initial",
    progress: 0,
    query: input.sql,
    dbIdentifier: input.source.dbIdentifier ?? undefined,
    catalogContext: input.source.catalogContext,
    sqlBackend: input.source.sqlBackend,
    sourceDescriptor: input.source.sourceDescriptor,
  };

  if (
    "configType" in input.visualConfig &&
    input.visualConfig.configType === "table"
  ) {
    payload.visualType = "table";
    payload.tableConfig = input.visualConfig;
  } else if (
    "configType" in input.visualConfig &&
    input.visualConfig.configType === "card"
  ) {
    payload.visualType = "card";
    payload.cardConfig = input.visualConfig;
  } else {
    payload.visualType = "chart";
    payload.chartConfig = input.visualConfig;
  }

  return jsonStringify(payload);
}

export function hydrateSharedQueryArtifact(
  artifact: ExportedSharedQueryArtifact,
  options: ProjectArtifactHydrationOptions = {},
): SavedSqlQuery {
  const now = getNow(options);
  return {
    id: getWorkspaceQueryId(artifact),
    name: artifact.metadata.name,
    sql: artifact.sql.trim(),
    kind: artifact.metadata.kind ?? "query",
    sourceRef: artifact.metadata.sourceRef ?? null,
    catalogContext: artifact.metadata.catalogContext ?? null,
    description: artifact.metadata.description ?? null,
    tags: artifact.metadata.tags,
    projectPath: artifact.metadataPath,
    createdAt: now,
    updatedAt: now,
  };
}

export function hydratePublishedNotebookArtifact(
  artifact: ExportedPublishedNotebookArtifact,
  options: ProjectArtifactHydrationOptions = {},
): HydratedProjectNotebook {
  const now = getNow(options);
  const notebook: WorkspaceAnalysisNotebook = {
    id: artifact.manifest.id,
    title: artifact.manifest.title,
    projectPath: artifact.rootPath,
    createdAt: now,
    updatedAt: now,
  };

  const cells = artifact.manifest.cells.map<WorkspaceAnalysisCell>(
    (cell, position) => {
      const content = getNotebookCellContent(artifact, cell.id).trim();
      const source =
        cell.kind === "text"
          ? null
          : resolveHydratedSource(cell.sourceRef, options);
      const sqlDraft = cell.kind === "sql" ? content : null;

      return {
        id: getDashboardScopedId(notebook.id, "cell", cell.id),
        notebookId: notebook.id,
        position,
        kind: cell.kind,
        aiEnabled: cell.kind === "ai",
        sqlEnabled: cell.kind === "ai" || cell.kind === "sql",
        promptText: cell.kind === "sql" ? "" : content,
        sqlDraft,
        selectedDbIdentifier: source?.dbIdentifier ?? null,
        selectedCatalogContext: source?.catalogContext ?? null,
        status: "idle",
        resultPayloadJson:
          cell.kind === "sql" && source
            ? buildNotebookSqlPayload({
                sql: sqlDraft ?? "",
                visualConfig: getNotebookVisualConfig(artifact, cell.id),
                source,
              })
            : null,
        createdAt: now,
        updatedAt: now,
        lastRunAt: null,
      };
    },
  );

  return { notebook, cells };
}

export function hydrateDashboardArtifact(
  artifact: ExportedDashboardArtifact,
  options: ProjectArtifactHydrationOptions = {},
): HydratedProjectDashboard {
  const now = getNow(options);
  const dashboardSource = resolveHydratedSource(
    artifact.manifest.sourceRef,
    options,
  );
  const dashboard: WorkspaceDashboard = {
    id: artifact.manifest.id,
    title: artifact.manifest.title,
    createdAt: now,
    updatedAt: now,
    columns: artifact.manifest.columns ?? 3,
    autoFitRows: artifact.manifest.autoFitRows ?? false,
    runtimeBackend: dashboardSource.sqlBackend,
    activeSnapshotId: null,
    homeDbIdentifier: dashboardSource.dbIdentifier,
    homeSqlBackend: dashboardSource.sqlBackend,
    storageStatus: getStorageStatus(dashboardSource.sqlBackend),
    projectPath: artifact.rootPath,
  };

  const measures = artifact.measures.map<WorkspaceDashboardMeasure>(
    (measure) => {
      const source = resolveHydratedSource(
        measure.metadata.sourceRef ?? artifact.manifest.sourceRef,
        options,
      );
      return {
        id: getDashboardScopedId(dashboard.id, "measure", measure.id),
        dashboardId: dashboard.id,
        key: measure.metadata.key,
        label: measure.metadata.label,
        sql: measure.sql.trim(),
        sourceDescriptor: source.sourceDescriptor,
        sourceDescriptorJson: serializeDashboardSourceDescriptor(
          source.sourceDescriptor,
        ),
        snapshotId: null,
        dbIdentifier: source.dbIdentifier,
        catalogContext: source.catalogContext,
        sqlBackend: source.sqlBackend,
        createdAt: now,
        updatedAt: now,
        sourceSql: measure.sql.trim(),
        sourceDbIdentifier: source.dbIdentifier,
        sourceCatalogContext: source.catalogContext,
        sourceSqlBackend: source.sqlBackend,
      };
    },
  );

  const charts = artifact.visuals.map<WorkspaceChart>((visual, position) => {
    const source = resolveHydratedSource(
      visual.metadata.sourceRef ?? artifact.manifest.sourceRef,
      options,
    );
    const config = visual.metadata.config;
    return {
      id: getDashboardScopedId(dashboard.id, "visual", visual.id),
      dashboardId: dashboard.id,
      title: getVisualTitle(config),
      description: getVisualDescription(config),
      sql: visual.sql.trim(),
      sourceDescriptor: source.sourceDescriptor,
      sourceDescriptorJson: serializeDashboardSourceDescriptor(
        source.sourceDescriptor,
      ),
      snapshotId: null,
      dbIdentifier: source.dbIdentifier,
      catalogContext: source.catalogContext,
      sqlBackend: source.sqlBackend,
      chartConfigJson: jsonStringify(config),
      semanticQueryJson: null,
      exploreName: null,
      position,
      createdAt: now,
      updatedAt: now,
      sourceSql: visual.sql.trim(),
      sourceDbIdentifier: source.dbIdentifier,
      sourceCatalogContext: source.catalogContext,
      sourceSqlBackend: source.sqlBackend,
    };
  });

  const slicers = (
    artifact.manifest.slicers ?? []
  ).map<WorkspaceDashboardSlicer>((slicer, position) => ({
    id: getDashboardScopedId(
      dashboard.id,
      "slicer",
      slicer.id ?? `slicer-${position + 1}`,
    ),
    dashboardId: dashboard.id,
    field: slicer.field,
    title: slicer.title ?? null,
    limit: slicer.limit ?? 50,
    position,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    dashboard,
    charts,
    measures,
    slicers,
    joins: artifact.joins?.joins ?? [],
  };
}

export function hydrateProjectArtifacts(
  parsed: {
    dashboards: ExportedDashboardArtifact[];
    sharedQueries: ExportedSharedQueryArtifact[];
    publishedNotebooks: ExportedPublishedNotebookArtifact[];
    localSourceBindings?: LocalProjectSourceBindings | null;
    projectManifest?: { defaultSourceRef?: string } | null;
  },
  options: ProjectArtifactHydrationOptions = {},
): {
  dashboards: HydratedProjectDashboard[];
  sharedQueries: SavedSqlQuery[];
  publishedNotebooks: HydratedProjectNotebook[];
} {
  const hydrationOptions = {
    ...options,
    localSourceBindings:
      options.localSourceBindings ?? parsed.localSourceBindings ?? null,
    defaultSourceRef:
      options.defaultSourceRef ?? parsed.projectManifest?.defaultSourceRef,
  };

  return {
    dashboards: parsed.dashboards.map((dashboard) =>
      hydrateDashboardArtifact(dashboard, hydrationOptions),
    ),
    sharedQueries: parsed.sharedQueries.map((query) =>
      hydrateSharedQueryArtifact(query, hydrationOptions),
    ),
    publishedNotebooks: parsed.publishedNotebooks.map((notebook) =>
      hydratePublishedNotebookArtifact(notebook, hydrationOptions),
    ),
  };
}
