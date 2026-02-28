import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export interface SourceConnectionConfig {
  type: string;
  /** @deprecated Use `connectionId` for new connections. Kept for backward compatibility. */
  identifier?: string;
  /** Opaque key that maps to a credential stored in `.env.local`. */
  connectionId?: string;
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

export interface ConnectedTableInput {
  table?: string;
  schema?: string;
  tables?: string[];
  type?: string;
  /** Raw credential string – only used transiently, never persisted to YAML. */
  databasePath?: string;
  /** Opaque key referencing a credential in `.env.local`. */
  connectionId?: string;
  attachAs?: string;
  readOnly?: boolean;
  duckdbExtension?: string;
}

export function updateSources(
  modelsDir: string,
  sources: SourceEntry[],
): { created: boolean; addedSources: number } {
  const filePath = join(modelsDir, "sources.yml");
  const fileExists = existsSync(filePath);

  let yamlData: YAMLSourcesDef;
  if (fileExists) {
    const content = readFileSync(filePath, "utf-8");
    yamlData = yaml.load(content) as YAMLSourcesDef;
    if (!yamlData.sources) {
      yamlData.sources = [];
    }
  } else {
    yamlData = {
      version: 1,
      sources: [],
    };
  }

  let addedSources = 0;
  const existingSourceNames = new Map(
    yamlData.sources.map(
      (source) => [source.name.toLowerCase(), source] as const,
    ),
  );

  for (const source of sources) {
    const key = source.name.toLowerCase();
    const hasConnectionInfo =
      source.connection?.connectionId || source.connection?.identifier;
    const connection = hasConnectionInfo
      ? {
          type: source.connection!.type,
          ...(source.connection!.connectionId
            ? { connectionId: source.connection!.connectionId }
            : {}),
          ...(source.connection!.identifier
            ? { identifier: source.connection!.identifier }
            : {}),
          alias: source.connection!.alias,
          readOnly: source.connection!.readOnly,
          duckdbExtension: source.connection!.duckdbExtension,
        }
      : undefined;

    if (!existingSourceNames.has(key)) {
      yamlData.sources.push({
        name: source.name,
        table: source.table,
        connection,
      });
      existingSourceNames.set(
        key,
        yamlData.sources[yamlData.sources.length - 1],
      );
      addedSources++;
    } else {
      const existing = existingSourceNames.get(key);
      if (existing) {
        existing.table = source.table;
        existing.connection = connection;
      }
    }
  }

  const yamlContent = yaml.dump(yamlData, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
  writeFileSync(filePath, yamlContent, "utf-8");

  return {
    created: !fileExists,
    addedSources,
  };
}

export function connectedTableToSources(
  input: ConnectedTableInput,
): SourceEntry[] {
  const sources: SourceEntry[] = [];

  if (input.table) {
    const schema = input.schema || "main";
    const tableName = input.table;
    sources.push({
      name: tableName,
      table: `${schema}.${tableName}`,
      connection: buildConnectionConfig(input, schema),
    });
  } else if (input.schema && input.tables && input.tables.length > 0) {
    for (const tableName of input.tables) {
      sources.push({
        name: tableName,
        table: `${input.schema}.${tableName}`,
        connection: buildConnectionConfig(input, input.schema),
      });
    }
  }

  return sources;
}

export function updateSourcesFromConnectedTable(
  modelsDir: string,
  input: ConnectedTableInput,
): { created: boolean; addedSources: number } {
  const sources = connectedTableToSources(input);
  return updateSources(modelsDir, sources);
}

function buildConnectionConfig(
  input: ConnectedTableInput,
  defaultAlias: string,
): SourceConnectionConfig | undefined {
  if (!input.type) {
    return undefined;
  }
  // Prefer connectionId (new path) over raw databasePath (legacy path)
  if (!input.connectionId && !input.databasePath) {
    return undefined;
  }
  return {
    type: input.type,
    ...(input.connectionId ? { connectionId: input.connectionId } : {}),
    // Only write identifier when there is no connectionId (legacy fallback)
    ...(!input.connectionId && input.databasePath
      ? { identifier: input.databasePath }
      : {}),
    alias: input.attachAs || defaultAlias,
    readOnly: input.readOnly,
    duckdbExtension: input.duckdbExtension,
  };
}
