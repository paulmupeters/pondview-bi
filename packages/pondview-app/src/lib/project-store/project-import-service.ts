import { DuckdbWasmClient } from "@/lib/duckdb/duckdb-wasm-client";
import { importParsedProjectArtifacts } from "@/lib/project-artifacts/import";
import {
  type ParsedProjectArtifacts,
  parseProjectArtifactFileSet,
} from "@/lib/project-artifacts/parse";
import type {
  LocalProjectSourceBinding,
  LocalProjectSourceBindings,
} from "@/lib/project-artifacts/types";
import { hydrateProjectRuntimeFromParsedArtifacts } from "@/lib/project-runtime";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  setSqlBackendPreferenceInStorage,
} from "@/lib/sql/sql-runtime";
import type { ProjectArtifactTextFile } from "../project-artifacts/export";
import type { OpenProjectState } from "./index";
import {
  type BrowserProjectBundle,
  MAX_PORTABLE_PROJECT_ARCHIVE_BYTES,
  MAX_PORTABLE_PROJECT_ENTRY_COUNT,
  MAX_PORTABLE_PROJECT_EXPANDED_BYTES,
  type ProjectExportManifest,
  parseBrowserProjectArchiveWithRuntime,
  parseBrowserProjectBundle,
  restoreBrowserProjectBundle,
} from "./project-transfer";

export type PortableProjectWarningSeverity = "info" | "warning" | "danger";

export type PortableProjectWarning = {
  code:
    | "bridge-source"
    | "custom-setup-sql"
    | "external-source"
    | "embedded-credential"
    | "missing-snapshot";
  severity: PortableProjectWarningSeverity;
  message: string;
};

export type InspectedPortableProject = {
  fileName: string;
  archiveSizeBytes: number;
  expandedSizeBytes: number;
  entryCount: number;
  bundle: BrowserProjectBundle;
  manifest: ProjectExportManifest | null;
  parsedArtifacts: ParsedProjectArtifacts;
  runtimeSnapshotBytes: Uint8Array | null;
  entryDashboardId: string | null;
  dashboardCount: number;
  queryCount: number;
  notebookCount: number;
  warnings: PortableProjectWarning[];
};

export type PortableProjectImportResult = {
  project: OpenProjectState;
  dashboardId: string | null;
  restoredSnapshot: boolean;
};

export type ProjectImportDeps = {
  restoreBundle: typeof restoreBrowserProjectBundle;
  importSnapshot: (bytes: Uint8Array) => Promise<void>;
  hydrateRuntime: typeof hydrateProjectRuntimeFromParsedArtifacts;
  importArtifacts: typeof importParsedProjectArtifacts;
  setSqlBackendPreference: typeof setSqlBackendPreferenceInStorage;
  estimateStorage: () => Promise<StorageEstimate | null>;
};

const defaultProjectImportDeps: ProjectImportDeps = {
  restoreBundle: restoreBrowserProjectBundle,
  importSnapshot: (bytes) =>
    new DuckdbWasmClient().importDatabaseSnapshot(bytes),
  hydrateRuntime: hydrateProjectRuntimeFromParsedArtifacts,
  importArtifacts: importParsedProjectArtifacts,
  setSqlBackendPreference: setSqlBackendPreferenceInStorage,
  estimateStorage: async () => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.storage?.estimate !== "function"
    ) {
      return null;
    }
    return navigator.storage.estimate();
  },
};

function formatProjectJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hasSensitiveKey(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    if (
      normalizedKey === "token" ||
      normalizedKey === "password" ||
      normalizedKey === "secret" ||
      normalizedKey === "apikey" ||
      normalizedKey === "authorization" ||
      normalizedKey === "accesskeyid" ||
      normalizedKey === "secretaccesskey"
    ) {
      if (typeof child === "string" && child.trim()) {
        return true;
      }
    }
    if (hasSensitiveKey(child)) {
      return true;
    }
  }

  return false;
}

function identifierContainsCredentials(value: string | undefined): boolean {
  return Boolean(value && /:\/\/[^/@:\s]+:[^/@\s]+@/.test(value));
}

function inspectSourceBindings(
  bindings: LocalProjectSourceBindings | null,
): PortableProjectWarning[] {
  if (!bindings) {
    return [];
  }

  const warnings: PortableProjectWarning[] = [];
  let hasBridgeSource = false;
  let hasCustomSetupSql = false;
  let hasExternalSource = false;
  let hasEmbeddedCredential = false;

  for (const binding of Object.values(bindings.bindings)) {
    hasBridgeSource ||= binding.runtimeBackend === "bridge";
    hasCustomSetupSql ||= binding.connection?.type === "custom";
    hasExternalSource ||= Boolean(binding.connection);
    hasEmbeddedCredential ||=
      hasSensitiveKey(binding.connection) ||
      identifierContainsCredentials(binding.connection?.identifier) ||
      identifierContainsCredentials(binding.dbIdentifier ?? undefined);
  }

  if (hasEmbeddedCredential) {
    warnings.push({
      code: "embedded-credential",
      severity: "danger",
      message:
        "The project contains a credential-like source value. Portable imports disable source connections, but you should remove secrets before sharing the file.",
    });
  }
  if (hasCustomSetupSql) {
    warnings.push({
      code: "custom-setup-sql",
      severity: "danger",
      message:
        "The project contains custom source setup SQL. It will be disabled when opened as a browser-only project.",
    });
  }
  if (hasBridgeSource) {
    warnings.push({
      code: "bridge-source",
      severity: "warning",
      message:
        "The project references Bridge sources. They will be converted to the local browser runtime; include a DuckDB snapshot if the dashboard needs their data.",
    });
  }
  if (hasExternalSource) {
    warnings.push({
      code: "external-source",
      severity: "warning",
      message:
        "External source connections are disabled in portable browser imports. Queries that directly read public HTTPS data may still work after you approve the package.",
    });
  }

  return warnings;
}

function createPortableBinding(
  _binding: LocalProjectSourceBinding,
): LocalProjectSourceBinding {
  return {
    runtimeBackend: "duckdb-wasm",
    dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
    catalogContext: null,
  };
}

function createPortableBindings(
  bindings: LocalProjectSourceBindings | null,
): LocalProjectSourceBindings | null {
  if (!bindings) {
    return null;
  }

  return {
    schemaVersion: 1,
    bindings: Object.fromEntries(
      Object.entries(bindings.bindings).map(([sourceRef, binding]) => [
        sourceRef,
        createPortableBinding(binding),
      ]),
    ),
  };
}

export function sanitizePortableProjectFiles(
  files: ProjectArtifactTextFile[],
  parsed: ParsedProjectArtifacts,
): ProjectArtifactTextFile[] {
  const portableBindings = createPortableBindings(parsed.localSourceBindings);

  return files.map((file) => {
    if (file.path === "pondview/project.json" && parsed.projectManifest) {
      return {
        ...file,
        content: formatProjectJson({
          ...parsed.projectManifest,
          sourceBindings: parsed.projectManifest.sourceBindings
            ? (portableBindings?.bindings ?? {})
            : undefined,
        }),
      };
    }

    if (
      file.path === "pondview.sources.local.json" &&
      portableBindings !== null
    ) {
      return {
        ...file,
        content: formatProjectJson(portableBindings),
      };
    }

    return file;
  });
}

function inspectBundle(input: {
  fileName: string;
  archiveSizeBytes: number;
  expandedSizeBytes: number;
  entryCount: number;
  bundle: BrowserProjectBundle;
  manifest: ProjectExportManifest | null;
  runtimeSnapshotBytes: Uint8Array | null;
}): InspectedPortableProject {
  const parsedArtifacts = parseProjectArtifactFileSet(input.bundle.files);
  const warnings = inspectSourceBindings(parsedArtifacts.localSourceBindings);
  if (!input.runtimeSnapshotBytes) {
    warnings.push({
      code: "missing-snapshot",
      severity: "info",
      message:
        "This package contains project definitions but no DuckDB snapshot. The recipient must provide compatible data separately.",
    });
  }

  const requestedEntryDashboardId =
    input.manifest?.package?.entryDashboardId ?? null;
  const entryDashboardId =
    requestedEntryDashboardId &&
    parsedArtifacts.dashboards.some(
      (dashboard) => dashboard.manifest.id === requestedEntryDashboardId,
    )
      ? requestedEntryDashboardId
      : (parsedArtifacts.dashboards[0]?.manifest.id ?? null);

  return {
    ...input,
    parsedArtifacts,
    entryDashboardId,
    dashboardCount: parsedArtifacts.dashboards.length,
    queryCount: parsedArtifacts.sharedQueries.length,
    notebookCount: parsedArtifacts.publishedNotebooks.length,
    warnings,
  };
}

export function inspectPortableProjectBytes(input: {
  fileName: string;
  bytes: Uint8Array;
}): InspectedPortableProject {
  if (input.bytes.byteLength > MAX_PORTABLE_PROJECT_ARCHIVE_BYTES) {
    throw new Error(
      `Project file is too large. The maximum supported size is ${MAX_PORTABLE_PROJECT_ARCHIVE_BYTES} bytes.`,
    );
  }

  const lowerName = input.fileName.toLowerCase();
  if (lowerName.endsWith(".json")) {
    const bundle = parseBrowserProjectBundle(
      new TextDecoder().decode(input.bytes),
    );
    const expandedSizeBytes = bundle.files.reduce(
      (total, file) =>
        total + new TextEncoder().encode(file.content).byteLength,
      0,
    );
    if (bundle.files.length > MAX_PORTABLE_PROJECT_ENTRY_COUNT) {
      throw new Error(
        `Project bundle contains too many files. The maximum supported count is ${MAX_PORTABLE_PROJECT_ENTRY_COUNT}.`,
      );
    }
    if (expandedSizeBytes > MAX_PORTABLE_PROJECT_EXPANDED_BYTES) {
      throw new Error(
        `Expanded project bundle is too large. The maximum supported size is ${MAX_PORTABLE_PROJECT_EXPANDED_BYTES} bytes.`,
      );
    }
    return inspectBundle({
      fileName: input.fileName,
      archiveSizeBytes: input.bytes.byteLength,
      expandedSizeBytes,
      entryCount: bundle.files.length,
      bundle,
      manifest: null,
      runtimeSnapshotBytes: null,
    });
  }

  const parsed = parseBrowserProjectArchiveWithRuntime(input.bytes);
  return inspectBundle({
    fileName: input.fileName,
    archiveSizeBytes: input.bytes.byteLength,
    expandedSizeBytes: parsed.expandedSizeBytes,
    entryCount: parsed.entryCount,
    bundle: parsed.bundle,
    manifest: parsed.manifest,
    runtimeSnapshotBytes: parsed.runtimeSnapshotBytes,
  });
}

export async function inspectPortableProjectFile(
  file: File,
): Promise<InspectedPortableProject> {
  return inspectPortableProjectBytes({
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
}

async function assertSnapshotStorageAvailable(
  snapshotBytes: Uint8Array,
  deps: ProjectImportDeps,
): Promise<void> {
  const estimate = await deps.estimateStorage();
  const quota = estimate?.quota;
  const usage = estimate?.usage ?? 0;
  if (
    typeof quota === "number" &&
    quota > 0 &&
    quota - usage < snapshotBytes.byteLength * 1.1
  ) {
    throw new Error(
      "There is not enough browser storage available for this DuckDB snapshot.",
    );
  }
}

export async function importInspectedPortableProject(
  inspection: InspectedPortableProject,
  deps: ProjectImportDeps = defaultProjectImportDeps,
): Promise<PortableProjectImportResult> {
  const portableFiles = sanitizePortableProjectFiles(
    inspection.bundle.files,
    inspection.parsedArtifacts,
  );
  const portableBundle: BrowserProjectBundle = {
    ...inspection.bundle,
    files: portableFiles,
  };
  const parsedArtifacts = parseProjectArtifactFileSet(portableFiles);

  if (inspection.runtimeSnapshotBytes) {
    await assertSnapshotStorageAvailable(inspection.runtimeSnapshotBytes, deps);
  }

  const project = await deps.restoreBundle(portableBundle);
  deps.setSqlBackendPreference("duckdb-wasm");

  if (inspection.runtimeSnapshotBytes) {
    await deps.importSnapshot(inspection.runtimeSnapshotBytes);
  }

  await deps.hydrateRuntime({
    project,
    parsed: parsedArtifacts,
  });
  deps.setSqlBackendPreference("duckdb-wasm");

  const imported = await deps.importArtifacts(parsedArtifacts, {
    projectId: project.id,
    defaultSourceRef:
      parsedArtifacts.projectManifest?.defaultSourceRef ??
      project.defaultSourceRef ??
      null,
    localSourceBindings: createPortableBindings(
      parsedArtifacts.localSourceBindings,
    ),
    fallbackSqlBackend: "duckdb-wasm",
  });

  const requestedIndex = inspection.entryDashboardId
    ? parsedArtifacts.dashboards.findIndex(
        (dashboard) => dashboard.manifest.id === inspection.entryDashboardId,
      )
    : -1;
  const dashboardId =
    imported.dashboards[requestedIndex]?.id ??
    imported.dashboards[0]?.id ??
    null;

  return {
    project,
    dashboardId,
    restoredSnapshot: inspection.runtimeSnapshotBytes !== null,
  };
}
