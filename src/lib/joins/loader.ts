import { promises as fs } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export type JoinKind = "inner" | "left" | "right" | "full";

export interface JoinDefinition {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  type?: JoinKind;
}

type JoinYamlRecord = {
  leftTable?: string;
  left_table?: string;
  leftColumn?: string;
  left_column?: string;
  rightTable?: string;
  right_table?: string;
  rightColumn?: string;
  right_column?: string;
  type?: string;
};

type JoinYamlFile = {
  version?: number;
  joins?: JoinYamlRecord[];
};

export interface JoinPathStep {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: JoinKind;
  source: JoinDefinition;
}

const DEFAULT_JOINS_PATH = join(process.cwd(), "semantic-layer", "joins.yml");

export async function loadJoinDefs(
  joinsPath = DEFAULT_JOINS_PATH
): Promise<JoinDefinition[]> {
  try {
    const content = await fs.readFile(joinsPath, "utf-8");
    const yamlData = yaml.load(content) as JoinYamlFile;
    const joins = yamlData?.joins ?? [];

    const normalized = joins
      .map(normalizeJoinRecord)
      .filter((entry): entry is JoinDefinition => entry !== null);

    return dedupeJoinDefinitions(normalized);
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

export function findJoinPath(
  fromTable: string,
  toTable: string,
  joins: JoinDefinition[]
): JoinPathStep[] | null {
  const fromCanonical = canonicalTable(fromTable);
  const toCanonical = canonicalTable(toTable);

  if (!fromCanonical || !toCanonical) {
    return null;
  }
  if (fromCanonical === toCanonical) {
    return [];
  }

  const queue: Array<{ table: string; path: JoinPathStep[] }> = [
    { table: fromCanonical, path: [] },
  ];
  const visited = new Set<string>([fromCanonical]);
  const graph = buildGraph(joins);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const edges = graph.get(current.table) ?? [];
    for (const step of edges) {
      if (visited.has(step.toTable)) {
        continue;
      }
      const nextPath = [...current.path, step];
      if (step.toTable === toCanonical) {
        return nextPath;
      }
      visited.add(step.toTable);
      queue.push({ table: step.toTable, path: nextPath });
    }
  }

  return null;
}

export function canonicalTable(input: string): string {
  const unquoted = input.replace(/["`]/g, "").trim();
  if (!unquoted) {
    return "";
  }
  const parts = unquoted.split(".");
  return parts[parts.length - 1]?.toLowerCase().trim() ?? "";
}

function normalizeJoinRecord(record: JoinYamlRecord): JoinDefinition | null {
  const leftTable = record.leftTable ?? record.left_table;
  const leftColumn = record.leftColumn ?? record.left_column;
  const rightTable = record.rightTable ?? record.right_table;
  const rightColumn = record.rightColumn ?? record.right_column;

  if (!leftTable || !leftColumn || !rightTable || !rightColumn) {
    return null;
  }

  return {
    leftTable,
    leftColumn,
    rightTable,
    rightColumn,
    type: normalizeJoinType(record.type),
  };
}

function normalizeJoinType(value: string | undefined): JoinKind {
  const normalized = value?.toLowerCase().trim();
  if (
    normalized === "inner" ||
    normalized === "left" ||
    normalized === "right" ||
    normalized === "full"
  ) {
    return normalized;
  }
  return "left";
}

function buildGraph(joins: JoinDefinition[]): Map<string, JoinPathStep[]> {
  const graph = new Map<string, JoinPathStep[]>();

  for (const joinDef of joins) {
    const leftTable = canonicalTable(joinDef.leftTable);
    const rightTable = canonicalTable(joinDef.rightTable);
    if (!leftTable || !rightTable) {
      continue;
    }

    addEdge(graph, leftTable, {
      fromTable: leftTable,
      fromColumn: joinDef.leftColumn,
      toTable: rightTable,
      toColumn: joinDef.rightColumn,
      type: joinDef.type ?? "left",
      source: joinDef,
    });

    addEdge(graph, rightTable, {
      fromTable: rightTable,
      fromColumn: joinDef.rightColumn,
      toTable: leftTable,
      toColumn: joinDef.leftColumn,
      type: reverseJoinType(joinDef.type ?? "left"),
      source: joinDef,
    });
  }

  return graph;
}

function addEdge(
  graph: Map<string, JoinPathStep[]>,
  table: string,
  step: JoinPathStep
): void {
  const existing = graph.get(table);
  if (existing) {
    existing.push(step);
  } else {
    graph.set(table, [step]);
  }
}

function reverseJoinType(type: JoinKind): JoinKind {
  if (type === "left") {
    return "right";
  }
  if (type === "right") {
    return "left";
  }
  return type;
}

function dedupeJoinDefinitions(joins: JoinDefinition[]): JoinDefinition[] {
  const unique = new Map<string, JoinDefinition>();
  for (const joinDef of joins) {
    const key = [
      canonicalTable(joinDef.leftTable),
      joinDef.leftColumn.toLowerCase(),
      canonicalTable(joinDef.rightTable),
      joinDef.rightColumn.toLowerCase(),
      joinDef.type ?? "left",
    ].join("|");
    unique.set(key, joinDef);
  }
  return Array.from(unique.values());
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
