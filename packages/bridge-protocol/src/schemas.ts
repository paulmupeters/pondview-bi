import { z } from "zod";

export const bridgeRuntimeBackendSchema = z.literal("bridge");

export const bridgeDatabaseInfoSchema = z.object({
  mode: z.enum(["memory", "file"]),
  id: z.string(),
  name: z.string().optional(),
});

export const bridgeHealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal("pondview-bridge"),
  version: z.string(),
  runtime: z.object({
    backend: bridgeRuntimeBackendSchema,
    duckdb: z.string().nullable(),
    database: bridgeDatabaseInfoSchema.optional(),
  }),
});

export const bridgeCapabilitiesResponseSchema = z.object({
  runtimeBackend: bridgeRuntimeBackendSchema,
  query: z.boolean(),
  catalog: z.boolean(),
  attachDuckDb: z.boolean(),
  importFiles: z.boolean(),
  projects: z.boolean(),
  secrets: z.boolean().optional(),
  ai: z.boolean().optional(),
  s3Backup: z.boolean().optional(),
});

export const bridgeProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  backingKind: z.literal("bridge-filesystem"),
  openedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  defaultSourceRef: z.string().min(1).nullable().optional(),
  rootPath: z.string().min(1),
});

export const bridgeProjectResponseSchema = z.object({
  project: bridgeProjectSchema,
});

export const bridgeProjectUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  defaultSourceRef: z.string().trim().min(1).nullable().optional(),
});

export const bridgeProjectTextFileSchema = z.object({
  path: z.string().trim().min(1),
  content: z.string(),
});

export const bridgeProjectFilesResponseSchema = z.object({
  files: z.array(bridgeProjectTextFileSchema),
});

export const bridgeProjectSaveFilesRequestSchema = z.object({
  files: z.array(bridgeProjectTextFileSchema),
});

export const bridgeProjectInitRequestSchema = z.object({
  files: z.array(bridgeProjectTextFileSchema),
  databasePath: z.string().trim().min(1).optional(),
});

export const bridgeProjectDatabasePathPickResponseSchema = z.object({
  path: z.string().min(1).nullable(),
});

export const bridgeProjectDatabasePathsResponseSchema = z.object({
  paths: z.array(z.string().min(1)),
  configuredDatabasePath: z.string().min(1).optional(),
});

export const bridgeProjectReplaceFilesRequestSchema = z.object({
  scopePath: z.string().optional(),
  files: z.array(bridgeProjectTextFileSchema),
});

export const bridgeProjectDeleteFilesRequestSchema = z.object({
  paths: z.array(z.string().trim().min(1)),
});

export const bridgeConfigResponseSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  requires_auth: z.boolean(),
  database: bridgeDatabaseInfoSchema.optional(),
});

export const bridgeColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
});

export const bridgeCatalogTableSchema = z.object({
  catalog: z.string(),
  schema: z.string(),
  name: z.string(),
  type: z.string().nullable(),
});

export const bridgeCatalogResponseSchema = z.object({
  tables: z.array(bridgeCatalogTableSchema),
});

const bridgeJsonValueSchema: z.ZodType<BridgeJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(bridgeJsonValueSchema),
    z.record(z.string(), bridgeJsonValueSchema),
  ]),
);

export type BridgeJsonValue =
  | string
  | number
  | boolean
  | null
  | BridgeJsonValue[]
  | { [key: string]: BridgeJsonValue };

export const bridgeQueryRequestSchema = z.object({
  sql: z.string().min(1),
  limit: z.number().int().positive().max(10000).optional(),
});

export const bridgeQueryResponseSchema = z.object({
  columns: z.array(bridgeColumnSchema),
  rows: z.array(z.record(z.string(), bridgeJsonValueSchema)),
  rowCount: z.number().int().nonnegative(),
  rowsChanged: z.number().int().nonnegative().optional(),
});

export const bridgeSourceSchema = z.object({
  id: z.string(),
  alias: z.string(),
  identifier: z.string().optional(),
  connectionId: z.string().optional(),
  readonly: z.boolean(),
  type: z.string(),
});

export const bridgeAttachSourceRequestSchema = z.object({
  identifier: z.string().min(1).optional(),
  connectionId: z.string().min(1).optional(),
  type: z.string().optional(),
  alias: z.string().min(1),
  readonly: z.boolean().optional(),
  duckdbExtension: z.string().optional(),
  duckdbExtensionRepository: z.string().optional(),
  attachOptions: z
    .object({
      type: z.string().optional(),
      token: z.string().optional(),
      disableSsl: z.boolean().optional(),
    })
    .optional(),
});

export const bridgeSourcesResponseSchema = z.object({
  sources: z.array(bridgeSourceSchema),
});

export const bridgeErrorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
  }),
});

export const bridgeSecretSourceSchema = z.object({
  type: z.string().min(1),
  identifier: z.string().min(1),
  alias: z.string().optional(),
  readonly: z.boolean().optional(),
  duckdbExtension: z.string().optional(),
  duckdbExtensionRepository: z.string().optional(),
  attachOptions: z
    .object({
      type: z.string().optional(),
      token: z.string().optional(),
      disableSsl: z.boolean().optional(),
    })
    .optional(),
});

export const bridgeSecretAiSchema = z.object({
  provider: z.enum([
    "openai",
    "gateway",
    "anthropic",
    "ollama",
    "openai-compatible",
    "xai",
  ]),
  model: z.string().min(1),
  visualizationModel: z.string().optional(),
  apiKey: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  openAiCompatibleUrl: z.string().optional(),
  openAiCompatibleName: z.string().optional(),
});

export const bridgeSecretS3BackupSchema = z.object({
  endpoint: z.string().min(1),
  region: z.string().min(1),
  bucket: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  prefix: z.string().optional(),
  forcePathStyle: z.boolean().optional(),
});

export const bridgeSecretsStatusResponseSchema = z.object({
  path: z.string(),
  sources: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      alias: z.string().optional(),
      readonly: z.boolean().optional(),
      duckdbExtension: z.string().optional(),
      duckdbExtensionRepository: z.string().optional(),
    }),
  ),
  ai: z
    .object({
      configured: z.boolean(),
      provider: z.string().optional(),
      model: z.string().optional(),
      visualizationModel: z.string().optional(),
    })
    .optional(),
  s3Backup: z
    .object({
      configured: z.boolean(),
      endpoint: z.string().optional(),
      region: z.string().optional(),
      bucket: z.string().optional(),
      prefix: z.string().optional(),
      forcePathStyle: z.boolean().optional(),
    })
    .optional(),
});

export const bridgeSecretMutationResponseSchema = z.object({
  ok: z.literal(true),
});

export const bridgeS3BackupObjectSchema = z.object({
  key: z.string(),
  size: z.number(),
  lastModified: z.string().nullable(),
});

export const bridgeS3BackupTestResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    likelyCors: z.boolean().optional(),
  }),
]);

export const bridgeS3BackupListResponseSchema = z.object({
  objects: z.array(bridgeS3BackupObjectSchema),
});

export const bridgeS3BackupUploadRequestSchema = z.object({
  bytesBase64: z.string().min(1),
  key: z.string().optional(),
});

export const bridgeS3BackupUploadResponseSchema = z.object({
  key: z.string(),
});

export const bridgeS3BackupDownloadRequestSchema = z.object({
  key: z.string().min(1),
});

export const bridgeS3BackupDownloadResponseSchema = z.object({
  bytesBase64: z.string(),
});

export type BridgeHealthResponse = z.infer<typeof bridgeHealthResponseSchema>;
export type BridgeCapabilitiesResponse = z.infer<
  typeof bridgeCapabilitiesResponseSchema
>;
export type BridgeProject = z.infer<typeof bridgeProjectSchema>;
export type BridgeProjectResponse = z.infer<typeof bridgeProjectResponseSchema>;
export type BridgeProjectUpdateRequest = z.infer<
  typeof bridgeProjectUpdateRequestSchema
>;
export type BridgeProjectTextFile = z.infer<typeof bridgeProjectTextFileSchema>;
export type BridgeProjectFilesResponse = z.infer<
  typeof bridgeProjectFilesResponseSchema
>;
export type BridgeProjectSaveFilesRequest = z.infer<
  typeof bridgeProjectSaveFilesRequestSchema
>;
export type BridgeProjectInitRequest = z.infer<
  typeof bridgeProjectInitRequestSchema
>;
export type BridgeProjectDatabasePathPickResponse = z.infer<
  typeof bridgeProjectDatabasePathPickResponseSchema
>;
export type BridgeProjectDatabasePathsResponse = z.infer<
  typeof bridgeProjectDatabasePathsResponseSchema
>;
export type BridgeProjectReplaceFilesRequest = z.infer<
  typeof bridgeProjectReplaceFilesRequestSchema
>;
export type BridgeProjectDeleteFilesRequest = z.infer<
  typeof bridgeProjectDeleteFilesRequestSchema
>;
export type BridgeDatabaseInfo = z.infer<typeof bridgeDatabaseInfoSchema>;
export type BridgeConfigResponse = z.infer<typeof bridgeConfigResponseSchema>;
export type BridgeColumn = z.infer<typeof bridgeColumnSchema>;
export type BridgeCatalogResponse = z.infer<typeof bridgeCatalogResponseSchema>;
export type BridgeQueryRequest = z.infer<typeof bridgeQueryRequestSchema>;
export type BridgeQueryResponse = z.infer<typeof bridgeQueryResponseSchema>;
export type BridgeSource = z.infer<typeof bridgeSourceSchema>;
export type BridgeAttachSourceRequest = z.infer<
  typeof bridgeAttachSourceRequestSchema
>;
export type BridgeSourcesResponse = z.infer<typeof bridgeSourcesResponseSchema>;
export type BridgeSecretSource = z.infer<typeof bridgeSecretSourceSchema>;
export type BridgeSecretAi = z.infer<typeof bridgeSecretAiSchema>;
export type BridgeSecretS3Backup = z.infer<typeof bridgeSecretS3BackupSchema>;
export type BridgeSecretsStatusResponse = z.infer<
  typeof bridgeSecretsStatusResponseSchema
>;
export type BridgeSecretMutationResponse = z.infer<
  typeof bridgeSecretMutationResponseSchema
>;
export type BridgeS3BackupObject = z.infer<typeof bridgeS3BackupObjectSchema>;
export type BridgeS3BackupTestResponse = z.infer<
  typeof bridgeS3BackupTestResponseSchema
>;
export type BridgeS3BackupListResponse = z.infer<
  typeof bridgeS3BackupListResponseSchema
>;
export type BridgeS3BackupUploadRequest = z.infer<
  typeof bridgeS3BackupUploadRequestSchema
>;
export type BridgeS3BackupUploadResponse = z.infer<
  typeof bridgeS3BackupUploadResponseSchema
>;
export type BridgeS3BackupDownloadRequest = z.infer<
  typeof bridgeS3BackupDownloadRequestSchema
>;
export type BridgeS3BackupDownloadResponse = z.infer<
  typeof bridgeS3BackupDownloadResponseSchema
>;
