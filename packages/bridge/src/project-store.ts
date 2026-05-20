import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";
import type {
  BridgeProject,
  BridgeProjectTextFile,
  BridgeProjectUpdateRequest,
} from "@pondview/bridge-protocol";

const PROJECT_METADATA_PATH = ".pondview/project.json";
const PROJECT_ARTIFACT_ROOT = "pondview";
const LOCAL_SOURCE_BINDINGS_PATH = "pondview.sources.local.json";

type BridgeProjectMetadataFile = {
  schemaVersion: 1;
  project: BridgeProject;
};

export interface BridgeProjectStoreOptions {
  rootPath?: string;
  readonly?: boolean;
}

export class BridgeProjectStore {
  readonly rootPath: string;
  private readonly readonly: boolean;

  constructor(options: BridgeProjectStoreOptions = {}) {
    this.rootPath = resolve(
      options.rootPath?.trim() || process.env.INIT_CWD || process.cwd(),
    );
    this.readonly = options.readonly ?? false;
    if (!existsSync(this.rootPath) && !this.readonly) {
      mkdirSync(this.rootPath, { recursive: true });
    }
  }

  getProject(): BridgeProject {
    return this.readMetadata() ?? this.createDefaultProject();
  }

  async updateProject(
    input: BridgeProjectUpdateRequest,
  ): Promise<BridgeProject> {
    this.assertWritable();
    const previous = this.getProject();
    const project: BridgeProject = {
      ...previous,
      name: input.name?.trim() || previous.name,
      defaultSourceRef:
        input.defaultSourceRef === undefined
          ? (previous.defaultSourceRef ?? null)
          : input.defaultSourceRef,
      updatedAt: Date.now(),
    };
    await this.writeMetadata(project);
    return project;
  }

  listFiles(): BridgeProjectTextFile[] {
    if (!existsSync(this.rootPath)) {
      return [];
    }

    const artifactRootPath = this.resolveProjectPath(PROJECT_ARTIFACT_ROOT);
    const files = [
      ...(existsSync(artifactRootPath)
        ? this.listFilesInDirectory(artifactRootPath)
        : []),
      ...(existsSync(this.resolveProjectPath(LOCAL_SOURCE_BINDINGS_PATH))
        ? [LOCAL_SOURCE_BINDINGS_PATH]
        : []),
    ];

    return files
      .filter((path) => isProjectArtifactFilePath(path))
      .sort((left, right) => left.localeCompare(right))
      .map((path) => ({
        path,
        content: readFileSync(this.resolveProjectPath(path), "utf8"),
      }));
  }

  async saveFiles(
    files: BridgeProjectTextFile[],
  ): Promise<BridgeProjectTextFile[]> {
    this.assertWritable();
    for (const file of normalizeProjectFiles(files)) {
      await this.writeTextFile(file.path, file.content);
    }
    await this.touchMetadata();
    return this.listFiles();
  }

  async deleteFiles(paths: string[]): Promise<BridgeProjectTextFile[]> {
    this.assertWritable();
    for (const path of paths) {
      const normalizedPath = normalizeProjectPath(path);
      if (!isProjectArtifactFilePath(normalizedPath)) {
        throw new Error(
          `Project file path "${normalizedPath}" is not allowed.`,
        );
      }
      await rm(this.resolveProjectPath(normalizedPath), { force: true });
    }
    await this.touchMetadata();
    return this.listFiles();
  }

  async replaceFiles(
    scopePath: string | undefined,
    files: BridgeProjectTextFile[],
  ): Promise<BridgeProjectTextFile[]> {
    this.assertWritable();
    const normalizedScope = normalizeScopePath(scopePath ?? "");
    const nextFiles = normalizeProjectFiles(files);
    const nextPaths = new Set(nextFiles.map((file) => file.path));
    const pathsToDelete = this.listFiles()
      .map((file) => file.path)
      .filter((path) => {
        if (!isWithinScope(path, normalizedScope)) {
          return false;
        }
        return !nextPaths.has(path);
      });

    for (const path of pathsToDelete) {
      await rm(this.resolveProjectPath(path), { force: true });
    }

    for (const file of nextFiles) {
      await this.writeTextFile(file.path, file.content);
    }

    await this.touchMetadata();
    return this.listFiles();
  }

  private createDefaultProject(): BridgeProject {
    const now = Date.now();
    const artifactManifest = this.readProjectArtifactManifest();
    return {
      id: `bridge-project-${createProjectRootId(this.rootPath)}`,
      name:
        artifactManifest?.name ??
        (basename(this.rootPath) || "Pondview Project"),
      backingKind: "bridge-filesystem",
      openedAt: now,
      updatedAt: now,
      defaultSourceRef: artifactManifest?.defaultSourceRef ?? null,
      rootPath: this.rootPath,
    };
  }

  private readProjectArtifactManifest(): {
    name?: string;
    defaultSourceRef?: string;
  } | null {
    const manifestPath = this.resolveProjectPath("pondview/project.json");
    if (!existsSync(manifestPath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        name?: unknown;
        defaultSourceRef?: unknown;
      };
      return {
        name: typeof parsed.name === "string" ? parsed.name : undefined,
        defaultSourceRef:
          typeof parsed.defaultSourceRef === "string"
            ? parsed.defaultSourceRef
            : undefined,
      };
    } catch {
      return null;
    }
  }

  private readMetadata(): BridgeProject | null {
    const metadataPath = this.resolveProjectPath(PROJECT_METADATA_PATH);
    if (!existsSync(metadataPath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        readFileSync(metadataPath, "utf8"),
      ) as Partial<BridgeProjectMetadataFile>;
      const project = parsed.project;
      if (
        parsed.schemaVersion !== 1 ||
        !project ||
        project.backingKind !== "bridge-filesystem" ||
        typeof project.id !== "string" ||
        typeof project.name !== "string"
      ) {
        return null;
      }

      return {
        id: project.id,
        name: project.name,
        backingKind: "bridge-filesystem",
        openedAt:
          typeof project.openedAt === "number" ? project.openedAt : Date.now(),
        updatedAt:
          typeof project.updatedAt === "number"
            ? project.updatedAt
            : Date.now(),
        defaultSourceRef:
          typeof project.defaultSourceRef === "string"
            ? project.defaultSourceRef
            : null,
        rootPath: this.rootPath,
      };
    } catch {
      return null;
    }
  }

  private async writeMetadata(project: BridgeProject): Promise<void> {
    await this.writeTextFile(
      PROJECT_METADATA_PATH,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          project: {
            ...project,
            rootPath: this.rootPath,
          },
        } satisfies BridgeProjectMetadataFile,
        null,
        2,
      )}\n`,
    );
  }

  private async touchMetadata(): Promise<void> {
    const previous = this.getProject();
    await this.writeMetadata({
      ...previous,
      updatedAt: Date.now(),
    });
  }

  private listFilesInDirectory(directory: string): string[] {
    const entries = readdirSync(directory, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      const relativePath = normalizeProjectPath(
        relative(this.rootPath, absolutePath),
      );
      if (entry.isDirectory()) {
        files.push(...this.listFilesInDirectory(absolutePath));
        continue;
      }

      if (entry.isFile() && statSync(absolutePath).isFile()) {
        files.push(relativePath);
      }
    }

    return files;
  }

  private async writeTextFile(path: string, content: string): Promise<void> {
    const normalizedPath = normalizeProjectPath(path);
    const targetPath = this.resolveProjectPath(normalizedPath);
    await mkdir(dirname(targetPath), { recursive: true });
    const tempPath = resolve(
      dirname(targetPath),
      `.${basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
    );

    try {
      await writeFile(tempPath, content, "utf8");
      await rename(tempPath, targetPath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  private resolveProjectPath(path: string): string {
    const normalizedPath = normalizeProjectPath(path);
    const targetPath = resolve(this.rootPath, normalizedPath);
    if (!isPathInsideRoot(this.rootPath, targetPath)) {
      throw new Error(`Project file path "${path}" escapes the project root.`);
    }
    return targetPath;
  }

  private assertWritable(): void {
    if (this.readonly) {
      throw new Error("Readonly bridge mode cannot mutate project files.");
    }
  }
}

function normalizeProjectFiles(
  files: BridgeProjectTextFile[],
): BridgeProjectTextFile[] {
  const deduped = new Map<string, BridgeProjectTextFile>();
  for (const file of files) {
    const path = normalizeProjectPath(file.path);
    if (!isProjectArtifactFilePath(path)) {
      throw new Error(`Project file path "${path}" is not allowed.`);
    }
    deduped.set(path, { path, content: file.content });
  }
  return Array.from(deduped.values()).sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function normalizeScopePath(path: string): string {
  const normalizedPath = path.trim() ? normalizeProjectPath(path) : "";
  if (normalizedPath && !isProjectArtifactScopePath(normalizedPath)) {
    throw new Error(`Project scope path "${normalizedPath}" is not allowed.`);
  }
  return normalizedPath.replace(/\/+$/, "");
}

function normalizeProjectPath(path: string): string {
  const trimmed = path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
  if (
    !trimmed ||
    trimmed.includes("\0") ||
    isAbsolute(trimmed) ||
    win32.isAbsolute(trimmed) ||
    /^[a-zA-Z]:/.test(trimmed)
  ) {
    throw new Error(`Invalid project file path "${path}".`);
  }

  const segments = trimmed.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Project file path "${path}" cannot contain traversal.`);
  }

  return segments.join("/");
}

function isProjectArtifactFilePath(path: string): boolean {
  return (
    path === LOCAL_SOURCE_BINDINGS_PATH ||
    path.startsWith(`${PROJECT_ARTIFACT_ROOT}/`)
  );
}

function isProjectArtifactScopePath(path: string): boolean {
  return (
    path === LOCAL_SOURCE_BINDINGS_PATH ||
    path === PROJECT_ARTIFACT_ROOT ||
    path.startsWith(`${PROJECT_ARTIFACT_ROOT}/`)
  );
}

function isWithinScope(path: string, scopePath: string): boolean {
  if (!scopePath) {
    return true;
  }
  return path === scopePath || path.startsWith(`${scopePath}/`);
}

function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !relativePath.startsWith(`..${sep}`))
  );
}

function createProjectRootId(rootPath: string): string {
  return createHash("sha256").update(rootPath).digest("hex").slice(0, 16);
}
