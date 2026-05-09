import type { BridgeSecretS3Backup } from "@pondview/bridge-protocol";

export type BridgeS3BackupObject = {
  key: string;
  size: number;
  lastModified: string | null;
};

const SNAPSHOT_CONTENT_TYPE = "application/vnd.duckdb.database";

async function loadS3Client(config: BridgeSecretS3Backup) {
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
  config: BridgeSecretS3Backup,
  now = new Date(),
): string {
  const prefix = normalizePrefix(config.prefix ?? "");
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${prefix}pondview-snapshot-${stamp}.duckdb`;
}

export async function testBridgeS3BackupConnection(
  config: BridgeSecretS3Backup,
): Promise<{ ok: true } | { ok: false; error: string; likelyCors: false }> {
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
      likelyCors: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function listBridgeS3BackupObjects(
  config: BridgeSecretS3Backup,
): Promise<BridgeS3BackupObject[]> {
  const client = await loadS3Client(config);
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: config.prefix || undefined,
      MaxKeys: 100,
    }),
  );

  return (response.Contents ?? [])
    .filter((entry) => entry.Key?.endsWith(".duckdb"))
    .map((entry) => ({
      key: entry.Key as string,
      size: entry.Size ?? 0,
      lastModified: entry.LastModified?.toISOString() ?? null,
    }))
    .sort((a, b) => {
      const aTime = a.lastModified ? Date.parse(a.lastModified) : 0;
      const bTime = b.lastModified ? Date.parse(b.lastModified) : 0;
      return bTime - aTime;
    });
}

export async function uploadBridgeS3Backup(
  config: BridgeSecretS3Backup,
  bytes: Uint8Array,
  key = buildSnapshotKey(config),
): Promise<{ key: string }> {
  const client = await loadS3Client(config);
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: bytes,
      ContentType: SNAPSHOT_CONTENT_TYPE,
    }),
  );
  return { key };
}

export async function downloadBridgeS3Backup(
  config: BridgeSecretS3Backup,
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
  return response.Body.transformToByteArray();
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+/, "");
  if (!trimmed) {
    return "";
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}
