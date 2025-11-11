import { updateModel } from "./model-updater";
import { extractSemanticLayerFromSQL } from "./sql-extractor";

export interface UpdateResult {
  success: boolean;
  exploreName?: string;
  created?: boolean;
  addedDimensions?: number;
  addedMeasures?: number;
  error?: string;
}

/**
 * Extracts semantic layer metadata from SQL and updates the corresponding model file.
 * Creates new model files if they don't exist.
 * Skips fields that already exist in the model.
 *
 * @param sql - SQL query to analyze
 * @param modelsDir - Path to the models directory (e.g., 'semantic-layer/models')
 * @returns Result of the update operation
 *
 * @example
 * ```typescript
 * const result = await updateModelFromSQL(
 *   "SELECT Country, COUNT(*) as count FROM unicorns GROUP BY Country",
 *   "semantic-layer/models"
 * );
 * console.log(result);
 * // { success: true, exploreName: "unicorns", created: true, addedDimensions: 1, addedMeasures: 1 }
 * ```
 */
export function updateModelFromSQL(
  sql: string,
  modelsDir: string,
): UpdateResult {
  try {
    // Extract metadata from SQL
    const metadata = extractSemanticLayerFromSQL(sql);

    // Update or create the model file
    const updateResult = updateModel(modelsDir, {
      exploreName: metadata.exploreName,
      dimensions: metadata.dimensions,
      measures: metadata.measures,
    });

    return {
      success: true,
      exploreName: metadata.exploreName,
      created: updateResult.created,
      addedDimensions: updateResult.addedDimensions,
      addedMeasures: updateResult.addedMeasures,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type { UpdateModelOptions } from "./model-updater";
export {
  addDimension,
  addJoin,
  addMeasure,
  addSegment,
  loadModel,
  removeDimension,
  removeJoin,
  removeMeasure,
  removeSegment,
  updateModel,
} from "./model-updater";
export type { ConnectedTableInput, SourceEntry } from "./source-updater";
export {
  connectedTableToSources,
  updateSources,
  updateSourcesFromConnectedTable,
} from "./source-updater";
export type { ExtractedMetadata } from "./sql-extractor";
// Re-export for convenience
export { extractSemanticLayerFromSQL } from "./sql-extractor";
