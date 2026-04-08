import { describe, expect, test } from "bun:test";
import { runHomepageExampleCommand } from "@/app/page";

describe("runHomepageExampleCommand", () => {
  test("seeds sample data before submitting the example prompt", async () => {
    const calls: string[] = [];

    await runHomepageExampleCommand({
      command: "Show me trends of unicorns over the year in China",
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
      "submit:Show me trends of unicorns over the year in China",
    ]);
  });

  test("still submits when sample data is skipped because tables already exist", async () => {
    const calls: string[] = [];

    await runHomepageExampleCommand({
      command: "Compare revenue across different industries",
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
      "submit:Compare revenue across different industries",
    ]);
  });

  test("propagates sample-data failures so the page can stop before chat opens", async () => {
    const submit = () => {
      throw new Error("submit should not be called");
    };

    await expect(
      runHomepageExampleCommand({
        command: "Create a dashboard for financial metrics",
        backendPreference: "duckdb-http",
        ensureSampleData: async () => {
          throw new Error("network down");
        },
        submit,
      }),
    ).rejects.toThrow("network down");
  });
});
