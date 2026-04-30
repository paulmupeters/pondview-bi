import { describe, expect, test } from "bun:test";
import {
  createSqlIntentSwitchPatch,
  getSqlIntentDraftSignature,
  shouldShowSqlIntentPopover,
} from "@/features/analysis/sql-intent";

describe("SqlCell SQL intent prompt", () => {
  test("shows the suggestion for SQL-like prompts in chat mode", () => {
    expect(getSqlIntentDraftSignature("SELECT * FROM orders")).toBe(
      "SELECT * FROM orders",
    );
    expect(
      shouldShowSqlIntentPopover({
        promptDraft: "SELECT * FROM orders",
        isChatMode: true,
        isAssistantThinking: false,
        dismissedDraftSignature: null,
      }),
    ).toBe(true);
  });

  test("does not show the suggestion for non-SQL prompts", () => {
    expect(getSqlIntentDraftSignature("show weekly revenue by customer")).toBe(
      null,
    );
    expect(
      shouldShowSqlIntentPopover({
        promptDraft: "show weekly revenue by customer",
        isChatMode: true,
        isAssistantThinking: false,
        dismissedDraftSignature: null,
      }),
    ).toBe(false);
  });

  test("does not show the suggestion in SQL mode", () => {
    expect(
      shouldShowSqlIntentPopover({
        promptDraft: "SELECT * FROM orders",
        isChatMode: false,
        isAssistantThinking: false,
        dismissedDraftSignature: null,
      }),
    ).toBe(false);
  });

  test("creates the expected SQL switch patch for SQL-like prompts", () => {
    expect(createSqlIntentSwitchPatch("SELECT * FROM orders")).toEqual({
      promptText: "",
      sqlDraft: "SELECT * FROM orders",
    });
  });
});
