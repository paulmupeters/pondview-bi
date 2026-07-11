import { describe, expect, test } from "bun:test";
import {
  appendExplorerReferenceToPrompt,
  createBlankHomepageAnalysis,
  GENERIC_DATA_EXPLORATION_COMMANDS,
  getHomepageAiWarningMessage,
  runHomepageExampleCommand,
} from "@/app/page";

describe("createBlankHomepageAnalysis", () => {
  test("persists and opens a fresh AI notebook", async () => {
    const calls: string[] = [];

    const chatId = await createBlankHomepageAnalysis({
      createId: () => "analysis/id with spaces",
      persistChat: async (id, title) => {
        calls.push(`persist:${id}:${title}`);
      },
      navigate: (href) => {
        calls.push(`navigate:${href}`);
      },
    });

    expect(chatId).toBe("analysis/id with spaces");
    expect(calls).toEqual([
      "persist:analysis/id with spaces:Untitled analysis",
      "navigate:/analysis?id=analysis%2Fid%20with%20spaces&mode=ai",
    ]);
  });

  test("does not navigate when the notebook cannot be persisted", async () => {
    let navigated = false;

    await expect(
      createBlankHomepageAnalysis({
        createId: () => "new-analysis",
        persistChat: async () => {
          throw new Error("storage unavailable");
        },
        navigate: () => {
          navigated = true;
        },
      }),
    ).rejects.toThrow("storage unavailable");

    expect(navigated).toBe(false);
  });
});

describe("appendExplorerReferenceToPrompt", () => {
  test("adds a table reference to an empty prompt", () => {
    expect(appendExplorerReferenceToPrompt("", "main.orders")).toBe(
      "main.orders",
    );
  });

  test("separates an inserted table reference from existing prompt text", () => {
    expect(
      appendExplorerReferenceToPrompt("Summarize sales from", "main.orders"),
    ).toBe("Summarize sales from main.orders");
    expect(
      appendExplorerReferenceToPrompt("Summarize sales from ", "main.orders"),
    ).toBe("Summarize sales from main.orders");
  });

  test("ignores blank references", () => {
    expect(appendExplorerReferenceToPrompt("Summarize sales", "   ")).toBe(
      "Summarize sales",
    );
  });
});

describe("getHomepageAiWarningMessage", () => {
  test("shows the missing AI configuration warning on AI landing", () => {
    expect(
      getHomepageAiWarningMessage({
        mode: "ai",
        hasAiConfiguration: false,
      }),
    ).toBe(
      "Missing AI configuration. Open Settings and configure provider, API key, and model.",
    );
  });

  test("hides the warning when AI is configured or manual mode is active", () => {
    expect(
      getHomepageAiWarningMessage({
        mode: "ai",
        hasAiConfiguration: true,
      }),
    ).toBeNull();
    expect(
      getHomepageAiWarningMessage({
        mode: "manual",
        hasAiConfiguration: false,
      }),
    ).toBeNull();
  });
});

describe("runHomepageExampleCommand", () => {
  test("seeds sample data before submitting the example prompt", async () => {
    const calls: string[] = [];

    await runHomepageExampleCommand({
      command: "Show me trends of unicorns founded over the years in China",
      backendPreference: "duckdb-wasm",
      ensureSampleData: async () => {
        calls.push("seed");
        return {
          backend: "duckdb-wasm",
          dbIdentifier: "wasm:local",
          created: true,
          skipped: false,
        };
      },
      submit: (command) => {
        calls.push(`submit:${command}`);
      },
    });

    expect(calls).toEqual([
      "seed",
      "submit:Show me trends of unicorns founded over the years in China",
    ]);
  });

  test("submits a generic exploration prompt when tables already exist", async () => {
    const calls: string[] = [];

    await runHomepageExampleCommand({
      command: "Compare total unicorn valuation across countries",
      backendPreference: "bridge",
      ensureSampleData: async () => {
        calls.push("seed");
        return {
          backend: "bridge",
          dbIdentifier: undefined,
          created: false,
          skipped: true,
        };
      },
      submit: (command) => {
        calls.push(`submit:${command}`);
      },
    });

    expect(calls).toEqual([
      "seed",
      `submit:${GENERIC_DATA_EXPLORATION_COMMANDS[0]}`,
    ]);
  });

  test("preserves the clicked generic prompt when tables already exist", async () => {
    const calls: string[] = [];

    await runHomepageExampleCommand({
      command: GENERIC_DATA_EXPLORATION_COMMANDS[2],
      backendPreference: "bridge",
      ensureSampleData: async () => ({
        backend: "bridge",
        dbIdentifier: undefined,
        created: false,
        skipped: true,
      }),
      submit: (command) => {
        calls.push(`submit:${command}`);
      },
    });

    expect(calls).toEqual([`submit:${GENERIC_DATA_EXPLORATION_COMMANDS[2]}`]);
  });

  test("propagates sample-data failures so the page can stop before chat opens", async () => {
    const submit = () => {
      throw new Error("submit should not be called");
    };

    await expect(
      runHomepageExampleCommand({
        command: "Create a bar chart of unicorn valuations by country",
        backendPreference: "bridge",
        ensureSampleData: async () => {
          throw new Error("network down");
        },
        submit,
      }),
    ).rejects.toThrow("network down");
  });
});
