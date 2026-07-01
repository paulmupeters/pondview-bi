import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  type BridgeSecretAi,
  type BridgeSecretS3Backup,
  type BridgeSecretSource,
  type BridgeSecretsStatusResponse,
  bridgeSecretAiSchema,
  bridgeSecretS3BackupSchema,
  bridgeSecretSourceSchema,
} from "@pondview/bridge-protocol";
import { z } from "zod";

const SECRET_STORE_VERSION = 1;

const secretStoreSchema = z.object({
  version: z.literal(SECRET_STORE_VERSION).optional(),
  sources: z.record(z.string(), z.unknown()).optional(),
  ai: z.unknown().optional(),
  s3Backup: z.unknown().optional(),
});

type SecretStoreData = {
  version: typeof SECRET_STORE_VERSION;
  sources: Record<string, BridgeSecretSource>;
  ai?: BridgeSecretAi;
  s3Backup?: BridgeSecretS3Backup;
};

export class BridgeSecretStore {
  readonly path: string;

  constructor(path = getDefaultSecretsPath()) {
    this.path = resolve(path);
  }

  read(): SecretStoreData {
    if (!existsSync(this.path)) {
      return emptyStore();
    }

    const raw = readFileSync(this.path, "utf8");
    if (!raw.trim()) {
      return emptyStore();
    }

    const parsed = secretStoreSchema.parse(JSON.parse(raw));
    const sources = Object.fromEntries(
      Object.entries(parsed.sources ?? {}).map(([id, source]) => [
        id,
        bridgeSecretSourceSchema.parse(source),
      ]),
    );
    return {
      version: SECRET_STORE_VERSION,
      sources,
      ai:
        parsed.ai === undefined
          ? undefined
          : bridgeSecretAiSchema.parse(parsed.ai),
      s3Backup:
        parsed.s3Backup === undefined
          ? undefined
          : bridgeSecretS3BackupSchema.parse(parsed.s3Backup),
    };
  }

  status(): BridgeSecretsStatusResponse {
    const data = this.read();
    return {
      path: this.path,
      sources: Object.entries(data.sources).map(([id, source]) => ({
        id,
        type: source.type,
        alias: source.alias,
        readonly: source.readonly,
        duckdbExtension: source.duckdbExtension,
        duckdbExtensionRepository: source.duckdbExtensionRepository,
      })),
      ai: data.ai
        ? {
            configured: true,
            provider: data.ai.provider,
            model: data.ai.model,
            visualizationModel: data.ai.visualizationModel,
          }
        : { configured: false },
      s3Backup: data.s3Backup
        ? {
            configured: true,
            endpoint: data.s3Backup.endpoint,
            region: data.s3Backup.region,
            bucket: data.s3Backup.bucket,
            prefix: data.s3Backup.prefix,
            forcePathStyle: data.s3Backup.forcePathStyle,
          }
        : { configured: false },
    };
  }

  getSource(id: string): BridgeSecretSource | undefined {
    return this.read().sources[id];
  }

  saveSource(id: string, source: BridgeSecretSource): void {
    const data = this.read();
    data.sources[normalizeSecretId(id)] =
      bridgeSecretSourceSchema.parse(source);
    this.write(data);
  }

  deleteSource(id: string): void {
    const data = this.read();
    delete data.sources[id];
    this.write(data);
  }

  getAi(): BridgeSecretAi | undefined {
    return this.read().ai;
  }

  saveAi(ai: BridgeSecretAi): void {
    const data = this.read();
    const input = bridgeSecretAiSchema.parse(ai);
    const existingApiKey = data.ai?.apiKey?.trim();
    data.ai = {
      ...input,
      apiKey: input.apiKey?.trim() || existingApiKey,
    };
    this.write(data);
  }

  deleteAi(): void {
    const data = this.read();
    delete data.ai;
    this.write(data);
  }

  getS3Backup(): BridgeSecretS3Backup | undefined {
    return this.read().s3Backup;
  }

  saveS3Backup(config: BridgeSecretS3Backup): void {
    const data = this.read();
    data.s3Backup = bridgeSecretS3BackupSchema.parse(config);
    this.write(data);
  }

  deleteS3Backup(): void {
    const data = this.read();
    delete data.s3Backup;
    this.write(data);
  }

  private write(data: SecretStoreData): void {
    const dir = dirname(this.path);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    writeFileSync(this.path, `${JSON.stringify(data, null, 2)}\n`, {
      mode: 0o600,
    });
    chmodSync(this.path, 0o600);
  }
}

function emptyStore(): SecretStoreData {
  return {
    version: SECRET_STORE_VERSION,
    sources: {},
  };
}

function normalizeSecretId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error("Secret id is required.");
  }
  return trimmed;
}

export function getDefaultSecretsPath(): string {
  if (process.env.PONDVIEW_SECRETS_PATH?.trim()) {
    return process.env.PONDVIEW_SECRETS_PATH.trim();
  }

  const configHome = process.env.XDG_CONFIG_HOME?.trim();
  return join(
    configHome || join(homedir(), ".config"),
    "pondview",
    "secrets.json",
  );
}
