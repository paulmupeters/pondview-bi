import type { z } from "zod";
import type {
  ExportedDashboardArtifact,
  ExportedDashboardMeasureArtifact,
  ExportedDashboardVisualArtifact,
  ExportedNotebookCellContentFile,
  ExportedNotebookCellVisualFile,
  ExportedPublishedNotebookArtifact,
  ExportedSharedQueryArtifact,
  ProjectArtifactTextFile,
} from "./export";
import {
  type LocalProjectSourceBindings,
  localProjectSourceBindingsSchema,
  type ProjectManifest,
  type ProjectPublishedNotebookCell,
  projectDashboardJoinsFileSchema,
  projectDashboardManifestSchema,
  projectDashboardMeasureMetadataSchema,
  projectDashboardVisualMetadataSchema,
  projectManifestSchema,
  projectPublishedNotebookManifestSchema,
  projectSharedQueryMetadataSchema,
  projectVisualConfigSchema,
  type TrackedProjectSourceRegistry,
  trackedProjectSourceRegistrySchema,
} from "./types";

export type ProjectArtifactFileMap = Map<string, ProjectArtifactTextFile>;

export type ParsedProjectArtifacts = {
  projectManifest: ProjectManifest | null;
  sourceRegistry: TrackedProjectSourceRegistry | null;
  localSourceBindings: LocalProjectSourceBindings | null;
  dashboards: ExportedDashboardArtifact[];
  sharedQueries: ExportedSharedQueryArtifact[];
  publishedNotebooks: ExportedPublishedNotebookArtifact[];
};

type ParseProjectArtifactFileSetOptions = {
  validateSourceRefs?: boolean;
};

export function normalizeProjectArtifactPath(path: string): string {
  return path
    .trim()
    .replace(/^\.?\//, "")
    .replace(/\\/g, "/");
}

export function createProjectArtifactFileMap(
  files: ProjectArtifactTextFile[],
): ProjectArtifactFileMap {
  const map = new Map<string, ProjectArtifactTextFile>();

  for (const file of files) {
    const path = normalizeProjectArtifactPath(file.path);
    if (!path) {
      throw new Error("Project artifact file path cannot be empty.");
    }
    if (map.has(path)) {
      throw new Error(`Duplicate project artifact file path "${path}".`);
    }
    map.set(path, {
      path,
      content: file.content,
    });
  }

  return map;
}

function getRequiredFile(
  files: ProjectArtifactFileMap,
  path: string,
): ProjectArtifactTextFile {
  const normalizedPath = normalizeProjectArtifactPath(path);
  const file = files.get(normalizedPath);
  if (!file) {
    throw new Error(`Missing project artifact file "${normalizedPath}".`);
  }
  return file;
}

function parseJsonFile<T>(
  files: ProjectArtifactFileMap,
  path: string,
  schema: z.ZodType<T>,
): T {
  const file = getRequiredFile(files, path);
  let parsed: unknown;

  try {
    parsed = JSON.parse(file.content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid JSON in project artifact file "${file.path}": ${message}`,
    );
  }

  try {
    return schema.parse(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid project artifact file "${file.path}": ${message}`);
  }
}

function parseOptionalJsonFile<T>(
  files: ProjectArtifactFileMap,
  path: string,
  schema: z.ZodType<T>,
): T | null {
  return files.has(normalizeProjectArtifactPath(path))
    ? parseJsonFile(files, path, schema)
    : null;
}

function resolveLocalSourceBindings(input: {
  projectManifest: ProjectManifest | null;
  legacyLocalSourceBindings: LocalProjectSourceBindings | null;
}): LocalProjectSourceBindings | null {
  if (input.legacyLocalSourceBindings) {
    return input.legacyLocalSourceBindings;
  }

  if (!input.projectManifest?.sourceBindings) {
    return null;
  }

  return {
    schemaVersion: 1,
    bindings: input.projectManifest.sourceBindings,
  };
}

function joinArtifactPath(rootPath: string, relativePath: string): string {
  return `${rootPath}/${normalizeProjectArtifactPath(relativePath)}`;
}

export function parseDashboardProjectArtifact(
  files: ProjectArtifactFileMap | ProjectArtifactTextFile[],
  manifestPath: string,
): ExportedDashboardArtifact {
  const fileMap = Array.isArray(files)
    ? createProjectArtifactFileMap(files)
    : files;
  const normalizedManifestPath = normalizeProjectArtifactPath(manifestPath);
  const rootPath = normalizedManifestPath.replace(/\/dashboard\.json$/, "");
  if (rootPath === normalizedManifestPath) {
    throw new Error(
      `Dashboard manifest path "${normalizedManifestPath}" must end with dashboard.json.`,
    );
  }

  const manifest = parseJsonFile(
    fileMap,
    normalizedManifestPath,
    projectDashboardManifestSchema,
  );
  const joinsPath = manifest.joinsFile
    ? joinArtifactPath(rootPath, manifest.joinsFile)
    : null;
  const joins = joinsPath
    ? parseJsonFile(fileMap, joinsPath, projectDashboardJoinsFileSchema)
    : null;

  const measures = manifest.measures.map<ExportedDashboardMeasureArtifact>(
    (measure) => {
      const metadataPath = joinArtifactPath(rootPath, measure.metadataFile);
      const sqlPath = joinArtifactPath(rootPath, measure.sqlFile);
      return {
        id: measure.id,
        metadataPath,
        sqlPath,
        metadata: parseJsonFile(
          fileMap,
          metadataPath,
          projectDashboardMeasureMetadataSchema,
        ),
        sql: getRequiredFile(fileMap, sqlPath).content,
      };
    },
  );

  const visuals = manifest.visuals.map<ExportedDashboardVisualArtifact>(
    (visual) => {
      const metadataPath = joinArtifactPath(rootPath, visual.metadataFile);
      const sqlPath = joinArtifactPath(rootPath, visual.sqlFile);
      return {
        id: visual.id,
        metadataPath,
        sqlPath,
        metadata: parseJsonFile(
          fileMap,
          metadataPath,
          projectDashboardVisualMetadataSchema,
        ),
        sql: getRequiredFile(fileMap, sqlPath).content,
      };
    },
  );

  return {
    rootPath,
    manifestPath: normalizedManifestPath,
    manifest,
    joinsPath,
    joins,
    measures,
    visuals,
  };
}

export function parseSharedQueryProjectArtifact(
  files: ProjectArtifactFileMap | ProjectArtifactTextFile[],
  metadataPath: string,
): ExportedSharedQueryArtifact {
  const fileMap = Array.isArray(files)
    ? createProjectArtifactFileMap(files)
    : files;
  const normalizedMetadataPath = normalizeProjectArtifactPath(metadataPath);
  const rootPath = normalizedMetadataPath.replace(/\/[^/]+\.query\.json$/, "");
  if (rootPath === normalizedMetadataPath) {
    throw new Error(
      `Shared query metadata path "${normalizedMetadataPath}" must end with .query.json.`,
    );
  }

  const id = normalizedMetadataPath
    .split("/")
    .at(-1)
    ?.replace(/\.query\.json$/, "");
  const sqlPath = `${rootPath}/${id}.sql`;

  return {
    rootPath,
    metadataPath: normalizedMetadataPath,
    metadata: parseJsonFile(
      fileMap,
      normalizedMetadataPath,
      projectSharedQueryMetadataSchema,
    ),
    sqlPath,
    sql: getRequiredFile(fileMap, sqlPath).content,
  };
}

function parseNotebookVisualFile(
  files: ProjectArtifactFileMap,
  rootPath: string,
  cell: ProjectPublishedNotebookCell,
): ExportedNotebookCellVisualFile | null {
  if (!cell.visualFile) {
    return null;
  }

  const path = joinArtifactPath(rootPath, cell.visualFile);

  return {
    cellId: cell.id,
    path,
    config: parseJsonFile(files, path, projectVisualConfigSchema),
  };
}

export function parsePublishedNotebookProjectArtifact(
  files: ProjectArtifactFileMap | ProjectArtifactTextFile[],
  manifestPath: string,
): ExportedPublishedNotebookArtifact {
  const fileMap = Array.isArray(files)
    ? createProjectArtifactFileMap(files)
    : files;
  const normalizedManifestPath = normalizeProjectArtifactPath(manifestPath);
  const rootPath = normalizedManifestPath.replace(/\/notebook\.json$/, "");
  if (rootPath === normalizedManifestPath) {
    throw new Error(
      `Notebook manifest path "${normalizedManifestPath}" must end with notebook.json.`,
    );
  }

  const manifest = parseJsonFile(
    fileMap,
    normalizedManifestPath,
    projectPublishedNotebookManifestSchema,
  );
  const contentFiles = manifest.cells.map<ExportedNotebookCellContentFile>(
    (cell) => {
      const path = joinArtifactPath(rootPath, cell.file);
      return {
        cellId: cell.id,
        path,
        content: getRequiredFile(fileMap, path).content,
      };
    },
  );
  const visualFiles = manifest.cells
    .map((cell) => parseNotebookVisualFile(fileMap, rootPath, cell))
    .filter((file): file is ExportedNotebookCellVisualFile => file !== null);

  return {
    rootPath,
    manifestPath: normalizedManifestPath,
    manifest,
    contentFiles,
    visualFiles,
  };
}

export function parseProjectArtifactFileSet(
  files: ProjectArtifactTextFile[],
  options: ParseProjectArtifactFileSetOptions = {},
): ParsedProjectArtifacts {
  const fileMap = createProjectArtifactFileMap(files);
  const projectManifest = parseOptionalJsonFile(
    fileMap,
    "pondview/project.json",
    projectManifestSchema,
  );
  const sourceRegistry = parseOptionalJsonFile(
    fileMap,
    "pondview/sources/registry.json",
    trackedProjectSourceRegistrySchema,
  );
  const legacyLocalSourceBindings = parseOptionalJsonFile(
    fileMap,
    "pondview.sources.local.json",
    localProjectSourceBindingsSchema,
  );
  const localSourceBindings = resolveLocalSourceBindings({
    projectManifest,
    legacyLocalSourceBindings,
  });

  const dashboards = Array.from(fileMap.keys())
    .filter((path) =>
      /^pondview\/dashboards\/[^/]+\/dashboard\.json$/.test(path),
    )
    .sort()
    .map((path) => parseDashboardProjectArtifact(fileMap, path));

  const sharedQueries = Array.from(fileMap.keys())
    .filter((path) =>
      /^pondview\/queries\/[^/]+\/[^/]+\.query\.json$/.test(path),
    )
    .sort()
    .map((path) => parseSharedQueryProjectArtifact(fileMap, path));

  const publishedNotebooks = Array.from(fileMap.keys())
    .filter((path) => /^pondview\/notebooks\/[^/]+\/notebook\.json$/.test(path))
    .sort()
    .map((path) => parsePublishedNotebookProjectArtifact(fileMap, path));

  const parsed = {
    projectManifest,
    sourceRegistry,
    localSourceBindings,
    dashboards,
    sharedQueries,
    publishedNotebooks,
  };

  if (options.validateSourceRefs) {
    validateProjectArtifactSourceRefs(parsed);
  }

  return parsed;
}

export function collectProjectArtifactSourceRefs(
  parsed: ParsedProjectArtifacts,
): string[] {
  const sourceRefs = new Set<string>();
  const add = (sourceRef: string | null | undefined) => {
    if (sourceRef) {
      sourceRefs.add(sourceRef);
    }
  };

  add(parsed.projectManifest?.defaultSourceRef);
  for (const dashboard of parsed.dashboards) {
    add(dashboard.manifest.sourceRef);
    for (const measure of dashboard.measures) {
      add(measure.metadata.sourceRef);
    }
    for (const visual of dashboard.visuals) {
      add(visual.metadata.sourceRef);
    }
  }
  for (const query of parsed.sharedQueries) {
    add(query.metadata.sourceRef);
  }
  for (const notebook of parsed.publishedNotebooks) {
    for (const cell of notebook.manifest.cells) {
      add(cell.sourceRef);
    }
  }

  return Array.from(sourceRefs).sort();
}

export function validateProjectArtifactSourceRefs(
  parsed: ParsedProjectArtifacts,
): void {
  const knownSourceRefs = new Set(
    (parsed.sourceRegistry?.sources ?? []).map((source) => source.id),
  );
  const missing = collectProjectArtifactSourceRefs(parsed).filter(
    (sourceRef) => !knownSourceRefs.has(sourceRef),
  );

  if (missing.length > 0) {
    throw new Error(`Unknown project sourceRef values: ${missing.join(", ")}.`);
  }
}
