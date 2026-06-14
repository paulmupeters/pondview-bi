import {
  dedupeJoinDefinitions,
  type JoinDefinition,
  type JoinKind,
} from "@/lib/joins/graph";

export const DASHBOARD_JOIN_DEFS_STORAGE_KEY = "bi.dashboard.joinDefs.v1";

const isClient = typeof window !== "undefined";

type JoinRecordCandidate = {
  leftTable?: unknown;
  left_table?: unknown;
  leftColumn?: unknown;
  left_column?: unknown;
  rightTable?: unknown;
  right_table?: unknown;
  rightColumn?: unknown;
  right_column?: unknown;
  type?: unknown;
};

export function readJoinDefsFromStorage(): JoinDefinition[] {
  if (!isClient) {
    return [];
  }

  const raw = window.localStorage.getItem(DASHBOARD_JOIN_DEFS_STORAGE_KEY);
  if (!raw?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return parseJoinDefsPayload(parsed);
  } catch (error) {
    console.error(
      "[joinDefs] Failed to parse join definitions from storage",
      error,
    );
    return [];
  }
}

export function readJoinDefsRawFromStorage(): string {
  if (!isClient) {
    return "[]";
  }
  return window.localStorage.getItem(DASHBOARD_JOIN_DEFS_STORAGE_KEY) ?? "[]";
}

export function saveJoinDefsRawToStorage(raw: string): JoinDefinition[] {
  const parsed = JSON.parse(raw);
  const joinDefs = parseJoinDefsPayload(parsed);
  if (isClient) {
    window.localStorage.setItem(
      DASHBOARD_JOIN_DEFS_STORAGE_KEY,
      formatJoinDefsForStorage(joinDefs),
    );
  }
  return joinDefs;
}

export function clearJoinDefsInStorage(): void {
  if (!isClient) {
    return;
  }
  window.localStorage.removeItem(DASHBOARD_JOIN_DEFS_STORAGE_KEY);
}

export function formatJoinDefsForStorage(joinDefs: JoinDefinition[]): string {
  const normalized = dedupeJoinDefinitions(joinDefs).map((joinDef) => ({
    leftTable: joinDef.leftTable,
    leftColumn: joinDef.leftColumn,
    rightTable: joinDef.rightTable,
    rightColumn: joinDef.rightColumn,
    type: normalizeJoinKind(joinDef.type),
  }));
  return JSON.stringify(normalized, null, 2);
}

export function parseJoinDefsPayload(payload: unknown): JoinDefinition[] {
  if (!Array.isArray(payload)) {
    throw new Error("Join definitions must be a JSON array.");
  }

  const normalized = payload
    .map((candidate) => normalizeJoinRecord(candidate as JoinRecordCandidate))
    .filter((entry): entry is JoinDefinition => entry !== null);

  return dedupeJoinDefinitions(normalized);
}

function normalizeJoinRecord(
  candidate: JoinRecordCandidate,
): JoinDefinition | null {
  const leftTable = toTrimmedString(
    candidate.leftTable ?? candidate.left_table,
  );
  const leftColumn = toTrimmedString(
    candidate.leftColumn ?? candidate.left_column,
  );
  const rightTable = toTrimmedString(
    candidate.rightTable ?? candidate.right_table,
  );
  const rightColumn = toTrimmedString(
    candidate.rightColumn ?? candidate.right_column,
  );

  if (!leftTable || !leftColumn || !rightTable || !rightColumn) {
    return null;
  }

  return {
    leftTable,
    leftColumn,
    rightTable,
    rightColumn,
    type: normalizeJoinKind(candidate.type),
  };
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeJoinKind(raw: unknown): JoinKind {
  if (raw === "left" || raw === "inner" || raw === "right" || raw === "full") {
    return raw;
  }
  return "left";
}
