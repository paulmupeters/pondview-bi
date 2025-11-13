import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export interface SourceConnectionConfig {
  type: string;
  identifier: string;
  alias?: string;
  readOnly?: boolean;
  duckdbExtension?: string;
}

interface YAMLSourceRecord {
  name: string;
  table: string;
  connection?: SourceConnectionConfig;
}

interface YAMLSourcesDef {
  version: number;
  sources: YAMLSourceRecord[];
}

export interface SourceEntry {
  name: string;
  table: string;
  connection?: SourceConnectionConfig;
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
  const existingSourceNames = new Map(
    yamlData.sources.map((s) => [s.name.toLowerCase(), s] as const)
  );

  // Add new sources (skip duplicates by name, but update metadata)
  for (const source of sources) {
    const key = source.name.toLowerCase();
    const connection =
      source.connection && source.connection.identifier
        ? {
            type: source.connection.type,
            identifier: source.connection.identifier,
            alias: source.connection.alias,
            readOnly: source.connection.readOnly,
            duckdbExtension: source.connection.duckdbExtension,
          }
        : undefined;

    if (!existingSourceNames.has(key)) {
      yamlData.sources.push({
        name: source.name,
        table: source.table,
        connection,
      });
      existingSourceNames.set(key, yamlData.sources[yamlData.sources.length - 1]);
      addedSources++;
    } else {
      const record = existingSourceNames.get(key);
      if (record) {
        record.table = source.table;
        record.connection = connection;
      }
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
  type?: string;
  databasePath?: string;
  attachAs?: string;
  readOnly?: boolean;
  duckdbExtension?: string;
}

export function connectedTableToSources(
  input: ConnectedTableInput
): SourceEntry[] {
  const sources: SourceEntry[] = [];

  // Case 1: Single table with optional schema
  if (input.table) {
    const schema = input.schema || "main";
    const tableName = input.table;
    const connection = buildConnectionConfig(input, schema);

    // Use just the table name as the source name for readability
    sources.push({
      name: tableName,
      table: `${schema}.${tableName}`,
      connection,
    });
  }
  // Case 2: Schema with multiple tables
  else if (input.schema && input.tables && input.tables.length > 0) {
    for (const tableName of input.tables) {
      const connection = buildConnectionConfig(input, input.schema);
      sources.push({
        name: tableName,
        table: `${input.schema}.${tableName}`,
        connection,
      });
    }
  }

  return sources;
}

function buildConnectionConfig(
  input: ConnectedTableInput,
  defaultAlias: string
): SourceConnectionConfig | undefined {
  if (!input.type || !input.databasePath) {
    return undefined;
  }

  return {
    type: input.type,
    identifier: input.databasePath,
    alias: input.attachAs || defaultAlias,
    readOnly: input.readOnly,
    duckdbExtension: input.duckdbExtension,
  };
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
