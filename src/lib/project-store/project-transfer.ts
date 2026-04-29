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
export const BROWSER_PROJECT_VIEWER_HTML_PATH = "index.html";
export const BROWSER_PROJECT_VIEWER_SCRIPT_PATH = "pondview-export.js";

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
    archiveFiles[normalizeProjectArtifactPath(file.path)] = strToU8(
      file.content,
    );
  }

  const manifest: ProjectExportManifest = {
    schemaVersion: 1,
    exportedAt: bundle.exportedAt,
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
  archiveFiles[BROWSER_PROJECT_VIEWER_HTML_PATH] = strToU8(
    createBrowserProjectViewerHtml(bundle.project.name),
  );
  archiveFiles[BROWSER_PROJECT_VIEWER_SCRIPT_PATH] = strToU8(
    createBrowserProjectViewerScript({ bundle, manifest }),
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
} {
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

  const manifestEntry = archive[BROWSER_PROJECT_EXPORT_MANIFEST_PATH];
  const manifest = manifestEntry
    ? exportManifestSchema.parse(JSON.parse(strFromU8(manifestEntry)))
    : null;

  const runtimeSnapshotBytes =
    archive[BROWSER_PROJECT_RUNTIME_SNAPSHOT_PATH] ?? null;

  const files = new Map<string, ProjectArtifactTextFile>();

  for (const [path, bytes] of Object.entries(archive)) {
    const normalizedPath = normalizeProjectArtifactPath(path);
    if (
      !normalizedPath ||
      normalizedPath === BROWSER_PROJECT_ARCHIVE_METADATA_PATH ||
      normalizedPath === BROWSER_PROJECT_EXPORT_MANIFEST_PATH ||
      normalizedPath === BROWSER_PROJECT_RUNTIME_SNAPSHOT_PATH ||
      normalizedPath === BROWSER_PROJECT_VIEWER_HTML_PATH ||
      normalizedPath === BROWSER_PROJECT_VIEWER_SCRIPT_PATH
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

  return { bundle, manifest, runtimeSnapshotBytes };
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createBrowserProjectViewerHtml(projectName: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(projectName)} - Pondview Export</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        background: Canvas;
        color: CanvasText;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
      }
      header {
        border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
        padding: 24px clamp(16px, 4vw, 40px);
      }
      main {
        display: grid;
        gap: 20px;
        padding: 24px clamp(16px, 4vw, 40px) 40px;
      }
      h1,
      h2,
      h3 {
        margin: 0;
        line-height: 1.2;
      }
      h1 {
        font-size: clamp(1.8rem, 4vw, 3rem);
      }
      h2 {
        font-size: 1.1rem;
      }
      h3 {
        font-size: 0.95rem;
      }
      p {
        margin: 0;
      }
      .muted {
        color: color-mix(in srgb, CanvasText 62%, transparent);
      }
      .grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .panel,
      details {
        border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
        border-radius: 8px;
        padding: 16px;
        background: color-mix(in srgb, Canvas 94%, CanvasText 6%);
      }
      .stack {
        display: grid;
        gap: 10px;
      }
      .row {
        align-items: start;
        display: flex;
        gap: 10px;
        justify-content: space-between;
      }
      .pill {
        border: 1px solid color-mix(in srgb, CanvasText 16%, transparent);
        border-radius: 999px;
        font-size: 0.78rem;
        padding: 3px 8px;
        white-space: nowrap;
      }
      summary {
        cursor: pointer;
        font-weight: 650;
      }
      pre {
        border-radius: 6px;
        margin: 12px 0 0;
        max-height: 360px;
        overflow: auto;
        padding: 12px;
        white-space: pre-wrap;
        word-break: break-word;
        background: color-mix(in srgb, CanvasText 8%, transparent);
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", monospace;
        font-size: 0.85rem;
      }
      .empty {
        border: 1px dashed color-mix(in srgb, CanvasText 24%, transparent);
        border-radius: 8px;
        padding: 18px;
      }
    </style>
  </head>
  <body>
    <header>
      <p class="muted">Pondview project export</p>
      <h1>${escapeHtml(projectName)}</h1>
    </header>
    <main id="app">
      <p class="muted">Loading exported project...</p>
    </main>
    <script src="./pondview-export.js"></script>
  </body>
</html>
`;
}

function createBrowserProjectViewerScript(input: {
  bundle: BrowserProjectBundle;
  manifest: ProjectExportManifest;
}): string {
  const payload = JSON.stringify(input);
  return `"use strict";
const pondviewExport = ${payload};

const app = document.getElementById("app");
const files = pondviewExport.bundle.files;
const byPath = new Map(files.map((file) => [file.path, file]));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseJson(path) {
  const file = byPath.get(path);
  if (!file) return null;
  try {
    return JSON.parse(file.content);
  } catch {
    return null;
  }
}

function fileName(path) {
  return path.split("/").filter(Boolean).at(-1) || path;
}

function pathsMatching(pattern) {
  return files.map((file) => file.path).filter((path) => pattern.test(path)).sort();
}

function section(title, body, emptyMessage) {
  return \`<section class="stack"><h2>\${escapeHtml(title)}</h2>\${body || \`<div class="empty muted">\${escapeHtml(emptyMessage)}</div>\`}</section>\`;
}

function renderDashboards() {
  return pathsMatching(/(^|\\/)dashboard\\.json$/).map((path) => {
    const dashboard = parseJson(path);
    const root = path.replace(/\\/dashboard\\.json$/, "");
    const visuals = Array.isArray(dashboard?.visuals) ? dashboard.visuals : [];
    const measures = Array.isArray(dashboard?.measures) ? dashboard.measures : [];
    const visualRows = visuals.map((visual) => {
      const metadataPath = \`\${root}/\${visual.metadataFile}\`;
      const sqlPath = \`\${root}/\${visual.sqlFile}\`;
      const metadata = parseJson(metadataPath);
      const title = metadata?.config?.title || metadata?.config?.label || visual.id;
      return \`<details><summary>\${escapeHtml(title)}</summary><p class="muted">\${escapeHtml(sqlPath)}</p><pre><code>\${escapeHtml(byPath.get(sqlPath)?.content || "")}</code></pre></details>\`;
    }).join("");
    const measureRows = measures.map((measure) => {
      const sqlPath = \`\${root}/\${measure.sqlFile}\`;
      return \`<details><summary>\${escapeHtml(measure.id)}</summary><p class="muted">\${escapeHtml(sqlPath)}</p><pre><code>\${escapeHtml(byPath.get(sqlPath)?.content || "")}</code></pre></details>\`;
    }).join("");
    return \`<article class="panel stack"><div class="row"><h3>\${escapeHtml(dashboard?.title || fileName(root))}</h3><span class="pill">\${visuals.length} visuals</span></div><p class="muted">\${escapeHtml(path)}</p>\${visualRows}\${measureRows}</article>\`;
  }).join("");
}

function renderQueries() {
  return pathsMatching(/\\.query\\.json$/).map((path) => {
    const query = parseJson(path);
    const sqlPath = path.replace(/\\.query\\.json$/, ".sql");
    return \`<article class="panel stack"><div class="row"><h3>\${escapeHtml(query?.name || fileName(sqlPath))}</h3><span class="pill">\${escapeHtml(query?.kind || "query")}</span></div><p class="muted">\${escapeHtml(sqlPath)}</p><pre><code>\${escapeHtml(byPath.get(sqlPath)?.content || "")}</code></pre></article>\`;
  }).join("");
}

function renderNotebooks() {
  return pathsMatching(/(^|\\/)notebook\\.json$/).map((path) => {
    const notebook = parseJson(path);
    const root = path.replace(/\\/notebook\\.json$/, "");
    const cells = Array.isArray(notebook?.cells) ? notebook.cells : [];
    const cellRows = cells.map((cell) => {
      const contentPath = \`\${root}/\${cell.file}\`;
      return \`<details><summary>\${escapeHtml(cell.kind)}: \${escapeHtml(cell.id)}</summary><p class="muted">\${escapeHtml(contentPath)}</p><pre><code>\${escapeHtml(byPath.get(contentPath)?.content || "")}</code></pre></details>\`;
    }).join("");
    return \`<article class="panel stack"><div class="row"><h3>\${escapeHtml(notebook?.title || fileName(root))}</h3><span class="pill">\${cells.length} cells</span></div><p class="muted">\${escapeHtml(path)}</p>\${cellRows}</article>\`;
  }).join("");
}

function renderFiles() {
  return files.map((file) => \`<details><summary>\${escapeHtml(file.path)}</summary><pre><code>\${escapeHtml(file.content)}</code></pre></details>\`).join("");
}

const snapshot = pondviewExport.manifest.runtimeSnapshot;
app.innerHTML = \`
  <section class="grid">
    <div class="panel stack"><h2>Project</h2><p>\${escapeHtml(pondviewExport.bundle.project.name)}</p><p class="muted">\${escapeHtml(pondviewExport.bundle.project.id)}</p></div>
    <div class="panel stack"><h2>Exported</h2><p>\${escapeHtml(pondviewExport.bundle.exportedAt)}</p><p class="muted">\${files.length} artifact files</p></div>
    <div class="panel stack"><h2>Runtime Snapshot</h2><p>\${snapshot?.included ? "Included" : "Not included"}</p><p class="muted">\${escapeHtml(snapshot?.path || snapshot?.key || "")}</p></div>
  </section>
  \${section("Dashboards", renderDashboards(), "No dashboards were exported.")}
  \${section("Queries", renderQueries(), "No shared queries were exported.")}
  \${section("Notebooks", renderNotebooks(), "No published notebooks were exported.")}
  \${section("Artifact Files", renderFiles(), "No artifact files were exported.")}
\`;
`;
}
