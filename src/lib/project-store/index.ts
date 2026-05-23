import {
  deleteBridgeProjectFiles,
  getBridgeCapabilities,
  getBridgeProject,
  getBridgeSession,
  listBridgeProjectFiles,
  replaceBridgeProjectFiles,
  saveBridgeProjectFiles,
  updateBridgeProject,
} from "@/lib/bridge/pondview-bridge";
import type { ProjectArtifactTextFile } from "@/lib/project-artifacts/export";
import {
  deleteByKey,
  getAllFromStore,
  getByKey,
  openWorkspaceDb,
  putMany,
  putOne,
  STORE_PROJECT_FILES,
  STORE_PROJECT_SESSIONS,
} from "@/lib/workspace/workspace-db";

const OPEN_PROJECT_SESSION_KEY = "open-project";
const PROJECT_REGISTRY_SESSION_KEY = "project-registry";
const PROJECT_STORE_MODE_KEY_PREFIX = "pondview.project-store-mode";

export type ProjectBackingKind = "browser-indexeddb" | "bridge-filesystem";
export type ProjectStoreMode = ProjectBackingKind;

export type OpenProjectState = {
  id: string;
  name: string;
  backingKind: ProjectBackingKind;
  openedAt: number;
  updatedAt: number;
  defaultSourceRef?: string | null;
  rootPath?: string;
};

export type StoredProjectFile = ProjectArtifactTextFile & {
  projectId: string;
  updatedAt: number;
};

export type ProjectBackingStore = {
  getOpenProject(): Promise<OpenProjectState | null>;
  setOpenProject(project: OpenProjectState | null): Promise<void>;
  listProjects(): Promise<OpenProjectState[]>;
  listProjectFiles(projectId: string): Promise<ProjectArtifactTextFile[]>;
  readProjectFile(
    projectId: string,
    path: string,
  ): Promise<ProjectArtifactTextFile | null>;
  saveProjectFiles(
    projectId: string,
    files: ProjectArtifactTextFile[],
  ): Promise<void>;
  deleteProjectFiles(projectId: string, paths: string[]): Promise<void>;
  replaceProjectFiles(
    projectId: string,
    scopePath: string,
    files: ProjectArtifactTextFile[],
  ): Promise<void>;
};

type ProjectSessionRow = {
  key: string;
  project: OpenProjectState | null;
};

type ProjectRegistryRow = {
  key: string;
  projects: OpenProjectState[];
};

type ProjectFileRow = StoredProjectFile & {
  key: string;
};

function normalizeProjectPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");
}

function normalizeScopePath(scopePath: string): string {
  return normalizeProjectPath(scopePath).replace(/\/+$/, "");
}

function createProjectFileKey(projectId: string, path: string): string {
  return `${projectId}:${normalizeProjectPath(path)}`;
}

function isProjectFileRow(value: unknown): value is ProjectFileRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ProjectFileRow>;
  return (
    typeof candidate.key === "string" &&
    typeof candidate.projectId === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.content === "string" &&
    typeof candidate.updatedAt === "number"
  );
}

function isOpenProjectState(value: unknown): value is OpenProjectState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<OpenProjectState>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    (candidate.backingKind === "browser-indexeddb" ||
      candidate.backingKind === "bridge-filesystem") &&
    typeof candidate.openedAt === "number" &&
    typeof candidate.updatedAt === "number"
  );
}

function isProjectRegistryRow(value: unknown): value is ProjectRegistryRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ProjectRegistryRow>;
  return (
    candidate.key === PROJECT_REGISTRY_SESSION_KEY &&
    Array.isArray(candidate.projects)
  );
}

function normalizeOpenProjectState(
  project: OpenProjectState,
): OpenProjectState {
  const now = Date.now();
  return {
    id: project.id.trim(),
    name: project.name.trim(),
    backingKind: project.backingKind,
    openedAt: project.openedAt || now,
    updatedAt: project.updatedAt || now,
    defaultSourceRef:
      typeof project.defaultSourceRef === "string"
        ? project.defaultSourceRef
        : null,
    rootPath:
      typeof project.rootPath === "string" ? project.rootPath : undefined,
  };
}

function mergeProjects(projects: OpenProjectState[]): OpenProjectState[] {
  const merged = new Map<string, OpenProjectState>();

  for (const project of projects) {
    const normalized = normalizeOpenProjectState(project);
    if (!normalized.id || !normalized.name) {
      continue;
    }

    const existing = merged.get(normalized.id);
    merged.set(normalized.id, {
      ...existing,
      ...normalized,
      openedAt: existing?.openedAt ?? normalized.openedAt,
      updatedAt: Math.max(existing?.updatedAt ?? 0, normalized.updatedAt),
      defaultSourceRef:
        normalized.defaultSourceRef ?? existing?.defaultSourceRef ?? null,
    });
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function normalizeProjectFiles(
  projectId: string,
  files: ProjectArtifactTextFile[],
  updatedAt = Date.now(),
): ProjectFileRow[] {
  const deduped = new Map<string, ProjectFileRow>();

  for (const file of files) {
    const path = normalizeProjectPath(file.path);
    if (!path) {
      continue;
    }

    deduped.set(path, {
      key: createProjectFileKey(projectId, path),
      projectId,
      path,
      content: file.content,
      updatedAt,
    });
  }

  return Array.from(deduped.values()).sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function toArtifactTextFile(row: ProjectFileRow): ProjectArtifactTextFile {
  return {
    path: row.path,
    content: row.content,
  };
}

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function getProjectStoreModeKey(projectId: string): string {
  return `${PROJECT_STORE_MODE_KEY_PREFIX}:${projectId}`;
}

export function getProjectStoreMode(
  projectId: string,
): ProjectStoreMode | null {
  if (!isBrowser()) {
    return null;
  }

  const value = window.localStorage.getItem(getProjectStoreModeKey(projectId));
  return value === "browser-indexeddb" || value === "bridge-filesystem"
    ? value
    : null;
}

export function setProjectStoreMode(
  projectId: string,
  mode: ProjectStoreMode,
): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(getProjectStoreModeKey(projectId), mode);
}

async function ensureProjectStores(): Promise<void> {
  const db = await openWorkspaceDb();

  if (
    db.objectStoreNames.contains(STORE_PROJECT_SESSIONS) &&
    db.objectStoreNames.contains(STORE_PROJECT_FILES)
  ) {
    return;
  }

  db.close();

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(db.name, db.version + 1);

    request.onupgradeneeded = () => {
      const upgradeDb = request.result;

      if (!upgradeDb.objectStoreNames.contains(STORE_PROJECT_SESSIONS)) {
        upgradeDb.createObjectStore(STORE_PROJECT_SESSIONS, {
          keyPath: "key",
        });
      }

      if (!upgradeDb.objectStoreNames.contains(STORE_PROJECT_FILES)) {
        const files = upgradeDb.createObjectStore(STORE_PROJECT_FILES, {
          keyPath: "key",
        });
        files.createIndex("projectId", "projectId", { unique: false });
        files.createIndex("projectIdPath", ["projectId", "path"], {
          unique: true,
        });
      }
    };

    request.onsuccess = () => {
      request.result.close();
      resolve();
    };

    request.onerror = () => {
      reject(
        request.error ?? new Error("Failed to initialize project stores."),
      );
    };

    request.onblocked = () => {
      reject(
        new Error(
          "Project store upgrade is blocked by another open Pondview tab.",
        ),
      );
    };
  });
}

export class BrowserProjectStore implements ProjectBackingStore {
  private async getProjectRegistry(): Promise<OpenProjectState[]> {
    await ensureProjectStores();
    const row = await getByKey<ProjectRegistryRow>(
      STORE_PROJECT_SESSIONS as never,
      PROJECT_REGISTRY_SESSION_KEY,
    );

    if (!row || !isProjectRegistryRow(row)) {
      return [];
    }

    return mergeProjects(row.projects.filter(isOpenProjectState));
  }

  private async saveProjectRegistry(
    projects: OpenProjectState[],
  ): Promise<void> {
    await putOne(STORE_PROJECT_SESSIONS as never, {
      key: PROJECT_REGISTRY_SESSION_KEY,
      projects: mergeProjects(projects),
    } satisfies ProjectRegistryRow);
  }

  private async rememberProject(project: OpenProjectState): Promise<void> {
    const projects = await this.getProjectRegistry();
    await this.saveProjectRegistry([...projects, project]);
  }

  async getOpenProject(): Promise<OpenProjectState | null> {
    await ensureProjectStores();
    const row = await getByKey<ProjectSessionRow>(
      STORE_PROJECT_SESSIONS as never,
      OPEN_PROJECT_SESSION_KEY,
    );

    if (!row?.project) {
      return null;
    }

    return isOpenProjectState(row.project) ? row.project : null;
  }

  async setOpenProject(project: OpenProjectState | null): Promise<void> {
    await ensureProjectStores();

    if (project === null) {
      await deleteByKey(
        STORE_PROJECT_SESSIONS as never,
        OPEN_PROJECT_SESSION_KEY,
      );
      return;
    }

    const normalized = normalizeOpenProjectState(project);
    if (!normalized.id || !normalized.name) {
      throw new Error("Open project state requires a non-empty id and name.");
    }

    await putOne(STORE_PROJECT_SESSIONS as never, {
      key: OPEN_PROJECT_SESSION_KEY,
      project: normalized,
    } satisfies ProjectSessionRow);
    await this.rememberProject(normalized);
  }

  async listProjects(): Promise<OpenProjectState[]> {
    await ensureProjectStores();
    const openProject = await this.getOpenProject();
    const projects = await this.getProjectRegistry();

    return mergeProjects(openProject ? [...projects, openProject] : projects);
  }

  async listProjectFiles(
    projectId: string,
  ): Promise<ProjectArtifactTextFile[]> {
    await ensureProjectStores();
    const rows = await getAllFromStore<ProjectFileRow>(
      STORE_PROJECT_FILES as never,
    );

    return rows
      .filter(
        (row): row is ProjectFileRow =>
          isProjectFileRow(row) && row.projectId === projectId,
      )
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(toArtifactTextFile);
  }

  async readProjectFile(
    projectId: string,
    path: string,
  ): Promise<ProjectArtifactTextFile | null> {
    await ensureProjectStores();
    const row = await getByKey<ProjectFileRow>(
      STORE_PROJECT_FILES as never,
      createProjectFileKey(projectId, path),
    );

    if (!row || !isProjectFileRow(row) || row.projectId !== projectId) {
      return null;
    }

    return toArtifactTextFile(row);
  }

  async saveProjectFiles(
    projectId: string,
    files: ProjectArtifactTextFile[],
  ): Promise<void> {
    await ensureProjectStores();
    const normalized = normalizeProjectFiles(projectId, files);
    if (normalized.length === 0) {
      return;
    }

    await putMany(STORE_PROJECT_FILES as never, normalized);
  }

  async deleteProjectFiles(projectId: string, paths: string[]): Promise<void> {
    await ensureProjectStores();

    for (const path of paths) {
      const normalizedPath = normalizeProjectPath(path);
      if (!normalizedPath) {
        continue;
      }

      await deleteByKey(
        STORE_PROJECT_FILES as never,
        createProjectFileKey(projectId, normalizedPath),
      );
    }
  }

  async replaceProjectFiles(
    projectId: string,
    scopePath: string,
    files: ProjectArtifactTextFile[],
  ): Promise<void> {
    await ensureProjectStores();

    const normalizedScope = normalizeScopePath(scopePath);
    const nextFiles = normalizeProjectFiles(projectId, files);
    const nextPaths = new Set(nextFiles.map((file) => file.path));
    const existingFiles = await this.listProjectFiles(projectId);

    const pathsToDelete = existingFiles
      .map((file) => file.path)
      .filter((path) => {
        if (normalizedScope.length === 0) {
          return !nextPaths.has(path);
        }

        return (
          (path === normalizedScope ||
            path.startsWith(`${normalizedScope}/`)) &&
          !nextPaths.has(path)
        );
      });

    if (pathsToDelete.length > 0) {
      await this.deleteProjectFiles(projectId, pathsToDelete);
    }

    if (nextFiles.length > 0) {
      await putMany(STORE_PROJECT_FILES as never, nextFiles);
    }
  }
}

type BridgeProjectStoreDeps = {
  getProject: typeof getBridgeProject;
  updateProject: typeof updateBridgeProject;
  listFiles: typeof listBridgeProjectFiles;
  saveFiles: typeof saveBridgeProjectFiles;
  replaceFiles: typeof replaceBridgeProjectFiles;
  deleteFiles: typeof deleteBridgeProjectFiles;
};

const defaultBridgeProjectStoreDeps: BridgeProjectStoreDeps = {
  getProject: getBridgeProject,
  updateProject: updateBridgeProject,
  listFiles: listBridgeProjectFiles,
  saveFiles: saveBridgeProjectFiles,
  replaceFiles: replaceBridgeProjectFiles,
  deleteFiles: deleteBridgeProjectFiles,
};

export class BridgeProjectStore implements ProjectBackingStore {
  constructor(
    private readonly deps: BridgeProjectStoreDeps = defaultBridgeProjectStoreDeps,
  ) {}

  async getOpenProject(): Promise<OpenProjectState | null> {
    const { project } = await this.deps.getProject();
    return project;
  }

  async setOpenProject(project: OpenProjectState | null): Promise<void> {
    if (!project) {
      return;
    }

    await this.deps.updateProject({
      name: project.name,
      defaultSourceRef: project.defaultSourceRef ?? null,
    });
  }

  async listProjects(): Promise<OpenProjectState[]> {
    const project = await this.getOpenProject();
    return project ? [project] : [];
  }

  async listProjectFiles(
    _projectId: string,
  ): Promise<ProjectArtifactTextFile[]> {
    return (await this.deps.listFiles()).files;
  }

  async readProjectFile(
    projectId: string,
    path: string,
  ): Promise<ProjectArtifactTextFile | null> {
    const files = await this.listProjectFiles(projectId);
    return (
      files.find((file) => file.path === normalizeProjectPath(path)) ?? null
    );
  }

  async saveProjectFiles(
    _projectId: string,
    files: ProjectArtifactTextFile[],
  ): Promise<void> {
    await this.deps.saveFiles({ files });
  }

  async deleteProjectFiles(_projectId: string, paths: string[]): Promise<void> {
    await this.deps.deleteFiles({ paths });
  }

  async replaceProjectFiles(
    _projectId: string,
    scopePath: string,
    files: ProjectArtifactTextFile[],
  ): Promise<void> {
    await this.deps.replaceFiles({ scopePath, files });
  }
}

export class ActiveProjectStore implements ProjectBackingStore {
  private readonly browser = new BrowserProjectStore();
  private readonly bridge = new BridgeProjectStore();

  private async activeStore(): Promise<ProjectBackingStore> {
    if (!(await isBridgeProjectStoreAvailable())) {
      return this.browser;
    }

    const bridgeProject = await this.bridge.getOpenProject();
    if (
      bridgeProject &&
      getProjectStoreMode(bridgeProject.id) === "browser-indexeddb"
    ) {
      return this.browser;
    }

    return this.bridge;
  }

  async getOpenProject(): Promise<OpenProjectState | null> {
    return (await this.activeStore()).getOpenProject();
  }

  async setOpenProject(project: OpenProjectState | null): Promise<void> {
    await (await this.activeStore()).setOpenProject(project);
  }

  async listProjects(): Promise<OpenProjectState[]> {
    return (await this.activeStore()).listProjects();
  }

  async listProjectFiles(
    projectId: string,
  ): Promise<ProjectArtifactTextFile[]> {
    return (await this.activeStore()).listProjectFiles(projectId);
  }

  async readProjectFile(
    projectId: string,
    path: string,
  ): Promise<ProjectArtifactTextFile | null> {
    return (await this.activeStore()).readProjectFile(projectId, path);
  }

  async saveProjectFiles(
    projectId: string,
    files: ProjectArtifactTextFile[],
  ): Promise<void> {
    await (await this.activeStore()).saveProjectFiles(projectId, files);
  }

  async deleteProjectFiles(projectId: string, paths: string[]): Promise<void> {
    await (await this.activeStore()).deleteProjectFiles(projectId, paths);
  }

  async replaceProjectFiles(
    projectId: string,
    scopePath: string,
    files: ProjectArtifactTextFile[],
  ): Promise<void> {
    await (await this.activeStore()).replaceProjectFiles(
      projectId,
      scopePath,
      files,
    );
  }
}

type BridgeProjectAvailabilityDeps = {
  getSession: typeof getBridgeSession;
  getCapabilities: typeof getBridgeCapabilities;
};

const defaultBridgeProjectAvailabilityDeps: BridgeProjectAvailabilityDeps = {
  getSession: getBridgeSession,
  getCapabilities: getBridgeCapabilities,
};

export async function isBridgeProjectStoreAvailable(
  deps: BridgeProjectAvailabilityDeps = defaultBridgeProjectAvailabilityDeps,
): Promise<boolean> {
  try {
    const session = await deps.getSession();
    if (!session.isQueryReady) {
      return false;
    }
    const capabilities = await deps.getCapabilities();
    return capabilities.projects === true;
  } catch {
    return false;
  }
}

let defaultProjectStore: ProjectBackingStore | null = null;

export function getProjectStore(): ProjectBackingStore {
  if (!defaultProjectStore) {
    defaultProjectStore = new ActiveProjectStore();
  }

  return defaultProjectStore;
}

export async function getOpenProject(): Promise<OpenProjectState | null> {
  return getProjectStore().getOpenProject();
}

export async function setOpenProject(
  project: OpenProjectState | null,
): Promise<void> {
  await getProjectStore().setOpenProject(project);
}

export async function listProjects(): Promise<OpenProjectState[]> {
  return getProjectStore().listProjects();
}

export async function listOpenProjectFiles(): Promise<
  ProjectArtifactTextFile[]
> {
  const project = await getOpenProject();
  if (!project) {
    return [];
  }

  return getProjectStore().listProjectFiles(project.id);
}

export async function saveOpenProjectFiles(
  files: ProjectArtifactTextFile[],
): Promise<void> {
  const project = await getOpenProject();
  if (!project) {
    return;
  }

  await getProjectStore().saveProjectFiles(project.id, files);
}

export async function deleteOpenProjectFiles(paths: string[]): Promise<void> {
  const project = await getOpenProject();
  if (!project) {
    return;
  }

  await getProjectStore().deleteProjectFiles(project.id, paths);
}

export async function replaceOpenProjectFiles(
  scopePath: string,
  files: ProjectArtifactTextFile[],
): Promise<void> {
  const project = await getOpenProject();
  if (!project) {
    return;
  }

  await getProjectStore().replaceProjectFiles(project.id, scopePath, files);
}
