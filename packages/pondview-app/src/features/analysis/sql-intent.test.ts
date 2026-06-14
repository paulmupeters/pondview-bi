import { describe, expect, test } from "bun:test";
import {
  createSqlIntentSwitchPatch,
  getSqlIntentDraftSignature,
  looksLikeSqlIntent,
  shouldShowSqlIntentPopover,
} from "@/features/analysis/sql-intent";

describe("looksLikeSqlIntent", () => {
  test("matches supported leading SQL keywords", () => {
    expect(looksLikeSqlIntent("SELECT * FROM orders")).toBe(true);
    expect(looksLikeSqlIntent("SELECT 1")).toBe(true);
    expect(
      looksLikeSqlIntent("WITH revenue AS (SELECT 1) SELECT * FROM revenue"),
    ).toBe(true);
    expect(looksLikeSqlIntent("INSERT INTO orders VALUES (1)")).toBe(true);
    expect(looksLikeSqlIntent("UPDATE orders SET total = 5")).toBe(true);
    expect(looksLikeSqlIntent("DELETE FROM orders")).toBe(true);
    expect(looksLikeSqlIntent("CREATE TABLE orders (id INT)")).toBe(true);
    expect(looksLikeSqlIntent("ALTER TABLE orders ADD COLUMN total INT")).toBe(
      true,
    );
    expect(looksLikeSqlIntent("DROP TABLE orders")).toBe(true);
    expect(looksLikeSqlIntent("EXPLAIN SELECT * FROM orders")).toBe(true);
  });

  test("matches mixed case input with leading whitespace", () => {
    expect(looksLikeSqlIntent("   select * from orders")).toBe(true);
    expect(
      looksLikeSqlIntent(
        "\n\tWiTh revenue as (select 1) select * from revenue",
      ),
    ).toBe(true);
  });

  test("does not match natural language prompts containing SQL words later", () => {
    expect(looksLikeSqlIntent("can you write a select query for me")).toBe(
      false,
    );
    expect(looksLikeSqlIntent("create a chart of revenue")).toBe(false);
    expect(looksLikeSqlIntent("create a")).toBe(false);
    expect(looksLikeSqlIntent("CREATE")).toBe(false);
    expect(looksLikeSqlIntent("please explain this SQL statement")).toBe(false);
    expect(looksLikeSqlIntent("show me the orders table")).toBe(false);
  });

  test("creates stable draft signatures only for SQL intent", () => {
    expect(getSqlIntentDraftSignature("  SELECT * FROM orders  ")).toBe(
      "SELECT * FROM orders",
    );
    expect(
      getSqlIntentDraftSignature("can you write a select query for me"),
    ).toBeNull();
  });

  test("shows the popover only when chat mode has undismissed SQL intent", () => {
    expect(
      shouldShowSqlIntentPopover({
        promptDraft: "SELECT * FROM orders",
        isChatMode: true,
        isAssistantThinking: false,
        dismissedDraftSignature: null,
      }),
    ).toBe(true);

    expect(
      shouldShowSqlIntentPopover({
        promptDraft: "SELECT * FROM orders",
        isChatMode: false,
        isAssistantThinking: false,
        dismissedDraftSignature: null,
      }),
    ).toBe(false);

    expect(
      shouldShowSqlIntentPopover({
        promptDraft: "SELECT * FROM orders",
        isChatMode: true,
        isAssistantThinking: true,
        dismissedDraftSignature: null,
      }),
    ).toBe(false);

    expect(
      shouldShowSqlIntentPopover({
        promptDraft: "SELECT * FROM orders",
        isChatMode: true,
        isAssistantThinking: false,
        dismissedDraftSignature: "SELECT * FROM orders",
      }),
    ).toBe(false);
  });

  test("keeps the suggestion dismissed while the draft stays SQL-like", () => {
    expect(
      shouldShowSqlIntentPopover({
        promptDraft: "SELECT * FROM orders",
        isChatMode: true,
        isAssistantThinking: false,
        dismissedDraftSignature: "SELECT * FROM orders",
      }),
    ).toBe(false);

    expect(
      shouldShowSqlIntentPopover({
        promptDraft: "show me the orders table",
        isChatMode: true,
        isAssistantThinking: false,
        dismissedDraftSignature: "SELECT * FROM orders",
      }),
    ).toBe(false);

    expect(
      shouldShowSqlIntentPopover({
        promptDraft: "SELECT * FROM customers",
        isChatMode: true,
        isAssistantThinking: false,
        dismissedDraftSignature: "SELECT * FROM orders",
      }),
    ).toBe(false);
  });

  test("allows the suggestion to reappear after SQL intent is reset", () => {
    expect(
      shouldShowSqlIntentPopover({
        promptDraft: "SELECT * FROM customers",
        isChatMode: true,
        isAssistantThinking: false,
        dismissedDraftSignature: null,
      }),
    ).toBe(true);
  });

  test("creates the SQL switch patch without autorun behavior", () => {
    expect(createSqlIntentSwitchPatch("SELECT * FROM orders")).toEqual({
      promptText: "",
      sqlDraft: "SELECT * FROM orders",
    });
    expect(createSqlIntentSwitchPatch("   ")).toBeNull();
  });
});
