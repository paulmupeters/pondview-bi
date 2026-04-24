import {
  type DashboardSourceDescriptor,
  getDashboardSourceDescriptorCatalogContext,
  getDashboardSourceDescriptorDbIdentifier,
  getDashboardSourceDescriptorRuntimeBackend,
  parseDashboardSourceDescriptor,
  parseDashboardSourceDescriptorJson,
} from "@/lib/dashboard/source-descriptor";
import { canonicalTable, type JoinDefinition } from "@/lib/joins/graph";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import {
  cardConfigSchema,
  configSchema,
  normalizeChartConfig,
  tableConfigSchema,
  textConfigSchema,
} from "@/lib/types";
import type { SavedSqlQuery } from "@/lib/workspace/saved-sql-queries-repo";
import type {
  WorkspaceAnalysisCell,
  WorkspaceAnalysisNotebook,
  WorkspaceChart,
  WorkspaceDashboard,
  WorkspaceDashboardMeasure,
  WorkspaceDashboardSlicer,
} from "@/lib/workspace/workspace-db";
import {
  type ProjectDashboardJoinsFile,
  type ProjectDashboardManifest,
  type ProjectDashboardMeasureMetadata,
  type ProjectDashboardVisualMetadata,
  type ProjectPublishedNotebookManifest,
  type ProjectSharedQueryMetadata,
  type ProjectVisualConfig,
  projectDashboardJoinsFileSchema,
  projectDashboardManifestSchema,
  projectDashboardMeasureMetadataSchema,
  projectDashboardVisualMetadataSchema,
  projectPublishedNotebookManifestSchema,
  projectSharedQueryMetadataSchema,
} from "./types";

export type ProjectArtifactSourceRefResolutionInput = {
  sourceDescriptor?: DashboardSourceDescriptor | null;
  dbIdentifier?: string | null;
  catalogContext?: string | null;
  sqlBackend?: SqlBackend | null;
  fallbackSourceRef?: string | null;
};

export type ProjectArtifactSourceRefResolver = (
  input: ProjectArtifactSourceRefResolutionInput,
) => string | null;

export type ProjectArtifactSourceMapping = {
  sourceRef: string;
  dbIdentifier?: string | null;
  catalogContext?: string | null;
  sqlBackend?: SqlBackend | null;
};

export type ProjectArtifactTextFile = {
  path: string;
  content: string;
};

export type ExportedDashboardMeasureArtifact = {
  id: string;
  metadataPath: string;
  sqlPath: string;
  metadata: ProjectDashboardMeasureMetadata;
  sql: string;
};

export type ExportedDashboardVisualArtifact = {
  id: string;
  metadataPath: string;
  sqlPath: string;
  metadata: ProjectDashboardVisualMetadata;
  sql: string;
};

export type ExportedDashboardArtifact = {
  rootPath: string;
  manifestPath: string;
  manifest: ProjectDashboardManifest;
  joinsPath: string | null;
  joins: ProjectDashboardJoinsFile | null;
  measures: ExportedDashboardMeasureArtifact[];
  visuals: ExportedDashboardVisualArtifact[];
};

export type ExportSavedQueryArtifactInput = {
  query: SavedSqlQuery;
  group?: string;
  artifactId?: string;
  kind?: "query" | "view";
  sourceRef?: string | null;
  catalogContext?: string | null;
  description?: string | null;
  tags?: string[];
  requireSourceRef?: boolean;
};

export type ExportedSharedQueryArtifact = {
  rootPath: string;
  metadataPath: string;
  metadata: ProjectSharedQueryMetadata;
  sqlPath: string;
  sql: string;
};

export type ExportNotebookArtifactInput = {
  notebook: WorkspaceAnalysisNotebook;
  cells: WorkspaceAnalysisCell[];
  artifactId?: string;
  description?: string | null;
  resolveSourceRef?: ProjectArtifactSourceRefResolver;
  fallbackSourceRef?: string | null;
  requireSourceRefs?: boolean;
};

export type ExportedNotebookCellContentFile = {
  cellId: string;
  path: string;
  content: string;
};

export type ExportedNotebookCellVisualFile = {
  cellId: string;
  path: string;
  config: ProjectVisualConfig;
};

export type ExportedPublishedNotebookArtifact = {
  rootPath: string;
  manifestPath: string;
  manifest: ProjectPublishedNotebookManifest;
  contentFiles: ExportedNotebookCellContentFile[];
  visualFiles: ExportedNotebookCellVisualFile[];
};

type SourceDescriptorCarrier = {
  sourceDescriptor?: DashboardSourceDescriptor | null;
  sourceDescriptorJson?: string | null;
  dbIdentifier?: string | null;
  catalogContext?: string | null;
  sqlBackend?: SqlBackend | null;
};

type NotebookPayload = {
  query?: string;
  dbIdentifier?: string;
  catalogContext?: string | null;
  sqlBackend?: SqlBackend;
  sourceDescriptor?: unknown;
  visualType?: "table" | "chart" | "card" | "text";
  chartConfig?: unknown;
  tableConfig?: unknown;
  cardConfig?: unknown;
};

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalDescription(
  value: string | null | undefined,
): string | undefined {
  return normalizeOptionalString(value) ?? undefined;
}

function normalizeMatchValue(value: string | null | undefined): string | null {
  return normalizeOptionalString(value)?.toLowerCase() ?? null;
}

export function toProjectArtifactId(
  value: string | null | undefined,
  fallback = "artifact",
): string {
  const normalized = (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || fallback;
}

function createUniqueIdFactory() {
  const seen = new Map<string, number>();
  return (value: string | null | undefined, fallback: string) => {
    const base = toProjectArtifactId(value, fallback);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
}

function parseJson(value: string | null | undefined): unknown | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getSourceDescriptor(
  input: SourceDescriptorCarrier,
): DashboardSourceDescriptor | null {
  return (
    input.sourceDescriptor ??
    parseDashboardSourceDescriptorJson(input.sourceDescriptorJson) ??
    null
  );
}

function resolveSourceRef(
  input: ProjectArtifactSourceRefResolutionInput,
  resolver?: ProjectArtifactSourceRefResolver,
  options: {
    required?: boolean;
    label?: string;
  } = {},
): string | undefined {
  const resolved = normalizeOptionalString(
    resolver?.(input) ?? input.fallbackSourceRef ?? null,
  );
  if (!resolved && options.required && hasMappableSourceIdentity(input)) {
    const label = options.label ? ` for ${options.label}` : "";
    throw new Error(`Missing project sourceRef mapping${label}.`);
  }
  return resolved ?? undefined;
}

function hasMappableSourceIdentity(
  input: ProjectArtifactSourceRefResolutionInput,
): boolean {
  return (
    (input.sourceDescriptor !== null &&
      input.sourceDescriptor !== undefined &&
      getDashboardSourceDescriptorDbIdentifier(input.sourceDescriptor) !==
        null) ||
    normalizeOptionalString(input.dbIdentifier) !== null ||
    normalizeOptionalString(input.catalogContext) !== null
  );
}

export function createProjectArtifactSourceRefResolver(
  mappings: ProjectArtifactSourceMapping[],
): ProjectArtifactSourceRefResolver {
  const normalizedMappings = mappings
    .map((mapping) => ({
      sourceRef: normalizeOptionalString(mapping.sourceRef),
      dbIdentifier: normalizeMatchValue(mapping.dbIdentifier),
      catalogContext: normalizeMatchValue(mapping.catalogContext),
      sqlBackend: mapping.sqlBackend ?? null,
    }))
    .filter(
      (
        mapping,
      ): mapping is {
        sourceRef: string;
        dbIdentifier: string | null;
        catalogContext: string | null;
        sqlBackend: SqlBackend | null;
      } => mapping.sourceRef !== null,
    );

  return (input) => {
    const inputDbIdentifier = normalizeMatchValue(
      input.dbIdentifier ??
        getDashboardSourceDescriptorDbIdentifier(input.sourceDescriptor),
    );
    const inputCatalogContext = normalizeMatchValue(
      input.catalogContext ??
        getDashboardSourceDescriptorCatalogContext(input.sourceDescriptor),
    );
    const inputSqlBackend =
      input.sqlBackend ??
      getDashboardSourceDescriptorRuntimeBackend(input.sourceDescriptor);

    const match = normalizedMappings.find((mapping) => {
      if (mapping.dbIdentifier && mapping.dbIdentifier !== inputDbIdentifier) {
        return false;
      }
      if (
        mapping.catalogContext &&
        mapping.catalogContext !== inputCatalogContext
      ) {
        return false;
      }
      if (mapping.sqlBackend && mapping.sqlBackend !== inputSqlBackend) {
        return false;
      }
      return mapping.dbIdentifier !== null || mapping.catalogContext !== null;
    });

    return match?.sourceRef ?? null;
  };
}

function normalizeCatalogContext(
  value: string | null | undefined,
): string | undefined {
  return normalizeOptionalString(value) ?? undefined;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJsonValue(entry));
  }

  if (!value || typeof value !== "object" || value instanceof Date) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJsonValue(entry)]),
  );
}

function stripUndefinedValues<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedValues(entry)) as T;
  }

  if (!value || typeof value !== "object" || value instanceof Date) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefinedValues(entry)]),
  ) as T;
}

function serializeJsonFile(
  path: string,
  value: unknown,
): ProjectArtifactTextFile {
  return {
    path,
    content: `${JSON.stringify(sortJsonValue(value), null, 2)}\n`,
  };
}

function serializeSqlFile(path: string, sql: string): ProjectArtifactTextFile {
  return {
    path,
    content: `${sql.trim()}\n`,
  };
}

function serializeMarkdownFile(
  path: string,
  content: string,
): ProjectArtifactTextFile {
  return {
    path,
    content: `${content.trim()}\n`,
  };
}

function parseVisualConfig(
  chartId: string,
  chartConfigJson: string,
): ProjectVisualConfig {
  const parsed = parseJson(chartConfigJson);

  if (parsed && typeof parsed === "object") {
    if ("visualType" in parsed) {
      return stripUndefinedValues(
        normalizeChartConfig(configSchema.parse(parsed)),
      );
    }

    if ((parsed as { configType?: string }).configType === "table") {
      return stripUndefinedValues(tableConfigSchema.parse(parsed));
    }

    if ((parsed as { configType?: string }).configType === "card") {
      return stripUndefinedValues(cardConfigSchema.parse(parsed));
    }

    if ((parsed as { configType?: string }).configType === "text") {
      return stripUndefinedValues(textConfigSchema.parse(parsed));
    }
  }

  throw new Error(`Invalid dashboard visual config for chart "${chartId}".`);
}

function sortJoins(joins: JoinDefinition[]): JoinDefinition[] {
  return [...joins].sort((left, right) => {
    const leftKey = [
      canonicalTable(left.leftTable),
      left.leftColumn.toLowerCase(),
      canonicalTable(left.rightTable),
      left.rightColumn.toLowerCase(),
      left.type ?? "left",
    ].join("|");
    const rightKey = [
      canonicalTable(right.leftTable),
      right.leftColumn.toLowerCase(),
      canonicalTable(right.rightTable),
      right.rightColumn.toLowerCase(),
      right.type ?? "left",
    ].join("|");
    return leftKey.localeCompare(rightKey);
  });
}

function buildNotebookPayload(
  cell: WorkspaceAnalysisCell,
): NotebookPayload | null {
  const parsed = parseJson(cell.resultPayloadJson);
  return parsed && typeof parsed === "object"
    ? (parsed as NotebookPayload)
    : null;
}

function getNotebookVisualConfig(
  cell: WorkspaceAnalysisCell,
): ProjectVisualConfig | null {
  const payload = buildNotebookPayload(cell);
  if (!payload) {
    return null;
  }

  if (payload.visualType === "chart" && payload.chartConfig) {
    return stripUndefinedValues(
      normalizeChartConfig(configSchema.parse(payload.chartConfig)),
    );
  }

  if (payload.visualType === "table" && payload.tableConfig) {
    return stripUndefinedValues(tableConfigSchema.parse(payload.tableConfig));
  }

  if (payload.visualType === "card" && payload.cardConfig) {
    return stripUndefinedValues(cardConfigSchema.parse(payload.cardConfig));
  }

  if (payload.cardConfig) {
    return stripUndefinedValues(cardConfigSchema.parse(payload.cardConfig));
  }

  if (payload.tableConfig) {
    return stripUndefinedValues(tableConfigSchema.parse(payload.tableConfig));
  }

  if (payload.chartConfig) {
    return stripUndefinedValues(
      normalizeChartConfig(configSchema.parse(payload.chartConfig)),
    );
  }

  return null;
}

function getNotebookCellSourceInput(
  cell: WorkspaceAnalysisCell,
): ProjectArtifactSourceRefResolutionInput {
  const payload = buildNotebookPayload(cell);
  return {
    sourceDescriptor: parseDashboardSourceDescriptor(payload?.sourceDescriptor),
    dbIdentifier:
      normalizeOptionalString(cell.selectedDbIdentifier) ??
      normalizeOptionalString(payload?.dbIdentifier) ??
      null,
    catalogContext:
      normalizeOptionalString(cell.selectedCatalogContext) ??
      normalizeOptionalString(payload?.catalogContext) ??
      null,
    sqlBackend: payload?.sqlBackend ?? null,
  };
}

function getNotebookSql(cell: WorkspaceAnalysisCell): string {
  const payload = buildNotebookPayload(cell);
  return (
    normalizeOptionalString(cell.sqlDraft) ??
    normalizeOptionalString(payload?.query) ??
    ""
  );
}

export function exportDashboardArtifact(input: {
  dashboard: WorkspaceDashboard;
  charts: WorkspaceChart[];
  measures?: WorkspaceDashboardMeasure[];
  slicers?: WorkspaceDashboardSlicer[];
  joins?: JoinDefinition[];
  artifactId?: string;
  resolveSourceRef?: ProjectArtifactSourceRefResolver;
  fallbackSourceRef?: string | null;
  requireSourceRefs?: boolean;
}): ExportedDashboardArtifact {
  const dashboardId =
    input.artifactId ?? toProjectArtifactId(input.dashboard.title, "dashboard");
  const rootPath = `pondview/dashboards/${dashboardId}`;
  const manifestPath = `${rootPath}/dashboard.json`;
  const joinsPath =
    input.joins && input.joins.length > 0 ? `${rootPath}/joins.json` : null;
  const makeMeasureId = createUniqueIdFactory();
  const makeVisualId = createUniqueIdFactory();

  const dashboardSourceRef = resolveSourceRef(
    {
      dbIdentifier: input.dashboard.homeDbIdentifier ?? null,
      sqlBackend: input.dashboard.homeSqlBackend ?? null,
      fallbackSourceRef: input.fallbackSourceRef ?? null,
    },
    input.resolveSourceRef,
    {
      required: input.requireSourceRefs,
      label: `dashboard "${input.dashboard.title}"`,
    },
  );

  const sortedMeasures = [...(input.measures ?? [])].sort((left, right) => {
    const leftKey = `${left.key}|${left.label}`.toLowerCase();
    const rightKey = `${right.key}|${right.label}`.toLowerCase();
    return leftKey.localeCompare(rightKey);
  });

  const measures = sortedMeasures.map<ExportedDashboardMeasureArtifact>(
    (measure) => {
      const id = makeMeasureId(measure.key || measure.label, "measure");
      const sourceDescriptor = getSourceDescriptor(measure);
      const sourceRef = resolveSourceRef(
        {
          sourceDescriptor,
          dbIdentifier: measure.dbIdentifier,
          catalogContext: measure.catalogContext ?? null,
          sqlBackend: measure.sqlBackend ?? null,
          fallbackSourceRef: dashboardSourceRef ?? null,
        },
        input.resolveSourceRef,
        {
          required: input.requireSourceRefs,
          label: `dashboard measure "${measure.label}"`,
        },
      );

      const metadata = projectDashboardMeasureMetadataSchema.parse(
        stripUndefinedValues({
          schemaVersion: 1,
          id,
          key: measure.key,
          label: measure.label,
          sourceRef:
            sourceRef && sourceRef !== dashboardSourceRef
              ? sourceRef
              : undefined,
          catalogContext: normalizeCatalogContext(
            measure.catalogContext ?? null,
          ),
        }),
      );

      return {
        id,
        metadataPath: `${rootPath}/measures/${id}.measure.json`,
        sqlPath: `${rootPath}/measures/${id}.sql`,
        metadata,
        sql: measure.sql.trim(),
      };
    },
  );

  const visuals = [...input.charts]
    .sort((left, right) => left.position - right.position)
    .map<ExportedDashboardVisualArtifact>((chart, index) => {
      const config = parseVisualConfig(chart.id, chart.chartConfigJson);
      const labelSource =
        chart.title ||
        ("title" in config && typeof config.title === "string"
          ? config.title
          : `visual-${index + 1}`);
      const id = makeVisualId(labelSource, "visual");
      const sourceDescriptor = getSourceDescriptor(chart);
      const sourceRef = resolveSourceRef(
        {
          sourceDescriptor,
          dbIdentifier: chart.dbIdentifier,
          catalogContext: chart.catalogContext ?? null,
          sqlBackend: chart.sqlBackend ?? null,
          fallbackSourceRef: dashboardSourceRef ?? null,
        },
        input.resolveSourceRef,
        {
          required: input.requireSourceRefs,
          label: `dashboard visual "${labelSource}"`,
        },
      );

      const metadata = projectDashboardVisualMetadataSchema.parse(
        stripUndefinedValues({
          schemaVersion: 1,
          id,
          sourceRef:
            sourceRef && sourceRef !== dashboardSourceRef
              ? sourceRef
              : undefined,
          catalogContext: normalizeCatalogContext(chart.catalogContext ?? null),
          config,
        }),
      );

      return {
        id,
        metadataPath: `${rootPath}/visuals/${id}.visual.json`,
        sqlPath: `${rootPath}/visuals/${id}.sql`,
        metadata,
        sql: chart.sql.trim(),
      };
    });

  const manifest = projectDashboardManifestSchema.parse(
    stripUndefinedValues({
      schemaVersion: 1,
      id: dashboardId,
      title: input.dashboard.title,
      columns: input.dashboard.columns ?? 3,
      autoFitRows: input.dashboard.autoFitRows ?? false,
      sourceRef: dashboardSourceRef,
      joinsFile: joinsPath ? "joins.json" : undefined,
      slicers: [...(input.slicers ?? [])]
        .sort((left, right) => left.position - right.position)
        .map((slicer, index) =>
          stripUndefinedValues({
            id: toProjectArtifactId(
              slicer.title || slicer.field,
              `slicer-${index + 1}`,
            ),
            field: slicer.field,
            title: normalizeOptionalDescription(slicer.title),
            limit: slicer.limit,
          }),
        ),
      measures: measures.map((measure) => ({
        id: measure.id,
        metadataFile: `measures/${measure.id}.measure.json`,
        sqlFile: `measures/${measure.id}.sql`,
      })),
      visuals: visuals.map((visual) => ({
        id: visual.id,
        metadataFile: `visuals/${visual.id}.visual.json`,
        sqlFile: `visuals/${visual.id}.sql`,
      })),
    }),
  );

  const joins =
    joinsPath && input.joins
      ? projectDashboardJoinsFileSchema.parse({
          schemaVersion: 1,
          joins: sortJoins(input.joins),
        })
      : null;

  return {
    rootPath,
    manifestPath,
    manifest,
    joinsPath,
    joins,
    measures,
    visuals,
  };
}

export function serializeDashboardArtifact(
  artifact: ExportedDashboardArtifact,
): ProjectArtifactTextFile[] {
  const files: ProjectArtifactTextFile[] = [
    serializeJsonFile(artifact.manifestPath, artifact.manifest),
  ];

  if (artifact.joins && artifact.joinsPath) {
    files.push(serializeJsonFile(artifact.joinsPath, artifact.joins));
  }

  for (const measure of artifact.measures) {
    files.push(serializeJsonFile(measure.metadataPath, measure.metadata));
    files.push(serializeSqlFile(measure.sqlPath, measure.sql));
  }

  for (const visual of artifact.visuals) {
    files.push(serializeJsonFile(visual.metadataPath, visual.metadata));
    files.push(serializeSqlFile(visual.sqlPath, visual.sql));
  }

  return files;
}

export function exportSavedQueryArtifact(
  input: ExportSavedQueryArtifactInput,
): ExportedSharedQueryArtifact {
  const group = toProjectArtifactId(input.group, "shared");
  const id =
    input.artifactId ?? toProjectArtifactId(input.query.name, "saved-query");
  const rootPath = `pondview/queries/${group}`;
  const metadataPath = `${rootPath}/${id}.query.json`;
  const sqlPath = `${rootPath}/${id}.sql`;
  const tags = Array.from(
    new Set(
      (input.tags ?? [])
        .concat(input.query.tags ?? [])
        .map((tag) => normalizeOptionalString(tag))
        .filter((tag): tag is string => tag !== null),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const sourceRef =
    normalizeOptionalString(input.sourceRef) ??
    normalizeOptionalString(input.query.sourceRef) ??
    undefined;
  if (input.requireSourceRef && !sourceRef) {
    throw new Error(
      `Missing project sourceRef mapping for query "${input.query.name}".`,
    );
  }

  const metadata = projectSharedQueryMetadataSchema.parse(
    stripUndefinedValues({
      schemaVersion: 1,
      id,
      name: input.query.name,
      kind: input.kind ?? input.query.kind ?? "query",
      description: normalizeOptionalDescription(
        input.description ?? input.query.description,
      ),
      sourceRef,
      catalogContext: normalizeCatalogContext(
        input.catalogContext ?? input.query.catalogContext ?? null,
      ),
      tags: tags.length > 0 ? tags : undefined,
    }),
  );

  return {
    rootPath,
    metadataPath,
    metadata,
    sqlPath,
    sql: input.query.sql.trim(),
  };
}

export function serializeSharedQueryArtifact(
  artifact: ExportedSharedQueryArtifact,
): ProjectArtifactTextFile[] {
  return [
    serializeJsonFile(artifact.metadataPath, artifact.metadata),
    serializeSqlFile(artifact.sqlPath, artifact.sql),
  ];
}

export function exportPublishedNotebookArtifact(
  input: ExportNotebookArtifactInput,
): ExportedPublishedNotebookArtifact {
  const notebookId =
    input.artifactId ?? toProjectArtifactId(input.notebook.title, "notebook");
  const rootPath = `pondview/notebooks/${notebookId}`;
  const manifestPath = `${rootPath}/notebook.json`;
  const makeCellId = createUniqueIdFactory();
  const contentFiles: ExportedNotebookCellContentFile[] = [];
  const visualFiles: ExportedNotebookCellVisualFile[] = [];

  const manifest = projectPublishedNotebookManifestSchema.parse(
    stripUndefinedValues({
      schemaVersion: 1,
      id: notebookId,
      title: input.notebook.title ?? "Untitled Notebook",
      description: normalizeOptionalDescription(input.description),
      cells: [...input.cells]
        .sort((left, right) => left.position - right.position)
        .map((cell, index) => {
          const cellId = makeCellId(
            cell.promptText || cell.kind || `cell-${index + 1}`,
            `${cell.kind ?? "cell"}-${index + 1}`,
          );
          const sourceInput = getNotebookCellSourceInput(cell);
          const sourceRef = resolveSourceRef(
            {
              ...sourceInput,
              fallbackSourceRef: input.fallbackSourceRef ?? null,
            },
            input.resolveSourceRef,
            {
              required: input.requireSourceRefs,
              label: `notebook cell "${cellId}"`,
            },
          );

          if (cell.kind === "sql") {
            const sqlPath = `${rootPath}/cells/${cellId}.sql`;
            contentFiles.push({
              cellId,
              path: sqlPath,
              content: getNotebookSql(cell),
            });

            const visualConfig = getNotebookVisualConfig(cell);
            if (visualConfig) {
              visualFiles.push({
                cellId,
                path: `${rootPath}/cells/${cellId}.visual.json`,
                config: visualConfig,
              });
            }

            return stripUndefinedValues({
              id: cellId,
              kind: "sql",
              file: `cells/${cellId}.sql`,
              visualFile: visualConfig
                ? `cells/${cellId}.visual.json`
                : undefined,
              sourceRef,
              catalogContext: normalizeCatalogContext(
                sourceInput.catalogContext ?? null,
              ),
            });
          }

          const markdownPath = `${rootPath}/cells/${cellId}.md`;
          contentFiles.push({
            cellId,
            path: markdownPath,
            content: cell.promptText,
          });

          return stripUndefinedValues({
            id: cellId,
            kind: cell.kind === "text" ? "text" : "ai",
            file: `cells/${cellId}.md`,
            sourceRef,
            catalogContext: normalizeCatalogContext(
              sourceInput.catalogContext ?? null,
            ),
          });
        }),
    }),
  );

  return {
    rootPath,
    manifestPath,
    manifest,
    contentFiles,
    visualFiles,
  };
}

export function serializePublishedNotebookArtifact(
  artifact: ExportedPublishedNotebookArtifact,
): ProjectArtifactTextFile[] {
  const files: ProjectArtifactTextFile[] = [
    serializeJsonFile(artifact.manifestPath, artifact.manifest),
  ];

  for (const contentFile of artifact.contentFiles) {
    if (contentFile.path.endsWith(".sql")) {
      files.push(serializeSqlFile(contentFile.path, contentFile.content));
      continue;
    }

    files.push(serializeMarkdownFile(contentFile.path, contentFile.content));
  }

  for (const visualFile of artifact.visualFiles) {
    files.push(serializeJsonFile(visualFile.path, visualFile.config));
  }

  return files;
}
