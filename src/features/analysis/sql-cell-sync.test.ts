import { describe, expect, test } from "bun:test";
import {
  isSqlResultStale,
  normalizeSqlDraft,
  resolveCellStatusFromRunState,
  shouldPersistSqlDraftChange,
  shouldPersistVisualTypeChange,
} from "@/features/analysis/sql-cell-sync";

describe("sql cell sync", () => {
  test("ignores the initial empty query callback during hydration", () => {
    expect(
      shouldPersistSqlDraftChange({
        nextSql: "",
        persistedSql: "select 1;",
        hasSeenInitialQuery: false,
      }),
    ).toBe(false);
  });

  test("skips query persistence when the SQL draft is unchanged", () => {
    expect(
      shouldPersistSqlDraftChange({
        nextSql: "select 1;",
        persistedSql: "select 1;",
        hasSeenInitialQuery: true,
      }),
    ).toBe(false);
  });

  test("persists query changes after hydration completes", () => {
    expect(
      shouldPersistSqlDraftChange({
        nextSql: "select 2;",
        persistedSql: "select 1;",
        hasSeenInitialQuery: true,
      }),
    ).toBe(true);
  });

  test("normalizes blank drafts to null", () => {
    expect(normalizeSqlDraft("   ")).toBeNull();
  });

  test("ignores the initial run-state notification on mount", () => {
    expect(
      resolveCellStatusFromRunState({
        isRunning: false,
        previousIsRunning: null,
        runSucceeded: false,
        noticeKind: null,
      }),
    ).toBeNull();
  });

  test("marks the cell as running when a run starts", () => {
    expect(
      resolveCellStatusFromRunState({
        isRunning: true,
        previousIsRunning: false,
        runSucceeded: false,
        noticeKind: null,
      }),
    ).toBe("running");
  });

  test("restores idle when a run stops without success or errors", () => {
    expect(
      resolveCellStatusFromRunState({
        isRunning: false,
        previousIsRunning: true,
        runSucceeded: false,
        noticeKind: null,
      }),
    ).toBe("idle");
  });

  test("restores error when a failed run stops", () => {
    expect(
      resolveCellStatusFromRunState({
        isRunning: false,
        previousIsRunning: true,
        runSucceeded: false,
        noticeKind: "error",
      }),
    ).toBe("error");
  });

  test("skips completion persistence when success already handled the state", () => {
    expect(
      resolveCellStatusFromRunState({
        isRunning: false,
        previousIsRunning: true,
        runSucceeded: true,
        noticeKind: null,
      }),
    ).toBeNull();
  });

  test("skips visual type persistence when it is already stored", () => {
    expect(
      shouldPersistVisualTypeChange({
        nextVisualType: "card",
        persistedVisualType: "card",
      }),
    ).toBe(false);
  });

  test("marks persisted results as stale when the current draft changed", () => {
    expect(
      isSqlResultStale({
        currentSqlDraft: "select 2;",
        persistedResultQuery: "select 1;",
      }),
    ).toBe(true);
  });

  test("keeps persisted results current when the draft matches the result query", () => {
    expect(
      isSqlResultStale({
        currentSqlDraft: "select 1;",
        persistedResultQuery: "select 1;",
      }),
    ).toBe(false);
  });
});
