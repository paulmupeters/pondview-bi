import type { ProjectArtifactTextFile } from "@/lib/project-artifacts/export";

export const GITHUB_PROJECT_CONFIG_STORAGE_KEY =
  "pondview.project.githubSync.v1";

export type GitHubProjectConfig = {
  owner: string;
  repo: string;
  branch: string;
  pathPrefix: string;
  token: string;
};

export type GitHubProjectUploadResult = {
  uploaded: number;
  branch: string;
  pathPrefix: string;
};

export type GitHubProjectImportSource = {
  owner: string;
  repo: string;
  branch?: string;
  pathPrefix?: string;
  token?: string;
};

export type GitHubProjectImportResult = {
  files: ProjectArtifactTextFile[];
  branch: string;
  pathPrefix: string;
  truncated: boolean;
};

export const EMPTY_GITHUB_PROJECT_CONFIG: GitHubProjectConfig = {
  owner: "",
  repo: "",
  branch: "main",
  pathPrefix: "",
  token: "",
};

type GitHubContentResponse = {
  sha?: unknown;
};

type GitHubProjectSyncFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const isClient = typeof window !== "undefined";

export function parseGitHubProjectConfigPayload(
  payload: unknown,
): GitHubProjectConfig {
  if (!payload || typeof payload !== "object") {
    return { ...EMPTY_GITHUB_PROJECT_CONFIG };
  }

  const candidate = payload as Record<string, unknown>;
  return normalizeGitHubProjectConfig({
    owner: toTrimmedString(candidate.owner),
    repo: toTrimmedString(candidate.repo),
    branch: toTrimmedString(candidate.branch) || "main",
    pathPrefix: toTrimmedString(candidate.pathPrefix),
    token: toTrimmedString(candidate.token),
  });
}

export function readGitHubProjectConfigFromStorage(): GitHubProjectConfig {
  if (!isClient) {
    return { ...EMPTY_GITHUB_PROJECT_CONFIG };
  }

  const raw = window.localStorage.getItem(GITHUB_PROJECT_CONFIG_STORAGE_KEY);
  if (!raw?.trim()) {
    return { ...EMPTY_GITHUB_PROJECT_CONFIG };
  }

  try {
    return parseGitHubProjectConfigPayload(JSON.parse(raw));
  } catch (error) {
    console.error("[githubProjectSync] Failed to parse config", error);
    return { ...EMPTY_GITHUB_PROJECT_CONFIG };
  }
}

export function saveGitHubProjectConfigToStorage(
  config: GitHubProjectConfig,
): void {
  if (!isClient) {
    return;
  }

  window.localStorage.setItem(
    GITHUB_PROJECT_CONFIG_STORAGE_KEY,
    JSON.stringify(normalizeGitHubProjectConfig(config)),
  );
}

export function clearGitHubProjectConfigInStorage(): void {
  if (!isClient) {
    return;
  }

  window.localStorage.removeItem(GITHUB_PROJECT_CONFIG_STORAGE_KEY);
}

export function isGitHubProjectConfigComplete(
  config: GitHubProjectConfig,
): boolean {
  return Boolean(config.owner && config.repo && config.branch && config.token);
}

export async function uploadProjectArtifactsToGitHub(
  config: GitHubProjectConfig,
  files: ProjectArtifactTextFile[],
  options?: {
    message?: string;
    fetchImpl?: GitHubProjectSyncFetch;
  },
): Promise<GitHubProjectUploadResult> {
  const normalizedConfig = normalizeGitHubProjectConfig(config);
  if (!isGitHubProjectConfigComplete(normalizedConfig)) {
    throw new Error(
      "GitHub owner, repository, branch, and token are required.",
    );
  }

  const normalizedFiles = normalizeGitHubProjectFiles(
    files,
    normalizedConfig.pathPrefix,
  );
  if (normalizedFiles.length === 0) {
    throw new Error("There are no project artifact files to upload.");
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const message = options?.message ?? "Update Pondview project artifacts";

  for (const file of normalizedFiles) {
    const existingSha = await readGitHubContentSha({
      config: normalizedConfig,
      path: file.path,
      fetchImpl,
    });

    await putGitHubContent({
      config: normalizedConfig,
      path: file.path,
      content: file.content,
      message,
      sha: existingSha,
      fetchImpl,
    });
  }

  return {
    uploaded: normalizedFiles.length,
    branch: normalizedConfig.branch,
    pathPrefix: normalizedConfig.pathPrefix,
  };
}

function normalizeGitHubProjectFiles(
  files: ProjectArtifactTextFile[],
  pathPrefix: string,
): ProjectArtifactTextFile[] {
  const prefix = normalizePathPrefix(pathPrefix);
  return files
    .map((file) => ({
      path: joinGitHubPath(prefix, normalizeGitHubPath(file.path)),
      content: file.content,
    }))
    .filter((file) => file.path && file.content !== undefined)
    .sort((left, right) => left.path.localeCompare(right.path));
}

async function readGitHubContentSha(input: {
  config: GitHubProjectConfig;
  path: string;
  fetchImpl: GitHubProjectSyncFetch;
}): Promise<string | undefined> {
  const response = await input.fetchImpl(
    createGitHubContentUrl(input.config, input.path, { includeRef: true }),
    {
      method: "GET",
      headers: createGitHubHeaders(input.config.token),
    },
  );

  if (response.status === 404) {
    return undefined;
  }

  await assertGitHubResponseOk(response, `read ${input.path}`);
  const payload = (await response.json()) as GitHubContentResponse;
  return typeof payload.sha === "string" ? payload.sha : undefined;
}

async function putGitHubContent(input: {
  config: GitHubProjectConfig;
  path: string;
  content: string;
  message: string;
  sha?: string;
  fetchImpl: GitHubProjectSyncFetch;
}): Promise<void> {
  const response = await input.fetchImpl(
    createGitHubContentUrl(input.config, input.path),
    {
      method: "PUT",
      headers: createGitHubHeaders(input.config.token),
      body: JSON.stringify({
        message: input.message,
        content: encodeBase64Utf8(input.content),
        branch: input.config.branch,
        ...(input.sha ? { sha: input.sha } : {}),
      }),
    },
  );

  await assertGitHubResponseOk(response, `upload ${input.path}`);
}

async function assertGitHubResponseOk(
  response: Response,
  action: string,
): Promise<void> {
  if (response.ok) {
    return;
  }

  let detail = response.statusText;
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === "string" && payload.message.trim()) {
      detail = payload.message;
    }
  } catch {
    // Keep the status text when GitHub does not return a JSON error payload.
  }

  throw new Error(`GitHub ${action} failed (${response.status}): ${detail}`);
}

function createGitHubContentUrl(
  config: GitHubProjectConfig,
  path: string,
  options?: { includeRef?: boolean },
): string {
  const owner = encodeURIComponent(config.owner);
  const repo = encodeURIComponent(config.repo);
  const encodedPath = normalizeGitHubPath(path)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
  if (!options?.includeRef) {
    return url;
  }

  return `${url}?ref=${encodeURIComponent(config.branch)}`;
}

function createGitHubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function createGitHubReadHeaders(token: string | undefined): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

const PONDVIEW_ARTIFACT_ROOT = "pondview";

type GitHubRepoMetadata = {
  default_branch?: unknown;
};

type GitHubGitTreeEntry = {
  path?: unknown;
  type?: unknown;
  sha?: unknown;
};

type GitHubGitTreeResponse = {
  tree?: unknown;
  truncated?: unknown;
};

type GitHubBlobResponse = {
  content?: unknown;
  encoding?: unknown;
};

export function parseGitHubProjectUrl(
  input: string,
): GitHubProjectImportSource | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (!owner || !repo) {
    return null;
  }

  const source: GitHubProjectImportSource = { owner, repo };

  if (
    segments.length >= 4 &&
    (segments[2] === "tree" || segments[2] === "blob")
  ) {
    source.branch = decodeURIComponent(segments[3]);
    if (segments.length > 4) {
      source.pathPrefix = segments
        .slice(4)
        .map((part) => decodeURIComponent(part))
        .join("/");
    }
  }

  return source;
}

export async function fetchProjectArtifactsFromGitHub(
  source: GitHubProjectImportSource,
  options?: { fetchImpl?: GitHubProjectSyncFetch },
): Promise<GitHubProjectImportResult> {
  const owner = source.owner.trim();
  const repo = source.repo.trim().replace(/\.git$/i, "");
  if (!owner || !repo) {
    throw new Error("GitHub owner and repository are required.");
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const token = source.token?.trim() || undefined;
  const pathPrefix = normalizePathPrefix(source.pathPrefix ?? "");

  const branch =
    source.branch?.trim() ||
    (await fetchDefaultBranch({ owner, repo, fetchImpl, token }));

  const tree = await fetchGitTree({
    owner,
    repo,
    ref: branch,
    fetchImpl,
    token,
  });

  const artifactPrefix = pathPrefix
    ? `${pathPrefix}/${PONDVIEW_ARTIFACT_ROOT}/`
    : `${PONDVIEW_ARTIFACT_ROOT}/`;

  const blobs: { path: string; sha: string }[] = [];
  for (const entry of tree.entries) {
    if (entry.type !== "blob") {
      continue;
    }
    if (!entry.path.startsWith(artifactPrefix)) {
      continue;
    }
    blobs.push({ path: entry.path, sha: entry.sha });
  }

  if (blobs.length === 0) {
    throw new Error(
      `No Pondview project artifacts found at ${artifactPrefix} on branch ${branch}.`,
    );
  }

  blobs.sort((left, right) => left.path.localeCompare(right.path));

  const files: ProjectArtifactTextFile[] = [];
  for (const blob of blobs) {
    const content = await fetchGitBlobText({
      owner,
      repo,
      sha: blob.sha,
      fetchImpl,
      token,
    });
    const relativePath = pathPrefix
      ? blob.path.slice(pathPrefix.length + 1)
      : blob.path;
    files.push({ path: relativePath, content });
  }

  return {
    files,
    branch,
    pathPrefix,
    truncated: tree.truncated,
  };
}

async function fetchDefaultBranch(input: {
  owner: string;
  repo: string;
  fetchImpl: GitHubProjectSyncFetch;
  token: string | undefined;
}): Promise<string> {
  const response = await input.fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(
      input.owner,
    )}/${encodeURIComponent(input.repo)}`,
    {
      method: "GET",
      headers: createGitHubReadHeaders(input.token),
    },
  );
  await assertGitHubResponseOk(response, `read repository metadata`);
  const payload = (await response.json()) as GitHubRepoMetadata;
  if (typeof payload.default_branch !== "string" || !payload.default_branch) {
    throw new Error(
      `GitHub repository ${input.owner}/${input.repo} has no default branch.`,
    );
  }
  return payload.default_branch;
}

async function fetchGitTree(input: {
  owner: string;
  repo: string;
  ref: string;
  fetchImpl: GitHubProjectSyncFetch;
  token: string | undefined;
}): Promise<{
  entries: { path: string; type: string; sha: string }[];
  truncated: boolean;
}> {
  const response = await input.fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(
      input.owner,
    )}/${encodeURIComponent(input.repo)}/git/trees/${encodeURIComponent(
      input.ref,
    )}?recursive=1`,
    {
      method: "GET",
      headers: createGitHubReadHeaders(input.token),
    },
  );
  await assertGitHubResponseOk(response, `read tree ${input.ref}`);
  const payload = (await response.json()) as GitHubGitTreeResponse;
  const rawEntries = Array.isArray(payload.tree) ? payload.tree : [];
  const entries: { path: string; type: string; sha: string }[] = [];

  for (const candidate of rawEntries as GitHubGitTreeEntry[]) {
    if (
      typeof candidate.path === "string" &&
      typeof candidate.type === "string" &&
      typeof candidate.sha === "string"
    ) {
      entries.push({
        path: candidate.path,
        type: candidate.type,
        sha: candidate.sha,
      });
    }
  }

  return {
    entries,
    truncated: payload.truncated === true,
  };
}

async function fetchGitBlobText(input: {
  owner: string;
  repo: string;
  sha: string;
  fetchImpl: GitHubProjectSyncFetch;
  token: string | undefined;
}): Promise<string> {
  const response = await input.fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(
      input.owner,
    )}/${encodeURIComponent(input.repo)}/git/blobs/${encodeURIComponent(
      input.sha,
    )}`,
    {
      method: "GET",
      headers: createGitHubReadHeaders(input.token),
    },
  );
  await assertGitHubResponseOk(response, `read blob ${input.sha}`);
  const payload = (await response.json()) as GitHubBlobResponse;
  if (typeof payload.content !== "string") {
    throw new Error(`GitHub blob ${input.sha} returned no content.`);
  }
  if (payload.encoding !== "base64") {
    throw new Error(
      `GitHub blob ${input.sha} returned unsupported encoding ${String(payload.encoding)}.`,
    );
  }
  return decodeBase64Utf8(payload.content);
}

function decodeBase64Utf8(value: string): string {
  const sanitized = value.replace(/\s+/g, "");
  const binary = atob(sanitized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function normalizeGitHubProjectConfig(
  config: GitHubProjectConfig,
): GitHubProjectConfig {
  return {
    owner: config.owner.trim(),
    repo: config.repo.trim().replace(/\.git$/i, ""),
    branch: config.branch.trim() || "main",
    pathPrefix: normalizePathPrefix(config.pathPrefix),
    token: config.token.trim(),
  };
}

function normalizePathPrefix(pathPrefix: string): string {
  return normalizeGitHubPath(pathPrefix).replace(/\/+$/, "");
}

function normalizeGitHubPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");
}

function joinGitHubPath(prefix: string, path: string): string {
  if (!prefix) {
    return path;
  }
  return `${prefix}/${path}`;
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
