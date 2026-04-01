import { describe, expect, test } from "bun:test";
import {
  deriveTitleFromInput,
  parsePartsOrFallback,
  toPromptErrorMessage,
  toUiMessages,
} from "@/components/chat/hooks/chat-session-utils";

describe("chat session helpers", () => {
  test("derives a short title from the first prompt", () => {
    expect(deriveTitleFromInput("   ")).toBeNull();
    expect(deriveTitleFromInput("Short title")).toBe("Short title");
    expect(
      deriveTitleFromInput("This title is definitely longer than twenty chars"),
    ).toBe("This title is defini...");
  });

  test("normalizes provider and network prompt errors", () => {
    expect(toPromptErrorMessage(new Error("Missing API key"))).toContain(
      "Missing AI configuration",
    );
    expect(toPromptErrorMessage(new Error("Failed to fetch"))).toContain(
      "Cannot reach",
    );
  });

  test("hydrates UI messages from stored rows and falls back to text content", () => {
    const rows = [
      {
        id: "message-1",
        role: "user",
        content: "hello",
        parts: null,
      },
      {
        id: "message-2",
        role: "assistant",
        content: "ignored",
        parts: JSON.stringify([{ type: "text", text: "structured" }]),
      },
    ];

    expect(parsePartsOrFallback(undefined, "fallback")).toEqual([
      { type: "text", text: "fallback" },
    ]);
    expect(toUiMessages(rows as never)).toEqual([
      {
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
      {
        id: "message-2",
        role: "assistant",
        parts: [{ type: "text", text: "structured" }],
      },
    ]);
  });

  test("drops unsupported tool parts during hydration", () => {
    expect(
      parsePartsOrFallback(
        JSON.stringify([
          { type: "text", text: "hello" },
          {
            type: "tool-readSkillsMd",
            toolCallId: "tool-1",
            state: "input-available",
            input: {},
          },
          {
            type: "tool-read_skills_md",
            toolCallId: "tool-2",
            state: "input-available",
            input: {},
          },
          {
            type: "tool-execute_exploratory_sql",
            toolCallId: "tool-3",
            state: "output-available",
            input: { sql: "select 1" },
            output: { sql: "select 1" },
          },
        ]),
        "fallback",
      ),
    ).toEqual([
      { type: "text", text: "hello" },
      {
        type: "tool-read_skills_md",
        toolCallId: "tool-2",
        state: "input-available",
        input: {},
      },
      {
        type: "tool-execute_exploratory_sql",
        toolCallId: "tool-3",
        state: "output-available",
        input: { sql: "select 1" },
        output: { sql: "select 1" },
      },
    ]);
  });
});
