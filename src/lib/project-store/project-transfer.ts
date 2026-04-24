import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import type { ProjectArtifactTextFile } from "@/lib/project-artifacts/export";
import { normalizeProjectArtifactPath } from "@/lib/project-artifacts/parse";
import {
  getProjectStore,
  type OpenProjectState,
  setOpenProject,
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

export type BrowserProjectBundle = z.infer<typeof browserProjectBundleSchema>;
export type BrowserProjectArchiveMetadata = z.infer<
  typeof browserProjectArchiveMetadataSchema
>;

export const BROWSER_PROJECT_ARCHIVE_METADATA_PATH = ".pondview/project.json";

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
    archiveFiles[normalizeProjectArtifactPath(file.path)] = strToU8(
      file.content,
    );
  }

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
  const archive = unzipSync(
    input instanceof Uint8Array ? input : new Uint8Array(input),
  );
  const metadataEntry = archive[BROWSER_PROJECT_ARCHIVE_METADATA_PATH];
  if (!metadataEntry) {
    throw new Error(
      `Project archive is missing "${BROWSER_PROJECT_ARCHIVE_METADATA_PATH}".`,
    );
  }

  const metadata = browserProjectArchiveMetadataSchema.parse(
    JSON.parse(strFromU8(metadataEntry)),
  );
  const files = new Map<string, ProjectArtifactTextFile>();

  for (const [path, bytes] of Object.entries(archive)) {
    const normalizedPath = normalizeProjectArtifactPath(path);
    if (
      !normalizedPath ||
      normalizedPath === BROWSER_PROJECT_ARCHIVE_METADATA_PATH
    ) {
      continue;
    }

    files.set(normalizedPath, {
      path: normalizedPath,
      content: strFromU8(bytes),
    });
  }

  return browserProjectBundleSchema.parse({
    schemaVersion: metadata.schemaVersion,
    exportedAt: metadata.exportedAt,
    project: metadata.project,
    files: Array.from(files.values()).sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  });
}

export async function restoreBrowserProjectBundle(
  bundle: BrowserProjectBundle,
): Promise<OpenProjectState> {
  const now = Date.now();
  const project: OpenProjectState = {
    id: bundle.project.id,
    name: bundle.project.name,
    backingKind: "browser-indexeddb",
    openedAt: bundle.project.openedAt ?? now,
    updatedAt: now,
    defaultSourceRef: bundle.project.defaultSourceRef ?? null,
  };

  await setOpenProject(project);
  await getProjectStore().replaceProjectFiles(project.id, "", bundle.files);

  return project;
}
