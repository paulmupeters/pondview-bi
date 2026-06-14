import { describe, expect, test } from "bun:test";
import {
  getAnalysisPostBootstrapHref,
  resolveAnalysisBootstrapIntent,
} from "@/features/analysis/analysis-bootstrap";

describe("analysis bootstrap", () => {
  test("parses AI prompt bootstrap intents from q", () => {
    const intent = resolveAnalysisBootstrapIntent(
      new URLSearchParams({
        id: "notebook-1",
        mode: "ai",
        q: "Show weekly revenue",
      }),
    );

    expect(intent).toEqual({
      mode: "ai",
      prompt: "Show weekly revenue",
      sql: null,
      autorun: false,
    });
  });

  test("parses manual SQL autorun intents from sql", () => {
    const intent = resolveAnalysisBootstrapIntent(
      new URLSearchParams({
        id: "notebook-1",
        mode: "manual",
        sql: "select 1;",
        autorun: "1",
      }),
    );

    expect(intent).toEqual({
      mode: "manual",
      prompt: null,
      sql: "select 1;",
      autorun: true,
    });
  });

  test("parses mode-only manual bootstraps", () => {
    const intent = resolveAnalysisBootstrapIntent(
      new URLSearchParams({
        id: "notebook-1",
        mode: "manual",
      }),
    );

    expect(intent).toEqual({
      mode: "manual",
      prompt: null,
      sql: null,
      autorun: false,
    });
  });

  test("returns null when no bootstrap params are present", () => {
    expect(
      resolveAnalysisBootstrapIntent(
        new URLSearchParams({
          id: "notebook-1",
        }),
      ),
    ).toBeNull();
  });

  test("builds the post-bootstrap analysis href with only the notebook id", () => {
    expect(getAnalysisPostBootstrapHref("notebook:1")).toBe(
      "/analysis?id=notebook%3A1",
    );
  });
});
