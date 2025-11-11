import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join as joinPath } from "node:path";
import yaml from "js-yaml";
import type { DimensionDef, JoinDef, MeasureDef, SegmentDef } from "./types";

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
  const filePath = joinPath(modelsDir, `${exploreName}.yml`);
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

/**
 * Loads a model file and returns its data
 */
export function loadModel(
  modelsDir: string,
  exploreName: string
): YAMLExploreDef | null {
  const filePath = joinPath(modelsDir, `${exploreName}.yml`);
  if (!existsSync(filePath)) {
    return null;
  }
  const content = readFileSync(filePath, "utf-8");
  return yaml.load(content) as YAMLExploreDef;
}

/**
 * Saves a model to file
 */
function saveModel(
  modelsDir: string,
  exploreName: string,
  yamlData: YAMLExploreDef
) {
  const filePath = joinPath(modelsDir, `${exploreName}.yml`);
  const yamlContent = yaml.dump(yamlData, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
  writeFileSync(filePath, yamlContent, "utf-8");
}

/**
 * Adds a dimension to a model
 */
export function addDimension(
  modelsDir: string,
  exploreName: string,
  dimension: DimensionDef
): { created: boolean; added: boolean } {
  const filePath = joinPath(modelsDir, `${exploreName}.yml`);
  const fileExists = existsSync(filePath);

  let yamlData: YAMLExploreDef;

  if (fileExists) {
    const content = readFileSync(filePath, "utf-8");
    yamlData = yaml.load(content) as YAMLExploreDef;
  } else {
    yamlData = {
      version: 1,
      explore: exploreName,
      base: exploreName,
      dimensions: [],
      measures: [],
    };
  }

  const existingNames = new Set(
    yamlData.dimensions.map((d) => d.name.toLowerCase())
  );

  if (existingNames.has(dimension.name.toLowerCase())) {
    return { created: !fileExists, added: false };
  }

  yamlData.dimensions.push({
    name: dimension.name,
    sql: dimension.sql,
    type: dimension.type,
    primaryKey: dimension.primaryKey,
    conformKey: dimension.conformKey,
  });

  saveModel(modelsDir, exploreName, yamlData);
  return { created: !fileExists, added: true };
}

/**
 * Removes a dimension from a model
 */
export function removeDimension(
  modelsDir: string,
  exploreName: string,
  dimensionName: string
): boolean {
  const yamlData = loadModel(modelsDir, exploreName);
  if (!yamlData) return false;

  const initialLength = yamlData.dimensions.length;
  yamlData.dimensions = yamlData.dimensions.filter(
    (d) => d.name.toLowerCase() !== dimensionName.toLowerCase()
  );

  if (yamlData.dimensions.length === initialLength) {
    return false;
  }

  saveModel(modelsDir, exploreName, yamlData);
  return true;
}

/**
 * Adds a measure to a model
 */
export function addMeasure(
  modelsDir: string,
  exploreName: string,
  measure: MeasureDef
): { created: boolean; added: boolean } {
  const filePath = joinPath(modelsDir, `${exploreName}.yml`);
  const fileExists = existsSync(filePath);

  let yamlData: YAMLExploreDef;

  if (fileExists) {
    const content = readFileSync(filePath, "utf-8");
    yamlData = yaml.load(content) as YAMLExploreDef;
  } else {
    yamlData = {
      version: 1,
      explore: exploreName,
      base: exploreName,
      dimensions: [],
      measures: [],
    };
  }

  if (!yamlData.measures) {
    yamlData.measures = [];
  }

  const existingNames = new Set(
    yamlData.measures.map((m) => m.name.toLowerCase())
  );

  if (existingNames.has(measure.name.toLowerCase())) {
    return { created: !fileExists, added: false };
  }

  yamlData.measures.push({
    name: measure.name,
    agg: measure.agg,
    sql: measure.sql,
  });

  saveModel(modelsDir, exploreName, yamlData);
  return { created: !fileExists, added: true };
}

/**
 * Removes a measure from a model
 */
export function removeMeasure(
  modelsDir: string,
  exploreName: string,
  measureName: string
): boolean {
  const yamlData = loadModel(modelsDir, exploreName);
  if (!yamlData || !yamlData.measures) return false;

  const initialLength = yamlData.measures.length;
  yamlData.measures = yamlData.measures.filter(
    (m) => m.name.toLowerCase() !== measureName.toLowerCase()
  );

  if (yamlData.measures.length === initialLength) {
    return false;
  }

  saveModel(modelsDir, exploreName, yamlData);
  return true;
}

/**
 * Adds a join to a model
 */
export function addJoin(
  modelsDir: string,
  exploreName: string,
  join: JoinDef
): { created: boolean; added: boolean } {
  const filePath = joinPath(modelsDir, `${exploreName}.yml`);
  const fileExists = existsSync(filePath);

  let yamlData: YAMLExploreDef;

  if (fileExists) {
    const content = readFileSync(filePath, "utf-8");
    yamlData = yaml.load(content) as YAMLExploreDef;
  } else {
    yamlData = {
      version: 1,
      explore: exploreName,
      base: exploreName,
      dimensions: [],
      measures: [],
      joins: [],
    };
  }

  if (!yamlData.joins) {
    yamlData.joins = [];
  }

  const existingNames = new Set(
    yamlData.joins.map((j) => j.name.toLowerCase())
  );

  if (existingNames.has(join.name.toLowerCase())) {
    return { created: !fileExists, added: false };
  }

  yamlData.joins.push({
    name: join.name,
    to: join.to,
    type: join.type,
    on: join.on,
    required: join.required,
  });

  saveModel(modelsDir, exploreName, yamlData);
  return { created: !fileExists, added: true };
}

/**
 * Removes a join from a model
 */
export function removeJoin(
  modelsDir: string,
  exploreName: string,
  joinName: string
): boolean {
  const yamlData = loadModel(modelsDir, exploreName);
  if (!yamlData || !yamlData.joins) return false;

  const initialLength = yamlData.joins.length;
  yamlData.joins = yamlData.joins.filter(
    (j) => j.name.toLowerCase() !== joinName.toLowerCase()
  );

  if (yamlData.joins.length === initialLength) {
    return false;
  }

  saveModel(modelsDir, exploreName, yamlData);
  return true;
}

/**
 * Adds a segment to a model
 */
export function addSegment(
  modelsDir: string,
  exploreName: string,
  segment: SegmentDef
): { created: boolean; added: boolean } {
  const filePath = joinPath(modelsDir, `${exploreName}.yml`);
  const fileExists = existsSync(filePath);

  let yamlData: YAMLExploreDef;

  if (fileExists) {
    const content = readFileSync(filePath, "utf-8");
    yamlData = yaml.load(content) as YAMLExploreDef;
  } else {
    yamlData = {
      version: 1,
      explore: exploreName,
      base: exploreName,
      dimensions: [],
      measures: [],
      segments: [],
    };
  }

  if (!yamlData.segments) {
    yamlData.segments = [];
  }

  const existingNames = new Set(
    yamlData.segments.map((s) => s.name.toLowerCase())
  );

  if (existingNames.has(segment.name.toLowerCase())) {
    return { created: !fileExists, added: false };
  }

  yamlData.segments.push({
    name: segment.name,
    sql: segment.sql,
  });

  saveModel(modelsDir, exploreName, yamlData);
  return { created: !fileExists, added: true };
}

/**
 * Removes a segment from a model
 */
export function removeSegment(
  modelsDir: string,
  exploreName: string,
  segmentName: string
): boolean {
  const yamlData = loadModel(modelsDir, exploreName);
  if (!yamlData || !yamlData.segments) return false;

  const initialLength = yamlData.segments.length;
  yamlData.segments = yamlData.segments.filter(
    (s) => s.name.toLowerCase() !== segmentName.toLowerCase()
  );

  if (yamlData.segments.length === initialLength) {
    return false;
  }

  saveModel(modelsDir, exploreName, yamlData);
  return true;
}
