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
    capabilities: async () => ({
      runtimeBackend: "bridge" as const,
      query: true,
      catalog: true,
      attachDuckDb: true,
      importFiles: false,
      projects: false,
      readonly: false,
    }),
    attachSource: async () => ({ sources: [] }),
    sources: async () => ({ sources: [] }),
    detachSource: async () => ({ sources: [] }),
    query: async () => ({ columns: [], rows: [], rowCount: 0 }),
  };
}

async function captureStdout(operation: () => Promise<void>): Promise<string> {
  const originalLog = console.log;
  const output: string[] = [];
  console.log = (...values: unknown[]) => {
    output.push(values.map(String).join(" "));
  };

  try {
    await operation();
  } finally {
    console.log = originalLog;
  }

  return output.join("\n");
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

  test("serve --dashboard-mode opens the dashboards UI", async () => {
    const openedUrls: string[] = [];

    await runCli(["serve", "--port", "0", "--dashboard-mode"], {
      openBrowser: async (url) => {
        openedUrls.push(url);
      },
      waitForShutdown: async () => {},
    });

    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toStartWith("http://127.0.0.1:");
    expect(openedUrls[0]).toEndWith("/dashboards?pondviewMode=dashboard");
  });
});

describe("bridge CLI serve --use-existing", () => {
  test("opens a local UI server for the configured bridge port", async () => {
    const openedUrls: string[] = [];
    const uiServers: Array<{
      host?: string;
      port?: number;
      bridgeUrl: string;
      dashboardMode?: boolean;
    }> = [];

    await runCli(
      ["serve", "--use-existing", "--port", "18000", "--ui-port", "0"],
      {
        createClient: () => createNoopClient(),
        startBridgeUiServer: async (options) => {
          uiServers.push(options);
          return {
            url: "http://127.0.0.1:56789",
            stop: async () => {},
          };
        },
        openBrowser: async (url) => {
          openedUrls.push(url);
        },
        waitForShutdown: async () => {},
      },
    );

    expect(uiServers).toEqual([
      {
        host: "127.0.0.1",
        port: 0,
        bridgeUrl: "http://127.0.0.1:18000",
        dashboardMode: false,
      },
    ]);
    expect(openedUrls).toEqual(["http://127.0.0.1:56789"]);
  });

  test("opens dashboard mode for an existing bridge", async () => {
    const openedUrls: string[] = [];
    const uiServers: Array<{ dashboardMode?: boolean }> = [];

    await runCli(
      [
        "serve",
        "--use-existing",
        "--port",
        "18000",
        "--ui-port",
        "0",
        "--dashboard-mode",
      ],
      {
        createClient: () => createNoopClient(),
        startBridgeUiServer: async (options) => {
          uiServers.push(options);
          return {
            url: "http://127.0.0.1:56789",
            stop: async () => {},
          };
        },
        openBrowser: async (url) => {
          openedUrls.push(url);
        },
        waitForShutdown: async () => {},
      },
    );

    expect(uiServers).toEqual([
      expect.objectContaining({ dashboardMode: true }),
    ]);
    expect(openedUrls).toEqual([
      "http://127.0.0.1:56789/dashboards?pondviewMode=dashboard",
    ]);
  });

  test("fails when the configured bridge is unreachable", async () => {
    let startedUi = false;

    await expect(
      runCli(["serve", "--use-existing", "--port", "18000"], {
        createClient: () => ({
          ...createNoopClient(),
          health: async () => {
            throw new TypeError("fetch failed");
          },
        }),
        startBridgeUiServer: async () => {
          startedUi = true;
          return {
            url: "http://127.0.0.1:56789",
            stop: async () => {},
          };
        },
      }),
    ).rejects.toThrow("fetch failed");

    expect(startedUi).toBe(false);
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

  test("autostart receives host, port, token, token-env, database, and readonly flags", async () => {
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
        "--database",
        "./analytics.duckdb",
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
      database: "./analytics.duckdb",
      readonly: true,
    });
  });
});

describe("bridge CLI stop", () => {
  test("kills processes listening on the configured port", async () => {
    const killedPids: number[] = [];
    const output = await captureStdout(() =>
      runCli(["stop", "--port", "18000"], {
        findProcessIdsByPort: async (port) => {
          expect(port).toBe(18000);
          return [123, 456];
        },
        isPondviewBridgePort: async () => true,
        killProcess: (pid) => {
          killedPids.push(pid);
        },
      }),
    );

    expect(killedPids).toEqual([123, 456]);
    expect(output).toBe("Stopped processes listening on port 18000: 123, 456");
  });

  test("does not kill a non-Pondview process without --force", async () => {
    const killedPids: number[] = [];

    await expect(
      runCli(["stop", "--port", "18000"], {
        findProcessIdsByPort: async () => [123],
        isPondviewBridgePort: async () => false,
        killProcess: (pid) => {
          killedPids.push(pid);
        },
      }),
    ).rejects.toThrow("does not appear to be a Pondview bridge");

    expect(killedPids).toEqual([]);
  });

  test("--force kills a non-Pondview process", async () => {
    const killedPids: number[] = [];

    await runCli(["stop", "--port", "18000", "--force"], {
      findProcessIdsByPort: async () => [123],
      isPondviewBridgePort: async () => false,
      killProcess: (pid) => {
        killedPids.push(pid);
      },
    });

    expect(killedPids).toEqual([123]);
  });

  test("reports when no process is listening on the configured port", async () => {
    const output = await captureStdout(() =>
      runCli(["stop"], {
        findProcessIdsByPort: async (port) => {
          expect(port).toBe(17817);
          return [];
        },
        killProcess: () => {
          throw new Error("should not kill when no process is listening");
        },
      }),
    );

    expect(output).toBe("No process is listening on port 17817.");
  });
});

describe("bridge CLI validation", () => {
  test("fails fast when --token-env is explicit but unset", async () => {
    const originalValue = process.env.PONDVIEW_MISSING_TEST_TOKEN;
    delete process.env.PONDVIEW_MISSING_TEST_TOKEN;

    try {
      await expect(
        runCli(["doctor", "--token-env", "PONDVIEW_MISSING_TEST_TOKEN"]),
      ).rejects.toThrow(
        "Environment variable PONDVIEW_MISSING_TEST_TOKEN is not set or is empty.",
      );
    } finally {
      if (originalValue === undefined) {
        delete process.env.PONDVIEW_MISSING_TEST_TOKEN;
      } else {
        process.env.PONDVIEW_MISSING_TEST_TOKEN = originalValue;
      }
    }
  });

  test("rejects partial numeric port values", async () => {
    await expect(runCli(["doctor", "--port", "123abc"])).rejects.toThrow(
      "Invalid --port value: 123abc",
    );
  });
});

describe("bridge CLI doctor", () => {
  test("prints bridge health and capabilities as JSON", async () => {
    const output = await captureStdout(() =>
      runCli(["doctor"], {
        createClient: () => createNoopClient(),
      }),
    );

    expect(JSON.parse(output)).toMatchObject({
      ok: true,
      url: "http://127.0.0.1:17817",
      reachable: true,
      health: {
        ok: true,
        service: "pondview-bridge",
      },
      capabilities: {
        runtimeBackend: "bridge",
        query: true,
      },
    });
  });

  test("reports connection failures without autostarting", async () => {
    let started = false;
    const output = await captureStdout(() =>
      runCli(["doctor"], {
        createClient: () => ({
          ...createNoopClient(),
          health: async () => {
            throw new TypeError("fetch failed");
          },
        }),
        startBridgeProcess: () => {
          started = true;
        },
      }),
    );

    expect(JSON.parse(output)).toMatchObject({
      ok: false,
      url: "http://127.0.0.1:17817",
      reachable: false,
      error: "fetch failed",
    });
    expect(started).toBe(false);
  });
});
