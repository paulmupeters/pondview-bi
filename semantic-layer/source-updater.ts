import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

interface YAMLSourcesDef {
  version: number;
  sources: Array<{
    name: string;
    table: string;
  }>;
}

export interface SourceEntry {
  name: string;
  table: string;
}

/**
 * Updates or creates the sources.yml file with new source entries.
 * Skips sources that already exist (by name).
 *
 * @param modelsDir - Path to the models directory (e.g., 'semantic-layer/models')
 * @param sources - Array of source entries to add
 * @returns Information about what was updated
 */
export function updateSources(
  modelsDir: string,
  sources: SourceEntry[]
): { created: boolean; addedSources: number } {
  const filePath = join(modelsDir, "sources.yml");
  const fileExists = existsSync(filePath);

  let yamlData: YAMLSourcesDef;

  if (fileExists) {
    // Load existing sources
    const content = readFileSync(filePath, "utf-8");
    yamlData = yaml.load(content) as YAMLSourcesDef;

    // Ensure sources array exists
    if (!yamlData.sources) {
      yamlData.sources = [];
    }
  } else {
    // Create new sources structure
    yamlData = {
      version: 1,
      sources: [],
    };
  }

  // Track what we're adding
  let addedSources = 0;

  // Get existing source names (case-insensitive)
  const existingSourceNames = new Set(
    yamlData.sources.map((s) => s.name.toLowerCase())
  );

  // Add new sources (skip duplicates by name)
  for (const source of sources) {
    if (!existingSourceNames.has(source.name.toLowerCase())) {
      yamlData.sources.push({
        name: source.name,
        table: source.table,
      });
      addedSources++;
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
    addedSources,
  };
}

/**
 * Converts a ConnectedTable-like entry to source entries for sources.yml
 */
export interface ConnectedTableInput {
  table?: string;
  schema?: string;
  tables?: string[];
}

export function connectedTableToSources(
  input: ConnectedTableInput
): SourceEntry[] {
  const sources: SourceEntry[] = [];

  // Case 1: Single table with optional schema
  if (input.table) {
    const schema = input.schema || "main";
    const tableName = input.table;

    // Use just the table name as the source name for readability
    sources.push({
      name: tableName,
      table: `${schema}.${tableName}`,
    });
  }
  // Case 2: Schema with multiple tables
  else if (input.schema && input.tables && input.tables.length > 0) {
    for (const tableName of input.tables) {
      sources.push({
        name: tableName,
        table: `${input.schema}.${tableName}`,
      });
    }
  }

  return sources;
}

/**
 * Convenience function that combines conversion and update
 */
export function updateSourcesFromConnectedTable(
  modelsDir: string,
  input: ConnectedTableInput
): { created: boolean; addedSources: number } {
  const sources = connectedTableToSources(input);
  return updateSources(modelsDir, sources);
}
