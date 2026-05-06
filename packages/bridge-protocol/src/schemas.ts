import { z } from "zod";

export const bridgeRuntimeBackendSchema = z.literal("bridge");

export const bridgeHealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal("pondview-bridge"),
  version: z.string(),
  runtime: z.object({
    backend: bridgeRuntimeBackendSchema,
    duckdb: z.string().nullable(),
  }),
});

export const bridgeCapabilitiesResponseSchema = z.object({
  runtimeBackend: bridgeRuntimeBackendSchema,
  query: z.boolean(),
  catalog: z.boolean(),
  attachDuckDb: z.boolean(),
  importFiles: z.boolean(),
  projects: z.boolean(),
  readonly: z.boolean(),
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
  identifier: z.string(),
  readonly: z.boolean(),
  type: z.enum(["duckdb", "duckdb_remote"]),
});

export const bridgeAttachSourceRequestSchema = z.object({
  identifier: z.string().min(1),
  alias: z.string().min(1),
  readonly: z.boolean().optional(),
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

export type BridgeHealthResponse = z.infer<typeof bridgeHealthResponseSchema>;
export type BridgeCapabilitiesResponse = z.infer<
  typeof bridgeCapabilitiesResponseSchema
>;
export type BridgeColumn = z.infer<typeof bridgeColumnSchema>;
export type BridgeCatalogResponse = z.infer<typeof bridgeCatalogResponseSchema>;
export type BridgeQueryRequest = z.infer<typeof bridgeQueryRequestSchema>;
export type BridgeQueryResponse = z.infer<typeof bridgeQueryResponseSchema>;
export type BridgeSource = z.infer<typeof bridgeSourceSchema>;
export type BridgeAttachSourceRequest = z.infer<
  typeof bridgeAttachSourceRequestSchema
>;
export type BridgeSourcesResponse = z.infer<typeof bridgeSourcesResponseSchema>;
