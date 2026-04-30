import {
  isS3BackupConfigComplete,
  type S3BackupConfig,
} from "./s3-backup-storage";

export type S3BackupObject = {
  key: string;
  size: number;
  lastModified: Date | null;
};

const SNAPSHOT_CONTENT_TYPE = "application/vnd.duckdb.database";

async function loadS3Client(config: S3BackupConfig) {
  if (!isS3BackupConfigComplete(config)) {
    throw new Error("S3 backup is not fully configured.");
  }

  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
  });
}

export function buildSnapshotKey(
  config: S3BackupConfig,
  now: Date = new Date(),
): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${config.prefix}pondview-snapshot-${stamp}.duckdb`;
}

export async function uploadSnapshotToS3(
  config: S3BackupConfig,
  snapshot: Uint8Array,
  options?: { key?: string },
): Promise<{ key: string }> {
  const client = await loadS3Client(config);
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const key = options?.key ?? buildSnapshotKey(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: snapshot,
      ContentType: SNAPSHOT_CONTENT_TYPE,
    }),
  );

  return { key };
}

export async function listSnapshotsInS3(
  config: S3BackupConfig,
  options?: { maxKeys?: number },
): Promise<S3BackupObject[]> {
  const client = await loadS3Client(config);
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: config.prefix || undefined,
      MaxKeys: options?.maxKeys ?? 100,
    }),
  );

  const contents = response.Contents ?? [];
  return contents
    .filter((entry) => entry.Key?.endsWith(".duckdb"))
    .map((entry) => ({
      key: entry.Key as string,
      size: entry.Size ?? 0,
      lastModified: entry.LastModified ?? null,
    }))
    .sort((a, b) => {
      const aTime = a.lastModified?.getTime() ?? 0;
      const bTime = b.lastModified?.getTime() ?? 0;
      return bTime - aTime;
    });
}

export async function downloadSnapshotFromS3(
  config: S3BackupConfig,
  key: string,
): Promise<Uint8Array> {
  const client = await loadS3Client(config);
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");

  const response = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );

  if (!response.Body) {
    throw new Error(`S3 object "${key}" returned an empty body.`);
  }

  const bytes = await response.Body.transformToByteArray();
  if (bytes.byteLength === 0) {
    throw new Error(`S3 object "${key}" is empty.`);
  }
  return bytes;
}

export function isCorsLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  // CORS failures surface as TypeError with "fetch" / "network" / "failed" in the message.
  // The browser never exposes the actual CORS header details to JS.
  return (
    error instanceof TypeError &&
    (message.includes("fetch") ||
      message.includes("network") ||
      message.includes("failed to fetch") ||
      message.includes("load failed"))
  );
}

export async function testS3BackupConnection(
  config: S3BackupConfig,
): Promise<{ ok: true } | { ok: false; error: string; likelyCors: boolean }> {
  try {
    const client = await loadS3Client(config);
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: config.prefix || undefined,
        MaxKeys: 1,
      }),
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      likelyCors: isCorsLikeError(error),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
