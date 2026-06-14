import { z } from "zod";
import {
  cardConfigSchema,
  configSchema,
  tableConfigSchema,
  textConfigSchema,
} from "@/lib/types";

const schemaVersionSchema = z.literal(1);
const nonEmptyStringSchema = z.string().trim().min(1);

export const projectArtifactIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const projectSourceKindSchema = z.enum([
  "runtime",
  "motherduck",
  "external",
]);

export const projectSourceExternalTypeSchema = z.enum([
  "postgres",
  "mysql",
  "sqlite",
  "quack",
  "httpfs",
  "custom",
]);

export const projectVisualConfigSchema = z.union([
  configSchema,
  tableConfigSchema,
  cardConfigSchema,
  textConfigSchema,
]);

export const localProjectSourceConnectionSchema = z
  .object({
    type: z.string().trim().min(1),
    identifier: z.string().trim().min(1).optional(),
    connectionId: z.string().trim().min(1).optional(),
    alias: z.string().trim().min(1).optional(),
    setupSql: z.string().trim().min(1).optional(),
    readOnly: z.boolean().optional(),
    duckdbExtension: z.string().trim().min(1).optional(),
    duckdbExtensionRepository: z.string().trim().min(1).optional(),
    attachOptions: z
      .object({
        type: z.string().trim().min(1).optional(),
        token: z.string().optional(),
        disableSsl: z.boolean().optional(),
      })
      .optional(),
  })
  .refine(
    (connection) =>
      connection.type === "custom"
        ? Boolean(connection.setupSql)
        : Boolean(connection.identifier || connection.connectionId),
    {
      message:
        "Custom source connections require setupSql; non-custom source connections require identifier or connectionId",
    },
  )
  .refine(
    (connection) => {
      if (connection.type !== "custom") {
        return true;
      }
      return (
        connection.identifier === undefined &&
        connection.connectionId === undefined &&
        connection.alias === undefined &&
        connection.readOnly === undefined &&
        connection.duckdbExtension === undefined &&
        connection.duckdbExtensionRepository === undefined &&
        connection.attachOptions === undefined
      );
    },
    {
      message:
        "Custom source connections are SQL-backed and cannot include identifier, connectionId, alias, readOnly, duckdbExtension, duckdbExtensionRepository, or attachOptions",
    },
  );

export const localProjectSourceBindingSchema = z.object({
  runtimeBackend: z.enum(["duckdb-wasm", "bridge"]),
  dbIdentifier: z.string().nullable().optional(),
  catalogContext: z.string().nullable().optional(),
  connection: localProjectSourceConnectionSchema.optional(),
});

export const localProjectSourceBindingsSchema = z.object({
  schemaVersion: schemaVersionSchema,
  bindings: z.record(projectArtifactIdSchema, localProjectSourceBindingSchema),
});

export const projectManifestSchema = z.object({
  schemaVersion: schemaVersionSchema,
  name: nonEmptyStringSchema,
  defaultSourceRef: projectArtifactIdSchema.nullable().optional(),
  description: z.string().optional(),
  sourceBindings: z
    .record(projectArtifactIdSchema, localProjectSourceBindingSchema)
    .optional(),
});

export const trackedProjectSourceSchema = z.object({
  id: projectArtifactIdSchema,
  kind: projectSourceKindSchema,
  externalType: projectSourceExternalTypeSchema.optional(),
  description: z.string().optional(),
});

export const trackedProjectSourceRegistrySchema = z.object({
  schemaVersion: schemaVersionSchema,
  sources: z.array(trackedProjectSourceSchema),
});

export const projectDashboardSlicerSchema = z.object({
  id: projectArtifactIdSchema.optional(),
  field: nonEmptyStringSchema,
  title: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

export const projectDashboardJoinSchema = z.object({
  leftTable: nonEmptyStringSchema,
  leftColumn: nonEmptyStringSchema,
  rightTable: nonEmptyStringSchema,
  rightColumn: nonEmptyStringSchema,
  type: z.enum(["inner", "left", "right", "full"]).optional(),
});

export const projectDashboardJoinsFileSchema = z.object({
  schemaVersion: schemaVersionSchema,
  joins: z.array(projectDashboardJoinSchema),
});

export const projectDashboardMeasureRefSchema = z.object({
  id: projectArtifactIdSchema,
  metadataFile: nonEmptyStringSchema,
  sqlFile: nonEmptyStringSchema,
});

export const projectDashboardVisualRefSchema = z.object({
  id: projectArtifactIdSchema,
  metadataFile: nonEmptyStringSchema,
  sqlFile: nonEmptyStringSchema,
});

export const projectDashboardManifestSchema = z.object({
  schemaVersion: schemaVersionSchema,
  id: projectArtifactIdSchema,
  title: nonEmptyStringSchema,
  description: z.string().optional(),
  columns: z.number().int().positive().max(12).optional(),
  autoFitRows: z.boolean().optional(),
  sourceRef: projectArtifactIdSchema.optional(),
  joinsFile: nonEmptyStringSchema.optional(),
  slicers: z.array(projectDashboardSlicerSchema).optional(),
  measures: z.array(projectDashboardMeasureRefSchema),
  visuals: z.array(projectDashboardVisualRefSchema),
});

export const projectDashboardMeasureMetadataSchema = z.object({
  schemaVersion: schemaVersionSchema,
  id: projectArtifactIdSchema,
  key: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  description: z.string().optional(),
  sourceRef: projectArtifactIdSchema.optional(),
  catalogContext: z.string().optional(),
});

export const projectDashboardVisualMetadataSchema = z.object({
  schemaVersion: schemaVersionSchema,
  id: projectArtifactIdSchema,
  sourceRef: projectArtifactIdSchema.optional(),
  catalogContext: z.string().optional(),
  config: projectVisualConfigSchema,
});

export const projectSharedQueryMetadataSchema = z.object({
  schemaVersion: schemaVersionSchema,
  id: projectArtifactIdSchema,
  name: nonEmptyStringSchema,
  kind: z.enum(["query", "view"]).optional(),
  description: z.string().optional(),
  sourceRef: projectArtifactIdSchema.optional(),
  catalogContext: z.string().optional(),
  tags: z.array(nonEmptyStringSchema).optional(),
});

export const projectPublishedNotebookCellSchema = z.object({
  id: projectArtifactIdSchema,
  kind: z.enum(["text", "ai", "sql"]),
  file: nonEmptyStringSchema,
  visualFile: nonEmptyStringSchema.optional(),
  sourceRef: projectArtifactIdSchema.optional(),
  catalogContext: z.string().optional(),
});

export const projectPublishedNotebookManifestSchema = z.object({
  schemaVersion: schemaVersionSchema,
  id: projectArtifactIdSchema,
  title: nonEmptyStringSchema,
  description: z.string().optional(),
  cells: z.array(projectPublishedNotebookCellSchema),
});

export type ProjectManifest = z.infer<typeof projectManifestSchema>;
export type TrackedProjectSource = z.infer<typeof trackedProjectSourceSchema>;
export type TrackedProjectSourceRegistry = z.infer<
  typeof trackedProjectSourceRegistrySchema
>;
export type LocalProjectSourceBinding = z.infer<
  typeof localProjectSourceBindingSchema
>;
export type LocalProjectSourceConnection = z.infer<
  typeof localProjectSourceConnectionSchema
>;
export type LocalProjectSourceBindings = z.infer<
  typeof localProjectSourceBindingsSchema
>;
export type ProjectVisualConfig = z.infer<typeof projectVisualConfigSchema>;
export type ProjectDashboardSlicer = z.infer<
  typeof projectDashboardSlicerSchema
>;
export type ProjectDashboardJoin = z.infer<typeof projectDashboardJoinSchema>;
export type ProjectDashboardJoinsFile = z.infer<
  typeof projectDashboardJoinsFileSchema
>;
export type ProjectDashboardManifest = z.infer<
  typeof projectDashboardManifestSchema
>;
export type ProjectDashboardMeasureMetadata = z.infer<
  typeof projectDashboardMeasureMetadataSchema
>;
export type ProjectDashboardVisualMetadata = z.infer<
  typeof projectDashboardVisualMetadataSchema
>;
export type ProjectSharedQueryMetadata = z.infer<
  typeof projectSharedQueryMetadataSchema
>;
export type ProjectPublishedNotebookCell = z.infer<
  typeof projectPublishedNotebookCellSchema
>;
export type ProjectPublishedNotebookManifest = z.infer<
  typeof projectPublishedNotebookManifestSchema
>;
