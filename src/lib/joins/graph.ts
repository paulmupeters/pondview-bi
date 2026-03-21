export type JoinKind = "inner" | "left" | "right" | "full";

export interface JoinDefinition {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  type?: JoinKind;
}

export interface JoinPathStep {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: JoinKind;
  source: JoinDefinition;
}

export function findJoinPath(
  fromTable: string,
  toTable: string,
  joins: JoinDefinition[],
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

export function dedupeJoinDefinitions(
  joins: JoinDefinition[],
): JoinDefinition[] {
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
  step: JoinPathStep,
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
