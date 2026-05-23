import {
  type BridgeCapabilitiesResponse,
  type BridgeProjectDatabasePathPickResponse,
  type BridgeProjectDeleteFilesRequest,
  type BridgeProjectFilesResponse,
  type BridgeProjectInitRequest,
  type BridgeProjectReplaceFilesRequest,
  type BridgeProjectResponse,
  type BridgeProjectSaveFilesRequest,
  type BridgeProjectUpdateRequest,
  type BridgeSecretAi,
  type BridgeSecretS3Backup,
  type BridgeSecretSource,
  type BridgeSecretsStatusResponse,
  type BridgeSourcesResponse,
  bridgeCapabilitiesResponseSchema,
  bridgeConfigResponseSchema,
  bridgeProjectDatabasePathPickResponseSchema,
  bridgeProjectFilesResponseSchema,
  bridgeProjectResponseSchema,
  bridgeQueryResponseSchema,
  bridgeS3BackupDownloadResponseSchema,
  bridgeS3BackupListResponseSchema,
  bridgeS3BackupTestResponseSchema,
  bridgeS3BackupUploadResponseSchema,
  bridgeSecretMutationResponseSchema,
  bridgeSecretsStatusResponseSchema,
  bridgeSourcesResponseSchema,
} from "@pondview/bridge-protocol";

export interface PondviewBridgeDatabaseInfo {
  mode: "memory" | "file";
  id: string;
  name?: string;
}

export interface PondviewBridgeConfig {
  host: string;
  port: number;
  requiresAuth: boolean;
  database?: PondviewBridgeDatabaseInfo;
}

export interface PondviewBridgeSession {
  host: string;
  port: number;
  requiresAuth: boolean;
  database?: PondviewBridgeDatabaseInfo;
  secret?: string;
  hasSecret: boolean;
  isQueryReady: boolean;
}

export interface PondviewJsonCompactResponse {
  meta: Array<{ name: string; type: string }>;
  data: unknown[][];
  rows: number;
  statistics?: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

export interface BridgeQueryResult {
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
  durationMs: number;
}

const BRIDGE_SESSION_SECRET_KEY = "bi.bridge.session-secret";
const BRIDGE_ENDPOINT_KEY = "bi.bridge.endpoint";
const BRIDGE_CONFIG_EVENT = "bi:bridge-config-change";
const BRIDGE_SESSION_SECRET_EVENT = "bi:bridge-session-secret-change";

let cachedBridgeConfig: PondviewBridgeConfig | null = null;

function nowMs(): number {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  return Date.now();
}

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.sessionStorage !== "undefined"
  );
}

function notifyBridgeConfigChange(): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(BRIDGE_CONFIG_EVENT));
}

function notifyBridgeSessionSecretChange(): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(BRIDGE_SESSION_SECRET_EVENT));
}

function getSessionSecret(): string | undefined {
  if (!isBrowser()) {
    return undefined;
  }

  const value = window.sessionStorage.getItem(BRIDGE_SESSION_SECRET_KEY);
  return value?.trim().length ? value : undefined;
}

function getAuthHeaders(): Record<string, string> {
  const sessionSecret = getSessionSecret();
  if (!sessionSecret) {
    return {};
  }

  return {
    Authorization: `Bearer ${sessionSecret}`,
  };
}

export function getBridgeAuthHeaders(): Record<string, string> {
  return getAuthHeaders();
}

function normalizeBridgeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

function getBridgeEndpointFromStorage(): string | null {
  if (!isBrowser() || typeof window.localStorage === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(BRIDGE_ENDPOINT_KEY);
  const endpoint = value ? normalizeBridgeEndpoint(value) : "";
  return endpoint.length ? endpoint : null;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

export function getBridgeRequestBaseUrl(): string {
  if (
    isBrowser() &&
    !import.meta.env.DEV &&
    typeof window.location !== "undefined" &&
    isLoopbackHost(window.location.hostname)
  ) {
    return "";
  }

  return getBridgeEndpointFromStorage() ?? "";
}

function bridgeUrl(pathname: string): string {
  const endpoint = getBridgeRequestBaseUrl();
  return endpoint ? `${endpoint}${pathname}` : pathname;
}

function toRowObjects(payload: PondviewJsonCompactResponse): {
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
} {
  const columns = payload.meta.map((column) => ({
    name: column.name,
    type: column.type,
  }));

  const rows = payload.data.map((rowData) => {
    const row: Record<string, unknown> = {};
    for (let index = 0; index < payload.meta.length; index += 1) {
      const key = payload.meta[index]?.name;
      if (key) {
        row[key] = rowData[index];
      }
    }
    return row;
  });

  return { rows, columns };
}

function parseQueryPayload(payload: unknown): {
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
} {
  const parsed = bridgeQueryResponseSchema.safeParse(payload);
  if (parsed.success) {
    return {
      rows: parsed.data.rows,
      columns: parsed.data.columns,
    };
  }

  if (isCompactQueryResponse(payload)) {
    return toRowObjects(payload);
  }

  throw new Error("Bridge query response is invalid.");
}

function isCompactQueryResponse(
  payload: unknown,
): payload is PondviewJsonCompactResponse {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<PondviewJsonCompactResponse>;
  return (
    Array.isArray(candidate.meta) &&
    Array.isArray(candidate.data) &&
    typeof candidate.rows === "number"
  );
}

async function parseError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
    if (
      typeof payload.error === "object" &&
      typeof payload.error.message === "string" &&
      payload.error.message.trim()
    ) {
      return payload.error.message;
    }
    if (payload.message?.trim()) {
      return payload.message;
    }
  }

  const text = await response.text().catch(() => "");
  if (text.trim()) {
    return text.trim();
  }

  return `HTTP ${response.status} ${response.statusText}`;
}

export function setSessionSecret(secret: string): void {
  const trimmed = secret.trim();
  const nextSecret = trimmed.length > 0 ? trimmed : undefined;
  const previousSecret = getSessionSecret();

  if (!isBrowser()) {
    return;
  }

  if (nextSecret) {
    window.sessionStorage.setItem(BRIDGE_SESSION_SECRET_KEY, nextSecret);
  } else {
    window.sessionStorage.removeItem(BRIDGE_SESSION_SECRET_KEY);
  }

  if (previousSecret !== nextSecret) {
    notifyBridgeSessionSecretChange();
  }
}

export function clearSessionSecret(): void {
  const previousSecret = getSessionSecret();
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.removeItem(BRIDGE_SESSION_SECRET_KEY);
  if (previousSecret !== undefined) {
    notifyBridgeSessionSecretChange();
  }
}

export function getBridgeEndpoint(): string {
  return getBridgeEndpointFromStorage() ?? "";
}

export function setBridgeEndpoint(endpoint: string): void {
  if (!isBrowser() || typeof window.localStorage === "undefined") {
    return;
  }

  const previousEndpoint = getBridgeEndpointFromStorage();
  const nextEndpoint = normalizeBridgeEndpoint(endpoint);

  if (nextEndpoint.length) {
    window.localStorage.setItem(BRIDGE_ENDPOINT_KEY, nextEndpoint);
  } else {
    window.localStorage.removeItem(BRIDGE_ENDPOINT_KEY);
  }

  if (previousEndpoint !== (nextEndpoint || null)) {
    clearBridgeConfigCache();
    notifyBridgeConfigChange();
  }
}

export function clearBridgeEndpoint(): void {
  setBridgeEndpoint("");
}

export function hasSessionSecret(): boolean {
  return Boolean(getSessionSecret());
}

function parseBridgeConfig(payload: unknown): PondviewBridgeConfig | null {
  const parsed = bridgeConfigResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  return {
    host: parsed.data.host,
    port: parsed.data.port,
    requiresAuth: parsed.data.requires_auth,
    database: parsed.data.database,
  };
}

function bridgeConfigChanged(
  previousConfig: PondviewBridgeConfig | null,
  nextConfig: PondviewBridgeConfig | null,
): boolean {
  return (
    previousConfig?.host !== nextConfig?.host ||
    previousConfig?.port !== nextConfig?.port ||
    previousConfig?.requiresAuth !== nextConfig?.requiresAuth ||
    previousConfig?.database?.mode !== nextConfig?.database?.mode ||
    previousConfig?.database?.id !== nextConfig?.database?.id ||
    previousConfig?.database?.name !== nextConfig?.database?.name
  );
}

export function getBridgeConfigFromCache(): PondviewBridgeConfig | null {
  return cachedBridgeConfig;
}

export function clearBridgeConfigCache(): void {
  const previousConfig = cachedBridgeConfig;
  cachedBridgeConfig = null;

  if (bridgeConfigChanged(previousConfig, cachedBridgeConfig)) {
    notifyBridgeConfigChange();
  }
}

export async function refreshBridgeConfig(
  signal?: AbortSignal,
): Promise<PondviewBridgeConfig> {
  const response = await fetch(bridgeUrl("/api/duckdb/config"), {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const nextConfig = parseBridgeConfig(payload);
  if (!nextConfig) {
    throw new Error("Bridge config response is invalid.");
  }

  const previousConfig = cachedBridgeConfig;
  cachedBridgeConfig = nextConfig;
  if (bridgeConfigChanged(previousConfig, cachedBridgeConfig)) {
    notifyBridgeConfigChange();
  }

  return nextConfig;
}

export function subscribeBridgeConfig(listener: () => void): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  window.addEventListener(BRIDGE_CONFIG_EVENT, listener);
  return () => {
    window.removeEventListener(BRIDGE_CONFIG_EVENT, listener);
  };
}

export function subscribeBridgeSessionSecret(listener: () => void): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  window.addEventListener(BRIDGE_SESSION_SECRET_EVENT, listener);
  return () => {
    window.removeEventListener(BRIDGE_SESSION_SECRET_EVENT, listener);
  };
}

export async function getBridgeConfig(): Promise<PondviewBridgeConfig> {
  if (cachedBridgeConfig) {
    return cachedBridgeConfig;
  }

  if (!isBrowser()) {
    throw new Error("Bridge config is unavailable outside the browser.");
  }

  return refreshBridgeConfig();
}

export async function getBridgeSession(): Promise<PondviewBridgeSession> {
  const config = cachedBridgeConfig ?? (await getBridgeConfig());
  const secret = getSessionSecret();
  const hasSecret = Boolean(secret);
  return {
    host: config.host,
    port: config.port,
    requiresAuth: config.requiresAuth,
    database: config.database,
    secret,
    hasSecret,
    isQueryReady: !config.requiresAuth || hasSecret,
  };
}

export async function pingBridge(signal?: AbortSignal): Promise<boolean> {
  const response = await fetch(bridgeUrl("/ping"), {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    return false;
  }

  const payload = (await response.json().catch(() => ({}))) as {
    status?: string;
  };
  return payload.status === "ok";
}

export async function runBridgeQuery(
  sql: string,
  signal?: AbortSignal,
): Promise<BridgeQueryResult> {
  const trimmedSql = sql.trim();
  if (!trimmedSql) {
    throw new Error("SQL query is required");
  }

  const startedAt = nowMs();

  const response = await fetch(bridgeUrl("/query"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ sql: trimmedSql }),
    signal,
  });

  if (!response.ok) {
    const message = await parseError(response);
    if (response.status === 401) {
      throw new Error(
        `Bridge authentication failed (401). Update your Pondview session secret in Settings. ${message}`,
      );
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as unknown;
  const converted = parseQueryPayload(payload);
  const durationMs = Math.max(0, Math.round(nowMs() - startedAt));

  return {
    rows: converted.rows,
    columns: converted.columns,
    durationMs,
  };
}

export async function cancelBridgeQuery(signal?: AbortSignal): Promise<{
  status: string;
  cancelled: boolean;
}> {
  const response = await fetch(bridgeUrl("/cancel"), {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json()) as {
    status?: string;
    cancelled?: boolean;
  };

  return {
    status: payload.status ?? "unknown",
    cancelled: payload.cancelled ?? false,
  };
}

export async function getBridgeSecretsStatus(
  signal?: AbortSignal,
): Promise<BridgeSecretsStatusResponse> {
  const response = await fetch(bridgeUrl("/secrets/status"), {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return bridgeSecretsStatusResponseSchema.parse(await response.json());
}

export async function getBridgeCapabilities(
  signal?: AbortSignal,
): Promise<BridgeCapabilitiesResponse> {
  const response = await fetch(bridgeUrl("/capabilities"), {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return bridgeCapabilitiesResponseSchema.parse(await response.json());
}

export async function getBridgeProject(
  signal?: AbortSignal,
): Promise<BridgeProjectResponse> {
  const response = await fetch(bridgeUrl("/project"), {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return bridgeProjectResponseSchema.parse(await response.json());
}

export async function updateBridgeProject(
  input: BridgeProjectUpdateRequest,
  signal?: AbortSignal,
): Promise<BridgeProjectResponse> {
  const response = await fetch(bridgeUrl("/project"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return bridgeProjectResponseSchema.parse(await response.json());
}

export async function listBridgeProjectFiles(
  signal?: AbortSignal,
): Promise<BridgeProjectFilesResponse> {
  const response = await fetch(bridgeUrl("/project/files"), {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return bridgeProjectFilesResponseSchema.parse(await response.json());
}

export async function saveBridgeProjectFiles(
  input: BridgeProjectSaveFilesRequest,
  signal?: AbortSignal,
): Promise<BridgeProjectFilesResponse> {
  return mutateBridgeProjectFiles("PUT", "/project/files", input, signal);
}

export async function initializeBridgeProject(
  input: BridgeProjectInitRequest,
  signal?: AbortSignal,
): Promise<BridgeProjectFilesResponse> {
  return mutateBridgeProjectFiles("POST", "/project/init", input, signal);
}

export async function pickBridgeProjectDatabasePath(
  signal?: AbortSignal,
): Promise<BridgeProjectDatabasePathPickResponse> {
  const response = await fetch(bridgeUrl("/project/database-path/pick"), {
    method: "POST",
    headers: getAuthHeaders(),
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return bridgeProjectDatabasePathPickResponseSchema.parse(
    await response.json(),
  );
}

export async function replaceBridgeProjectFiles(
  input: BridgeProjectReplaceFilesRequest,
  signal?: AbortSignal,
): Promise<BridgeProjectFilesResponse> {
  return mutateBridgeProjectFiles(
    "POST",
    "/project/files/replace",
    input,
    signal,
  );
}

export async function deleteBridgeProjectFiles(
  input: BridgeProjectDeleteFilesRequest,
  signal?: AbortSignal,
): Promise<BridgeProjectFilesResponse> {
  return mutateBridgeProjectFiles("DELETE", "/project/files", input, signal);
}

export async function listBridgeSources(
  signal?: AbortSignal,
): Promise<BridgeSourcesResponse> {
  const response = await fetch(bridgeUrl("/sources"), {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return bridgeSourcesResponseSchema.parse(await response.json());
}

export async function saveBridgeSourceSecret(
  id: string,
  source: BridgeSecretSource,
  signal?: AbortSignal,
): Promise<void> {
  await mutateBridgeSecret(
    `/secrets/source/${encodeURIComponent(id)}`,
    source,
    signal,
  );
}

export async function deleteBridgeSourceSecret(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  await deleteBridgeSecret(`/secrets/source/${encodeURIComponent(id)}`, signal);
}

export async function saveBridgeAiSecret(
  ai: BridgeSecretAi,
  signal?: AbortSignal,
): Promise<void> {
  await mutateBridgeSecret("/secrets/ai", ai, signal);
}

export async function deleteBridgeAiSecret(
  signal?: AbortSignal,
): Promise<void> {
  await deleteBridgeSecret("/secrets/ai", signal);
}

export async function saveBridgeS3BackupSecret(
  config: BridgeSecretS3Backup,
  signal?: AbortSignal,
): Promise<void> {
  await mutateBridgeSecret("/secrets/s3-backup", config, signal);
}

export async function deleteBridgeS3BackupSecret(
  signal?: AbortSignal,
): Promise<void> {
  await deleteBridgeSecret("/secrets/s3-backup", signal);
}

export async function testBridgeS3Backup(signal?: AbortSignal): Promise<
  | { ok: true }
  | {
      ok: false;
      error: string;
      likelyCors?: boolean;
    }
> {
  const response = await postBridgeJson("/s3-backup/test", undefined, signal);
  return bridgeS3BackupTestResponseSchema.parse(response);
}

export async function listBridgeS3Backup(signal?: AbortSignal): Promise<{
  objects: Array<{ key: string; size: number; lastModified: string | null }>;
}> {
  const response = await postBridgeJson("/s3-backup/list", undefined, signal);
  return bridgeS3BackupListResponseSchema.parse(response);
}

export async function uploadBridgeS3Backup(
  bytes: Uint8Array,
  key?: string,
  signal?: AbortSignal,
): Promise<{ key: string }> {
  const response = await postBridgeJson(
    "/s3-backup/upload",
    { bytesBase64: bytesToBase64(bytes), key },
    signal,
  );
  return bridgeS3BackupUploadResponseSchema.parse(response);
}

export async function downloadBridgeS3Backup(
  key: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const response = await postBridgeJson("/s3-backup/download", { key }, signal);
  const parsed = bridgeS3BackupDownloadResponseSchema.parse(response);
  return base64ToBytes(parsed.bytesBase64);
}

async function mutateBridgeSecret(
  pathname: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(bridgeUrl(pathname), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  bridgeSecretMutationResponseSchema.parse(await response.json());
}

async function deleteBridgeSecret(
  pathname: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(bridgeUrl(pathname), {
    method: "DELETE",
    headers: getAuthHeaders(),
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  bridgeSecretMutationResponseSchema.parse(await response.json());
}

async function postBridgeJson(
  pathname: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(bridgeUrl(pathname), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json();
}

async function mutateBridgeProjectFiles(
  method: "PUT" | "POST" | "DELETE",
  pathname: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<BridgeProjectFilesResponse> {
  const response = await fetch(bridgeUrl(pathname), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return bridgeProjectFilesResponseSchema.parse(await response.json());
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
