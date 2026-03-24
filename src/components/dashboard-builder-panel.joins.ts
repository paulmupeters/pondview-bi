import { nanoid } from "nanoid";
import { extractTableReferencesFromSql } from "@/lib/filters/parse-tables";
import {
  canonicalTable,
  dedupeJoinDefinitions,
  type JoinDefinition,
  type JoinKind,
} from "@/lib/joins/graph";

export type DetectedJoinTable = {
  tableName: string;
  rawReference: string;
  label: string;
};

export type JoinDraftClause = {
  id: string;
  leftColumn: string;
  rightColumn: string;
};

export type JoinDraftGroup = {
  id: string;
  leftTable: string;
  rightTable: string;
  type: JoinKind;
  clauses: JoinDraftClause[];
};

export function extractDetectedJoinTables(
  sqlStatements: Array<string | null | undefined>,
): DetectedJoinTable[] {
  const detected = new Map<string, DetectedJoinTable>();

  for (const sql of sqlStatements) {
    if (!sql?.trim()) {
      continue;
    }

    for (const ref of extractTableReferencesFromSql(sql)) {
      const tableName = canonicalTable(ref.tableName);
      if (!tableName || detected.has(tableName)) {
        continue;
      }

      detected.set(tableName, {
        tableName,
        rawReference: ref.rawReference,
        label: ref.rawReference || tableName,
      });
    }
  }

  return Array.from(detected.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function createEmptyJoinDraftClause(
  input: Partial<Pick<JoinDraftClause, "leftColumn" | "rightColumn">> = {},
): JoinDraftClause {
  return {
    id: nanoid(),
    leftColumn: input.leftColumn ?? "",
    rightColumn: input.rightColumn ?? "",
  };
}

export function createEmptyJoinDraftGroup(
  input: Partial<
    Pick<JoinDraftGroup, "leftTable" | "rightTable" | "type">
  > = {},
): JoinDraftGroup {
  return {
    id: nanoid(),
    leftTable: input.leftTable ?? "",
    rightTable: input.rightTable ?? "",
    type: input.type ?? "left",
    clauses: [createEmptyJoinDraftClause()],
  };
}

export function seedJoinDraftGroups(
  detectedTables: DetectedJoinTable[],
  joinDefs: JoinDefinition[],
): JoinDraftGroup[] {
  const detectedTableNames = new Set(
    detectedTables.map((table) => table.tableName),
  );
  const groups = new Map<string, JoinDraftGroup>();

  for (const joinDef of joinDefs) {
    const leftTable = canonicalTable(joinDef.leftTable);
    const rightTable = canonicalTable(joinDef.rightTable);
    if (
      !leftTable ||
      !rightTable ||
      !detectedTableNames.has(leftTable) ||
      !detectedTableNames.has(rightTable)
    ) {
      continue;
    }

    const joinType = joinDef.type ?? "left";
    const key = [leftTable, rightTable, joinType].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.clauses.push(
        createEmptyJoinDraftClause({
          leftColumn: joinDef.leftColumn,
          rightColumn: joinDef.rightColumn,
        }),
      );
      continue;
    }

    groups.set(key, {
      id: nanoid(),
      leftTable,
      rightTable,
      type: joinType,
      clauses: [
        createEmptyJoinDraftClause({
          leftColumn: joinDef.leftColumn,
          rightColumn: joinDef.rightColumn,
        }),
      ],
    });
  }

  return Array.from(groups.values());
}

export function flattenJoinDraftGroups(
  groups: JoinDraftGroup[],
): JoinDefinition[] {
  const joinDefs: JoinDefinition[] = [];

  for (const group of groups) {
    const leftTable = canonicalTable(group.leftTable);
    const rightTable = canonicalTable(group.rightTable);
    if (!leftTable || !rightTable) {
      continue;
    }

    for (const clause of group.clauses) {
      const leftColumn = clause.leftColumn.trim();
      const rightColumn = clause.rightColumn.trim();
      if (!leftColumn || !rightColumn) {
        continue;
      }

      joinDefs.push({
        leftTable,
        leftColumn,
        rightTable,
        rightColumn,
        type: group.type,
      });
    }
  }

  return dedupeJoinDefinitions(joinDefs);
}
