import { promises as fs } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import {
  type JoinDefinition,
  type JoinKind,
  type JoinPathStep,
  dedupeJoinDefinitions,
} from "@/lib/joins/graph";

export type { JoinDefinition, JoinKind, JoinPathStep } from "@/lib/joins/graph";
export { canonicalTable, findJoinPath } from "@/lib/joins/graph";

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


function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
