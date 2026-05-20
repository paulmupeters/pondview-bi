import { importParsedProjectArtifacts } from "@/lib/project-artifacts/import";
import type { ParsedProjectArtifacts } from "@/lib/project-artifacts/parse";
import { parseProjectArtifactFileSet } from "@/lib/project-artifacts/parse";
import {
  getOpenProject,
  listOpenProjectFiles,
  type OpenProjectState,
  setOpenProject,
} from "@/lib/project-store";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  type SqlBackend,
  setSqlBackendPreferenceInStorage,
} from "@/lib/sql/sql-runtime";

const PROJECT_RUNTIME_SELECTION_KEY = "pondview.project-runtime-selection";

export type ProjectRuntimeSelection = {
  projectId: string;
  sourceRef: string;
  runtimeBackend: SqlBackend;
  dbIdentifier: string | null;
  catalogContext: string | null;
};

type ProjectRuntimeHydrationDeps = {
  setOpenProject: (project: OpenProjectState | null) => Promise<void>;
  persistSelection: (selection: ProjectRuntimeSelection | null) => void;
  setSqlBackendPreference: (backend: SqlBackend) => void;
};

const defaultHydrationDeps: ProjectRuntimeHydrationDeps = {
  setOpenProject,
  persistSelection: setProjectRuntimeSelection,
  setSqlBackendPreference: setSqlBackendPreferenceInStorage,
};

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

export function resolveProjectRuntimeSelection(input: {
  projectId: string;
  parsed: Pick<
    ParsedProjectArtifacts,
    "projectManifest" | "localSourceBindings"
  >;
}): ProjectRuntimeSelection | null {
  const sourceRef = normalizeOptionalString(
    input.parsed.projectManifest?.defaultSourceRef,
  );
  if (!sourceRef) {
    return null;
  }

  const binding = input.parsed.localSourceBindings?.bindings[sourceRef];
  if (!binding) {
    return null;
  }

  return {
    projectId: input.projectId,
    sourceRef,
    runtimeBackend: binding.runtimeBackend,
    dbIdentifier: normalizeOptionalString(binding.dbIdentifier),
    catalogContext: normalizeOptionalString(binding.catalogContext),
  };
}

export function getProjectRuntimeSelection(): ProjectRuntimeSelection | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PROJECT_RUNTIME_SELECTION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ProjectRuntimeSelection>;
    if (
      typeof parsed.projectId !== "string" ||
      typeof parsed.sourceRef !== "string" ||
      (parsed.runtimeBackend !== "bridge" &&
        parsed.runtimeBackend !== "duckdb-wasm")
    ) {
      return null;
    }

    return {
      projectId: parsed.projectId,
      sourceRef: parsed.sourceRef,
      runtimeBackend: parsed.runtimeBackend,
      dbIdentifier: normalizeOptionalString(parsed.dbIdentifier),
      catalogContext: normalizeOptionalString(parsed.catalogContext),
    };
  } catch {
    return null;
  }
}

export function setProjectRuntimeSelection(
  selection: ProjectRuntimeSelection | null,
): void {
  if (!isBrowser()) {
    return;
  }

  if (!selection) {
    window.localStorage.removeItem(PROJECT_RUNTIME_SELECTION_KEY);
    return;
  }

  window.localStorage.setItem(
    PROJECT_RUNTIME_SELECTION_KEY,
    JSON.stringify(selection),
  );
}

export function clearProjectRuntimeSelection(): void {
  setProjectRuntimeSelection(null);
}

export function getProjectRuntimeDefaultDbIdentifierForSelection(
  selection: ProjectRuntimeSelection | null,
): string | undefined {
  if (!selection) {
    return undefined;
  }

  if (selection.runtimeBackend === "duckdb-wasm") {
    return selection.dbIdentifier ?? DEFAULT_WASM_DB_IDENTIFIER;
  }

  return selection.dbIdentifier ?? undefined;
}

export function getProjectRuntimeDefaultDbIdentifier(): string | undefined {
  return getProjectRuntimeDefaultDbIdentifierForSelection(
    getProjectRuntimeSelection(),
  );
}

export function getProjectRuntimeDefaultCatalogContext(): string | null {
  return getProjectRuntimeSelection()?.catalogContext ?? null;
}

export async function hydrateProjectRuntimeFromParsedArtifacts(
  input: {
    project: OpenProjectState;
    parsed: Pick<
      ParsedProjectArtifacts,
      "projectManifest" | "localSourceBindings"
    >;
  },
  deps: ProjectRuntimeHydrationDeps = defaultHydrationDeps,
): Promise<ProjectRuntimeSelection | null> {
  const nextDefaultSourceRef =
    normalizeOptionalString(input.parsed.projectManifest?.defaultSourceRef) ??
    null;

  if ((input.project.defaultSourceRef ?? null) !== nextDefaultSourceRef) {
    await deps.setOpenProject({
      ...input.project,
      defaultSourceRef: nextDefaultSourceRef,
      updatedAt: Date.now(),
    });
  }

  const selection = resolveProjectRuntimeSelection({
    projectId: input.project.id,
    parsed: input.parsed,
  });

  deps.persistSelection(selection);
  if (selection) {
    deps.setSqlBackendPreference(selection.runtimeBackend);
  }

  return selection;
}

export async function hydrateOpenProjectRuntimeFromStore(): Promise<ProjectRuntimeSelection | null> {
  const project = await getOpenProject();
  if (!project) {
    clearProjectRuntimeSelection();
    return null;
  }

  const parsed = parseProjectArtifactFileSet(await listOpenProjectFiles());
  return hydrateProjectRuntimeFromParsedArtifacts({
    project,
    parsed,
  });
}

export async function hydrateAndImportOpenProjectFromStore(): Promise<ProjectRuntimeSelection | null> {
  const project = await getOpenProject();
  if (!project) {
    clearProjectRuntimeSelection();
    return null;
  }

  const parsed = parseProjectArtifactFileSet(await listOpenProjectFiles());
  const selection = await hydrateProjectRuntimeFromParsedArtifacts({
    project,
    parsed,
  });

  if (project.backingKind === "bridge-filesystem") {
    await importParsedProjectArtifacts(parsed, {
      projectId: project.id,
      defaultSourceRef:
        parsed.projectManifest?.defaultSourceRef ??
        project.defaultSourceRef ??
        null,
    });
  }

  return selection;
}
