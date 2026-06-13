import { importParsedProjectArtifacts } from "@/lib/project-artifacts/import";
import type { ParsedProjectArtifacts } from "@/lib/project-artifacts/parse";
import { parseProjectArtifactFileSet } from "@/lib/project-artifacts/parse";
import {
  clearProjectRuntimeSelection,
  type ProjectRuntimeSelection,
  resolveProjectRuntimeSelection,
  setProjectRuntimeSelection,
} from "@/lib/project-runtime-selection";
import {
  getOpenProject,
  listOpenProjectFiles,
  type OpenProjectState,
  setOpenProject,
} from "@/lib/project-store";
import { setSqlBackendPreferenceInStorage } from "@/lib/sql/sql-runtime";

export {
  clearProjectRuntimeSelection,
  getProjectRuntimeDefaultCatalogContext,
  getProjectRuntimeDefaultDbIdentifier,
  getProjectRuntimeDefaultDbIdentifierForSelection,
  getProjectRuntimeDefaultSetupSql,
  getProjectRuntimeSelection,
  type ProjectRuntimeSelection,
  resolveProjectRuntimeSelection,
  setProjectRuntimeSelection,
} from "@/lib/project-runtime-selection";

type ProjectRuntimeHydrationDeps = {
  setOpenProject: (project: OpenProjectState | null) => Promise<void>;
  persistSelection: (selection: ProjectRuntimeSelection | null) => void;
  setSqlBackendPreference: typeof setSqlBackendPreferenceInStorage;
};

const defaultHydrationDeps: ProjectRuntimeHydrationDeps = {
  setOpenProject,
  persistSelection: setProjectRuntimeSelection,
  setSqlBackendPreference: setSqlBackendPreferenceInStorage,
};

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
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
