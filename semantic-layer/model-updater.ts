import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { DimensionDef, MeasureDef } from "./types";

interface YAMLExploreDef {
  version: number;
  explore: string;
  base: string;
  joins?: Array<{
    name: string;
    to: string;
    type: string;
    on: string;
    required?: boolean;
  }>;
  dimensions: Array<{
    name: string;
    sql: string;
    type: string;
    primaryKey?: boolean;
    conformKey?: string;
  }>;
  measures?: Array<{
    name: string;
    agg: string;
    sql?: string;
  }>;
  segments?: Array<{
    name: string;
    sql: string;
  }>;
}

export interface UpdateModelOptions {
  exploreName: string;
  dimensions: DimensionDef[];
  measures: MeasureDef[];
}

/**
 * Updates or creates a model YAML file with new dimensions and measures.
 * Skips fields that already exist (by name).
 *
 * @param modelsDir - Path to the models directory (e.g., 'semantic-layer/models')
 * @param options - Explore name and fields to add
 * @returns Information about what was updated
 */
export function updateModel(
  modelsDir: string,
  options: UpdateModelOptions
): { created: boolean; addedDimensions: number; addedMeasures: number } {
  const { exploreName, dimensions, measures } = options;
  const filePath = join(modelsDir, `${exploreName}.yml`);
  const fileExists = existsSync(filePath);

  let yamlData: YAMLExploreDef;

  if (fileExists) {
    // Load existing model
    const content = readFileSync(filePath, "utf-8");
    yamlData = yaml.load(content) as YAMLExploreDef;
  } else {
    // Create new model structure
    yamlData = {
      version: 1,
      explore: exploreName,
      base: exploreName, // Assume base matches explore name
      dimensions: [],
      measures: [],
    };
  }

  // Track what we're adding
  let addedDimensions = 0;
  let addedMeasures = 0;

  // Merge dimensions (skip duplicates by name)
  const existingDimensionNames = new Set(
    yamlData.dimensions.map((d) => d.name.toLowerCase())
  );

  for (const dimension of dimensions) {
    if (!existingDimensionNames.has(dimension.name.toLowerCase())) {
      yamlData.dimensions.push({
        name: dimension.name,
        sql: dimension.sql,
        type: dimension.type,
        primaryKey: dimension.primaryKey,
        conformKey: dimension.conformKey,
      });
      addedDimensions++;
    }
  }

  // Merge measures (skip duplicates by name)
  if (!yamlData.measures) {
    yamlData.measures = [];
  }

  const existingMeasureNames = new Set(
    yamlData.measures.map((m) => m.name.toLowerCase())
  );

  for (const measure of measures) {
    if (!existingMeasureNames.has(measure.name.toLowerCase())) {
      yamlData.measures.push({
        name: measure.name,
        agg: measure.agg,
        sql: measure.sql,
      });
      addedMeasures++;
    }
  }

  // Write updated YAML back to file
  const yamlContent = yaml.dump(yamlData, {
    indent: 2,
    lineWidth: -1, // Don't wrap lines
    noRefs: true,
    sortKeys: false, // Preserve key order
  });

  writeFileSync(filePath, yamlContent, "utf-8");

  return {
    created: !fileExists,
    addedDimensions,
    addedMeasures,
  };
}
