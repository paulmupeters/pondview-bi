import { describe, expect, test } from "bun:test";
import { runCli } from "./cli";

function createNoopClient() {
  return {
    health: async () => ({
      ok: true,
      service: "pondview-bridge" as const,
      version: "test",
      runtime: {
        backend: "bridge" as const,
        duckdb: "test",
      },
    }),
    attachSource: async () => ({ sources: [] }),
    sources: async () => ({ sources: [] }),
    detachSource: async () => ({ sources: [] }),
    query: async () => ({ columns: [], rows: [], rowCount: 0 }),
  };
}

describe("bridge CLI serve browser behavior", () => {
  test("serve opens the local UI by default", async () => {
    const openedUrls: string[] = [];

    await runCli(["serve", "--port", "0"], {
      openBrowser: async (url) => {
        openedUrls.push(url);
      },
      waitForShutdown: async () => {},
    });

    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toStartWith("http://127.0.0.1:");
  });

  test("serve --no-open suppresses browser launch", async () => {
    const openedUrls: string[] = [];

    await runCli(["serve", "--port", "0", "--no-open"], {
      openBrowser: async (url) => {
        openedUrls.push(url);
      },
      waitForShutdown: async () => {},
    });

    expect(openedUrls).toEqual([]);
  });
});

describe("bridge CLI client autostart", () => {
  test("starts a local bridge and retries a client command when the bridge is unreachable", async () => {
    const startedArgs: string[][] = [];
    let sourceCalls = 0;

    await runCli(["list-sources"], {
      createClient: () => ({
        ...createNoopClient(),
        sources: async () => {
          sourceCalls += 1;
          if (sourceCalls === 1) {
            throw new TypeError("fetch failed");
          }
          return { sources: [] };
        },
      }),
      startBridgeProcess: (args) => {
        startedArgs.push([...args.positionals]);
      },
      sleep: async () => {},
    });

    expect(sourceCalls).toBe(2);
    expect(startedArgs).toEqual([[]]);
  });

  test("--url preserves the existing failure instead of autostarting", async () => {
    let started = false;

    await expect(
      runCli(["list-sources", "--url", "http://example.test"], {
        createClient: () => ({
          ...createNoopClient(),
          sources: async () => {
            throw new TypeError("fetch failed");
          },
        }),
        startBridgeProcess: () => {
          started = true;
        },
        sleep: async () => {},
      }),
    ).rejects.toThrow("fetch failed");

    expect(started).toBe(false);
  });

  test("--no-autostart preserves the existing failure", async () => {
    let started = false;

    await expect(
      runCli(["query", "SELECT 42 AS answer", "--no-autostart"], {
        createClient: () => ({
          ...createNoopClient(),
          query: async () => {
            throw new TypeError("fetch failed");
          },
        }),
        startBridgeProcess: () => {
          started = true;
        },
        sleep: async () => {},
      }),
    ).rejects.toThrow("fetch failed");

    expect(started).toBe(false);
  });

  test("autostart receives host, port, token, token-env, and readonly flags", async () => {
    const startedFlags: Record<string, string | boolean> = {};
    let attachCalls = 0;

    await runCli(
      [
        "attach",
        "./stations.duckdb",
        "--as",
        "stations",
        "--host",
        "0.0.0.0",
        "--port",
        "18000",
        "--token",
        "secret",
        "--token-env",
        "PONDVIEW_TEST_TOKEN",
        "--readonly",
      ],
      {
        createClient: () => ({
          ...createNoopClient(),
          attachSource: async () => {
            attachCalls += 1;
            if (attachCalls === 1) {
              throw new TypeError("fetch failed");
            }
            return { sources: [] };
          },
        }),
        startBridgeProcess: (args) => {
          for (const [name, value] of args.flags) {
            startedFlags[name] = value;
          }
        },
        sleep: async () => {},
      },
    );

    expect(startedFlags).toMatchObject({
      host: "0.0.0.0",
      port: "18000",
      token: "secret",
      "token-env": "PONDVIEW_TEST_TOKEN",
      readonly: true,
    });
  });
});
