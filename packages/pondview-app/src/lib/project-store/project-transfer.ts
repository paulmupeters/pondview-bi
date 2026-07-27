import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import type { ProjectArtifactTextFile } from "@/lib/project-artifacts/export";
import { normalizeProjectArtifactPath } from "@/lib/project-artifacts/parse";
import {
  BrowserProjectStore,
  getOpenProject,
  type OpenProjectState,
  setProjectStoreMode,
} from "./index";

const browserProjectFileSchema = z.object({
  path: z.string().trim().min(1),
  content: z.string(),
});

const browserProjectBundleSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  project: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    backingKind: z.literal("browser-indexeddb"),
    openedAt: z.number().int().nonnegative().optional(),
    updatedAt: z.number().int().nonnegative().optional(),
    defaultSourceRef: z.string().trim().min(1).nullable().optional(),
  }),
  files: z.array(browserProjectFileSchema),
});

const browserProjectArchiveMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  project: browserProjectBundleSchema.shape.project,
});

const runtimeSnapshotPointerSchema = z.union([
  z.object({
    kind: z.literal("local"),
    path: z.string().trim().min(1),
    sizeBytes: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("s3"),
    key: z.string().trim().min(1),
    sizeBytes: z.number().int().nonnegative().optional(),
  }),
]);

const runtimeSnapshotManifestSchema = z.union([
  z.object({ included: z.literal(false) }),
  z.intersection(
    z.object({ included: z.literal(true) }),
    runtimeSnapshotPointerSchema,
  ),
]);

const exportManifestSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  package: z
    .object({
      kind: z.literal("pondview-project"),
      entryDashboardId: z.string().trim().min(1).nullable().optional(),
    })
    .optional(),
  projectArtifacts: z.object({
    included: z.boolean(),
  }),
  runtimeSnapshot: runtimeSnapshotManifestSchema.optional(),
});

export type BrowserProjectBundle = z.infer<typeof browserProjectBundleSchema>;
export type BrowserProjectArchiveMetadata = z.infer<
  typeof browserProjectArchiveMetadataSchema
>;
export type ProjectExportManifest = z.infer<typeof exportManifestSchema>;
export type RuntimeSnapshotPointer = z.infer<
  typeof runtimeSnapshotPointerSchema
>;

export const BROWSER_PROJECT_ARCHIVE_METADATA_PATH = ".pondview/project.json";
export const BROWSER_PROJECT_EXPORT_MANIFEST_PATH =
  ".pondview/export-manifest.json";
export const BROWSER_PROJECT_RUNTIME_SNAPSHOT_PATH =
  "runtime/pondview-runtime.duckdb";
export const PONDVIEW_PROJECT_FILE_EXTENSION = ".pondview";
export const MAX_PORTABLE_PROJECT_ARCHIVE_BYTES = 512 * 1024 * 1024;
export const MAX_PORTABLE_PROJECT_EXPANDED_BYTES = 1024 * 1024 * 1024;
export const MAX_PORTABLE_PROJECT_ENTRY_COUNT = 5_000;

function assertSafeArchivePath(path: string): string {
  const portablePath = path.trim().replace(/\\/g, "/");
  if (
    !portablePath ||
    portablePath.startsWith("/") ||
    /^[A-Za-z]:\//.test(portablePath) ||
    portablePath.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`Project archive contains an unsafe path "${path}".`);
  }

  const normalized = normalizeProjectArtifactPath(path);
  if (!normalized) {
    throw new Error(`Project archive contains an unsafe path "${path}".`);
  }
  return normalized;
}

function assertArchiveInputSize(input: ArrayBuffer | Uint8Array): void {
  if (input.byteLength > MAX_PORTABLE_PROJECT_ARCHIVE_BYTES) {
    throw new Error(
      `Project archive is too large. The maximum supported size is ${MAX_PORTABLE_PROJECT_ARCHIVE_BYTES} bytes.`,
    );
  }
}

export function createBrowserProjectBundle(input: {
  project: OpenProjectState;
  files: ProjectArtifactTextFile[];
}): BrowserProjectBundle {
  return browserProjectBundleSchema.parse({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    project: {
      id: input.project.id,
      name: input.project.name,
      backingKind: "browser-indexeddb",
      openedAt: input.project.openedAt,
      updatedAt: input.project.updatedAt,
      defaultSourceRef: input.project.defaultSourceRef ?? null,
    },
    files: input.files.map((file) => ({
      path: file.path,
      content: file.content,
    })),
  });
}

export function createBrowserProjectArchive(input: {
  project: OpenProjectState;
  files: ProjectArtifactTextFile[];
  entryDashboardId?: string | null;
  runtimeSnapshot?: {
    bytes: Uint8Array;
    pointer?: RuntimeSnapshotPointer;
  };
}): Uint8Array {
  const bundle = createBrowserProjectBundle(input);
  const archiveFiles: Record<string, Uint8Array> = {
    [BROWSER_PROJECT_ARCHIVE_METADATA_PATH]: strToU8(
      JSON.stringify(
        {
          schemaVersion: bundle.schemaVersion,
          exportedAt: bundle.exportedAt,
          project: bundle.project,
        } satisfies BrowserProjectArchiveMetadata,
        null,
        2,
      ),
    ),
  };

  for (const file of bundle.files) {
    const path = assertSafeArchivePath(file.path);
    if (archiveFiles[path]) {
      throw new Error(`Project contains duplicate path "${path}".`);
    }
    archiveFiles[path] = strToU8(file.content);
  }

  const manifest: ProjectExportManifest = {
    schemaVersion: 1,
    exportedAt: bundle.exportedAt,
    package: {
      kind: "pondview-project",
      entryDashboardId: input.entryDashboardId?.trim() || null,
    },
    projectArtifacts: { included: true },
  };

  if (input.runtimeSnapshot) {
    archiveFiles[BROWSER_PROJECT_RUNTIME_SNAPSHOT_PATH] =
      input.runtimeSnapshot.bytes;
    const pointer: RuntimeSnapshotPointer = input.runtimeSnapshot.pointer ?? {
      kind: "local",
      path: BROWSER_PROJECT_RUNTIME_SNAPSHOT_PATH,
      sizeBytes: input.runtimeSnapshot.bytes.byteLength,
    };
    manifest.runtimeSnapshot = { included: true, ...pointer };
  } else {
    manifest.runtimeSnapshot = { included: false };
  }

  archiveFiles[BROWSER_PROJECT_EXPORT_MANIFEST_PATH] = strToU8(
    JSON.stringify(manifest, null, 2),
  );

  return zipSync(archiveFiles, {
    level: 6,
  });
}

export function parseBrowserProjectBundle(
  input: string | unknown,
): BrowserProjectBundle {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  return browserProjectBundleSchema.parse(raw);
}

export function parseBrowserProjectArchive(
  input: ArrayBuffer | Uint8Array,
): BrowserProjectBundle {
  return parseBrowserProjectArchiveWithRuntime(input).bundle;
}

export function parseBrowserProjectArchiveWithRuntime(
  input: ArrayBuffer | Uint8Array,
): {
  bundle: BrowserProjectBundle;
  manifest: ProjectExportManifest | null;
  runtimeSnapshotBytes: Uint8Array | null;
  entryCount: number;
  expandedSizeBytes: number;
} {
  assertArchiveInputSize(input);
  let entryCount = 0;
  let expandedSizeBytes = 0;
  const archivePaths = new Set<string>();
  const archive = unzipSync(
    input instanceof Uint8Array ? input : new Uint8Array(input),
    {
      filter: (file) => {
        entryCount += 1;
        if (entryCount > MAX_PORTABLE_PROJECT_ENTRY_COUNT) {
          throw new Error(
            `Project archive contains too many files. The maximum supported count is ${MAX_PORTABLE_PROJECT_ENTRY_COUNT}.`,
          );
        }

        expandedSizeBytes += file.originalSize;
        if (expandedSizeBytes > MAX_PORTABLE_PROJECT_EXPANDED_BYTES) {
          throw new Error(
            `Expanded project archive is too large. The maximum supported size is ${MAX_PORTABLE_PROJECT_EXPANDED_BYTES} bytes.`,
          );
        }

        const normalizedPath = assertSafeArchivePath(file.name);
        if (archivePaths.has(normalizedPath)) {
          throw new Error(
            `Project archive contains duplicate path "${normalizedPath}".`,
          );
        }
        archivePaths.add(normalizedPath);
        return true;
      },
    },
  );
  const archiveEntries = Object.entries(archive);

  const normalizedArchive = new Map<string, Uint8Array>();
  for (const [path, bytes] of archiveEntries) {
    const normalizedPath = assertSafeArchivePath(path);
    if (normalizedArchive.has(normalizedPath)) {
      throw new Error(
        `Project archive contains duplicate path "${normalizedPath}".`,
      );
    }
    normalizedArchive.set(normalizedPath, bytes);
  }

  const metadataEntry = normalizedArchive.get(
    BROWSER_PROJECT_ARCHIVE_METADATA_PATH,
  );
  if (!metadataEntry) {
    throw new Error(
      `Project archive is missing "${BROWSER_PROJECT_ARCHIVE_METADATA_PATH}".`,
    );
  }

  const metadata = browserProjectArchiveMetadataSchema.parse(
    JSON.parse(strFromU8(metadataEntry)),
  );

  const manifestEntry = normalizedArchive.get(
    BROWSER_PROJECT_EXPORT_MANIFEST_PATH,
  );
  const manifest = manifestEntry
    ? exportManifestSchema.parse(JSON.parse(strFromU8(manifestEntry)))
    : null;

  const runtimeSnapshotBytes =
    normalizedArchive.get(BROWSER_PROJECT_RUNTIME_SNAPSHOT_PATH) ?? null;

  const files = new Map<string, ProjectArtifactTextFile>();

  for (const [normalizedPath, bytes] of normalizedArchive) {
    if (
      !normalizedPath ||
      normalizedPath === BROWSER_PROJECT_ARCHIVE_METADATA_PATH ||
      normalizedPath === BROWSER_PROJECT_EXPORT_MANIFEST_PATH ||
      normalizedPath === BROWSER_PROJECT_RUNTIME_SNAPSHOT_PATH
    ) {
      continue;
    }

    files.set(normalizedPath, {
      path: normalizedPath,
      content: strFromU8(bytes),
    });
  }

  const bundle = browserProjectBundleSchema.parse({
    schemaVersion: metadata.schemaVersion,
    exportedAt: metadata.exportedAt,
    project: metadata.project,
    files: Array.from(files.values()).sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  });

  return {
    bundle,
    manifest,
    runtimeSnapshotBytes,
    entryCount,
    expandedSizeBytes,
  };
}

export async function restoreBrowserProjectBundle(
  bundle: BrowserProjectBundle,
): Promise<OpenProjectState> {
  const previousProject = await getOpenProject();
  if (previousProject && previousProject.id !== bundle.project.id) {
    const { migrateLegacySqlQueryStateToProject } = await import(
      "@/lib/workspace/sql-query-project-scope"
    );
    await migrateLegacySqlQueryStateToProject(previousProject.id);
  }

  const now = Date.now();
  const project: OpenProjectState = {
    id: bundle.project.id,
    name: bundle.project.name,
    backingKind: "browser-indexeddb",
    openedAt: bundle.project.openedAt ?? now,
    updatedAt: now,
    defaultSourceRef: bundle.project.defaultSourceRef ?? null,
  };

  const browserStore = new BrowserProjectStore();
  setProjectStoreMode(project.id, "browser-indexeddb");
  await browserStore.setOpenProject(project);
  await browserStore.replaceProjectFiles(project.id, "", bundle.files);

  return project;
}
