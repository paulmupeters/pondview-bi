import { join } from "node:path";
import { loadModelsFromDirectory } from "@/../semantic-layer/model-loader";
import type { DataModel } from "@/../semantic-layer/types";
import {
  applyMaterializationsToDataModel,
  listMaterializations,
  materializeSemanticLayer,
  type MaterializationResult,
} from "@/lib/materialization/semantic-layer";

const DEFAULT_MODELS_DIR = join(process.cwd(), "semantic-layer", "models");

export interface LoadMaterializedModelOptions {
  modelsDir?: string;
  exploreNames?: string[];
}

/**
 * Loads semantic layer models and ensures they are materialized.
 * This function checks for changes in the semantic layer and materializes
 * explores if their model hash has changed.
 *
 * @param options - Configuration options
 * @param options.modelsDir - Directory containing semantic layer models (defaults to semantic-layer/models)
 * @param options.exploreNames - Optional array of explore names to materialize. If not provided, all explores are materialized.
 * @returns DataModel with materializations applied, or null if loading fails
 */
export async function loadMaterializedModel(
  options: LoadMaterializedModelOptions = {}
): Promise<DataModel | null> {
  const modelsDir = options.modelsDir ?? DEFAULT_MODELS_DIR;

  try {
    // Materialize explores (checks for changes automatically)
    try {
      if (options.exploreNames && options.exploreNames.length > 0) {
        // Materialize specific explores
        for (const exploreName of options.exploreNames) {
          const results = await materializeSemanticLayer({
            modelsDir,
            exploreName,
          });
          logMaterializationResults(results);
        }
      } else {
        // Materialize all explores
        const results = await materializeSemanticLayer({
          modelsDir,
        });
        logMaterializationResults(results);
      }
    } catch (materializationError) {
      console.warn(
        "[Load Materialized Model] Materialization failed:",
        materializationError
      );
      // Continue anyway - we'll try to load existing materializations
    }

    // Load models from directory
    const dataModel = loadModelsFromDirectory(modelsDir);

    // Apply materializations to the data model
    try {
      const materializations = await listMaterializations();
      if (materializations.length > 0) {
        return applyMaterializationsToDataModel(dataModel, materializations);
      }
    } catch (materializationError) {
      console.warn(
        "[Load Materialized Model] Failed to load materialization metadata:",
        materializationError
      );
      // Return the base model without materializations
    }

    return dataModel;
  } catch (error) {
    console.error(
      "[Load Materialized Model] Failed to load semantic layer models:",
      error
    );
    return null;
  }
}

function logMaterializationResults(results: MaterializationResult[]): void {
  if (results.length === 0) {
    return;
  }

  const failures = results.filter((result) => result.status === "error");
  if (failures.length > 0) {
    console.warn("[Load Materialized Model] Materialization errors:", failures);
  }
}

