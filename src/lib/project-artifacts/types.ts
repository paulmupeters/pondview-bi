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
]);

export const projectVisualConfigSchema = z.union([
  configSchema,
  tableConfigSchema,
  cardConfigSchema,
  textConfigSchema,
]);

export const projectManifestSchema = z.object({
  schemaVersion: schemaVersionSchema,
  name: nonEmptyStringSchema,
  defaultSourceRef: projectArtifactIdSchema.optional(),
  description: z.string().optional(),
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

export const localProjectSourceBindingSchema = z.object({
  runtimeBackend: z.enum(["duckdb-wasm", "duckdb-http", "bridge"]),
  dbIdentifier: z.string().nullable().optional(),
  catalogContext: z.string().nullable().optional(),
});

export const localProjectSourceBindingsSchema = z.object({
  schemaVersion: schemaVersionSchema,
  bindings: z.record(projectArtifactIdSchema, localProjectSourceBindingSchema),
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
