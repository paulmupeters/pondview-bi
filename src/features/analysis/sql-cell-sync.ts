import type { WorkspaceAnalysisCellStatus } from "@/lib/workspace/workspace-db";

type SqlVisualType = "table" | "chart" | "card";
type NoticeKind = "error" | "warning" | null;

export function normalizeSqlDraft(sql: string): string | null {
  return sql.trim().length > 0 ? sql : null;
}

export function shouldPersistSqlDraftChange(input: {
  nextSql: string;
  persistedSql: string | null;
  hasSeenInitialQuery: boolean;
}): boolean {
  if (!input.hasSeenInitialQuery) {
    return false;
  }

  return normalizeSqlDraft(input.nextSql) !== input.persistedSql;
}

export function resolveCellStatusFromRunState(input: {
  isRunning: boolean;
  previousIsRunning: boolean | null;
  runSucceeded: boolean;
  noticeKind: NoticeKind;
}): WorkspaceAnalysisCellStatus | null {
  if (input.previousIsRunning === null) {
    return null;
  }

  if (input.previousIsRunning === input.isRunning) {
    return null;
  }

  if (input.isRunning) {
    return "running";
  }

  if (input.runSucceeded) {
    return null;
  }

  return input.noticeKind === "error" ? "error" : "idle";
}

export function shouldPersistVisualTypeChange(input: {
  nextVisualType: SqlVisualType;
  persistedVisualType: SqlVisualType | undefined;
}): boolean {
  return input.persistedVisualType !== input.nextVisualType;
}
