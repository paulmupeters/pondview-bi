export const S3_BACKUP_CONFIG_STORAGE_KEY = "bi.runtime.s3Backup.v1";

export type S3BackupConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  forcePathStyle: boolean;
};

export const EMPTY_S3_BACKUP_CONFIG: S3BackupConfig = {
  endpoint: "",
  region: "auto",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  prefix: "",
  forcePathStyle: false,
};

const isClient = typeof window !== "undefined";

export function readS3BackupConfigFromStorage(): S3BackupConfig {
  if (!isClient) {
    return { ...EMPTY_S3_BACKUP_CONFIG };
  }

  const raw = window.localStorage.getItem(S3_BACKUP_CONFIG_STORAGE_KEY);
  if (!raw?.trim()) {
    return { ...EMPTY_S3_BACKUP_CONFIG };
  }

  try {
    return parseS3BackupConfigPayload(JSON.parse(raw));
  } catch (error) {
    console.error("[s3Backup] Failed to parse config from storage", error);
    return { ...EMPTY_S3_BACKUP_CONFIG };
  }
}

export function saveS3BackupConfigToStorage(config: S3BackupConfig): void {
  if (!isClient) {
    return;
  }
  const normalized = normalizeS3BackupConfig(config);
  window.localStorage.setItem(
    S3_BACKUP_CONFIG_STORAGE_KEY,
    JSON.stringify(normalized),
  );
}

export function clearS3BackupConfigInStorage(): void {
  if (!isClient) {
    return;
  }
  window.localStorage.removeItem(S3_BACKUP_CONFIG_STORAGE_KEY);
}

export function isS3BackupConfigComplete(config: S3BackupConfig): boolean {
  return Boolean(
    config.endpoint &&
      config.region &&
      config.bucket &&
      config.accessKeyId &&
      config.secretAccessKey,
  );
}

export function parseS3BackupConfigPayload(payload: unknown): S3BackupConfig {
  if (!payload || typeof payload !== "object") {
    return { ...EMPTY_S3_BACKUP_CONFIG };
  }

  const candidate = payload as Record<string, unknown>;
  return normalizeS3BackupConfig({
    endpoint: toTrimmedString(candidate.endpoint),
    region: toTrimmedString(candidate.region) || "auto",
    bucket: toTrimmedString(candidate.bucket),
    accessKeyId: toTrimmedString(candidate.accessKeyId),
    secretAccessKey: toTrimmedString(candidate.secretAccessKey),
    prefix: toTrimmedString(candidate.prefix),
    forcePathStyle: candidate.forcePathStyle === true,
  });
}

function normalizeS3BackupConfig(config: S3BackupConfig): S3BackupConfig {
  return {
    endpoint: stripTrailingSlash(config.endpoint.trim()),
    region: config.region.trim() || "auto",
    bucket: config.bucket.trim(),
    accessKeyId: config.accessKeyId.trim(),
    secretAccessKey: config.secretAccessKey.trim(),
    prefix: normalizePrefix(config.prefix),
    forcePathStyle: config.forcePathStyle,
  };
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+/, "");
  if (!trimmed) {
    return "";
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
