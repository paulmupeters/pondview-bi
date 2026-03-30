import { describe, expect, test } from "bun:test";
import {
  applyPendingSqlLoad,
  findSavedQueryNameConflict,
} from "@/components/chat/hooks/use-sql-repl";

describe("sql repl helpers", () => {
  test("applies queued SQL to the console and optionally auto-runs it", () => {
    const calls: string[] = [];
    const api = {
      clearResults: () => calls.push("clear"),
      setQuery: (sql: string) => calls.push(`set:${sql}`),
      focus: () => calls.push("focus"),
      runQuery: () => calls.push("run"),
    };

    const remaining = applyPendingSqlLoad({
      pending: {
        sql: "select 1",
        autorun: true,
      },
      api,
      requestAnimationFrame: (callback) => {
        callback(0);
        return 1;
      },
    });

    expect(remaining).toBeNull();
    expect(calls).toEqual(["clear", "set:select 1", "focus", "run"]);
  });

  test("finds saved-query name conflicts case-insensitively", () => {
    const queries = [
      {
        id: "query-1",
        name: "Revenue by Region",
        sql: "select 1",
      },
      {
        id: "query-2",
        name: "Active Users",
        sql: "select 2",
      },
    ];

    expect(
      findSavedQueryNameConflict(queries as never, " revenue by region "),
    )?.toMatchObject({
      id: "query-1",
    });
    expect(
      findSavedQueryNameConflict(
        queries as never,
        "Revenue by Region",
        "query-1",
      ),
    ).toBeUndefined();
  });
});
