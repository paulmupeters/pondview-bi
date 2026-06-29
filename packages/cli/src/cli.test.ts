import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  BridgeJsonValue,
  BridgeQueryResponse,
} from "@pondview/bridge-protocol";
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
      projects: true,
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

async function captureStdoutAndError(
  operation: () => Promise<void>,
): Promise<{ output: string; error: unknown }> {
  let error: unknown;
  const output = await captureStdout(async () => {
    try {
      await operation();
    } catch (caught) {
      error = caught;
    }
  });
  return { output, error };
}

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "pondview-cli-"));
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

type TestRow = Record<string, BridgeJsonValue>;

function queryResponse(
  rows: TestRow[] = [],
  rowsChanged?: number,
): BridgeQueryResponse {
  return {
    columns: [],
    rows,
    rowCount: rows.length,
    ...(rowsChanged === undefined ? {} : { rowsChanged }),
  };
}

describe("bridge CLI help", () => {
  test("prints a grouped top-level overview", async () => {
    const output = await captureStdout(() => runCli(["--help"]));

    expect(output).toContain("Usage:\n  pondview [command]");
    expect(output).toContain("Local Runtime");
    expect(output).toContain("start          Start the local Pondview app");
    expect(output).not.toContain("use-existing");
    expect(output).not.toContain("ui-port");
    expect(output).not.toContain("pondview bridge");
    expect(output).not.toContain("pondview serve");
  });

  test("prints start help without starting a server", async () => {
    const openedUrls: string[] = [];
    const output = await captureStdout(() =>
      runCli(["start", "--help"], {
        openBrowser: async (url) => {
          openedUrls.push(url);
        },
      }),
    );

    expect(output).toContain("Usage:\n  pondview start [flags]");
    expect(output).toContain("--no-ui");
    expect(output).toContain("--mcp-allow-write-sql");
    expect(output).toContain("http://127.0.0.1:17817/mcp");
    expect(output).not.toContain("listening at");
    expect(openedUrls).toEqual([]);
  });

  test("prints nested dashboard help", async () => {
    const output = await captureStdout(() =>
      runCli(["help", "dashboard", "open"]),
    );

    expect(output).toContain(
      "Usage:\n  pondview dashboard open [dashboard-id]",
    );
    expect(output).not.toContain("use-existing");
    expect(output).not.toContain("ui-port");
  });

  test("prints MCP help", async () => {
    const output = await captureStdout(() => runCli(["mcp", "--help"]));

    expect(output).toContain("Usage:\n  pondview mcp [flags]");
    expect(output).toContain("--allow-write-sql");
    expect(output).toContain("primary MCP interface");
    expect(output).toContain("http://127.0.0.1:17817/mcp");
    expect(output).toContain("claude mcp add pondview");
    expect(output).toContain("codex mcp add pondview");
  });
});

describe("bridge CLI source bindings", () => {
  test("source add writes project-local SQL-backed connection config", async () => {
    const projectDir = createTempDir();
    const setupSql =
      "INSTALL gsheets FROM community; LOAD gsheets; CREATE OR REPLACE VIEW sheet_sales AS SELECT * FROM read_gsheet('https://docs.google.com/spreadsheets/d/.../edit');";

    await captureStdout(() =>
      runCli([
        "source",
        "add",
        "google-sheet",
        "--project-dir",
        projectDir,
        "--sql",
        setupSql,
      ]),
    );

    const parsed = JSON.parse(
      readFileSync(join(projectDir, "pondview.sources.local.json"), "utf8"),
    ) as {
      bindings: Record<string, unknown>;
    };
    expect(parsed.bindings["google-sheet"]).toEqual({
      runtimeBackend: "bridge",
      dbIdentifier: null,
      catalogContext: null,
      connection: {
        type: "custom",
        setupSql,
      },
    });

    rmSync(projectDir, { recursive: true, force: true });
  });

  test("source add reads setup SQL from a file", async () => {
    const projectDir = createTempDir();
    const sqlPath = join(projectDir, "snowflake.sql");
    const setupSql =
      "INSTALL snowflake FROM community;\nLOAD snowflake;\nATTACH '' AS sf (TYPE snowflake, SECRET my_snowflake, READ_ONLY);\n";
    writeFileSync(sqlPath, setupSql);

    await captureStdout(() =>
      runCli([
        "source",
        "add",
        "snowflake",
        "--project-dir",
        projectDir,
        "--sql-file",
        sqlPath,
      ]),
    );

    const parsed = JSON.parse(
      readFileSync(join(projectDir, "pondview.sources.local.json"), "utf8"),
    ) as {
      bindings: Record<string, { connection?: { setupSql?: string } }>;
    };

    expect(parsed.bindings.snowflake?.connection?.setupSql).toBe(setupSql);

    rmSync(projectDir, { recursive: true, force: true });
  });

  test("source add uses Bun's original launch directory", async () => {
    const projectDir = createTempDir();
    const packageDir = createTempDir();
    const previousLocalPrefix = process.env.npm_config_local_prefix;
    const previousInitCwd = process.env.INIT_CWD;
    const previousPwd = process.env.PWD;

    process.env.npm_config_local_prefix = projectDir;
    process.env.INIT_CWD = packageDir;
    process.env.PWD = packageDir;

    try {
      await captureStdout(() =>
        runCli(["source", "add", "warehouse", "--sql", "SELECT 1;"]),
      );

      const parsed = JSON.parse(
        readFileSync(join(projectDir, "pondview.sources.local.json"), "utf8"),
      ) as {
        bindings: Record<string, unknown>;
      };
      expect(parsed.bindings.warehouse).toMatchObject({
        runtimeBackend: "bridge",
        connection: {
          type: "custom",
          setupSql: "SELECT 1;",
        },
      });
    } finally {
      restoreEnv("npm_config_local_prefix", previousLocalPrefix);
      restoreEnv("INIT_CWD", previousInitCwd);
      restoreEnv("PWD", previousPwd);
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(packageDir, { recursive: true, force: true });
    }
  });

  test("source add rejects removed attach flags", async () => {
    const projectDir = createTempDir();
    const identifierAttempt = await captureStdoutAndError(() =>
      runCli([
        "source",
        "add",
        "snowflake",
        "--project-dir",
        projectDir,
        "--identifier",
        "",
        "--sql",
        "SELECT 1;",
      ]),
    );

    expect(identifierAttempt.error).toBeInstanceOf(Error);
    expect((identifierAttempt.error as Error).message).toContain(
      "Unsupported flag for pondview source: --identifier",
    );

    const aliasAttempt = await captureStdoutAndError(() =>
      runCli([
        "source",
        "add",
        "google-sheet",
        "--project-dir",
        projectDir,
        "--as",
        "sheet_sales",
        "--sql",
        "SELECT 1;",
      ]),
    );

    expect(aliasAttempt.error).toBeInstanceOf(Error);
    expect((aliasAttempt.error as Error).message).toContain(
      "Unsupported flag for pondview source: --as",
    );

    rmSync(projectDir, { recursive: true, force: true });
  });

  test("source remove deletes a binding", async () => {
    const projectDir = createTempDir();
    writeFileSync(
      join(projectDir, "pondview.sources.local.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          bindings: {
            warehouse: {
              runtimeBackend: "bridge",
              dbIdentifier: "pg:warehouse",
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    await captureStdout(() =>
      runCli(["source", "remove", "warehouse", "--project-dir", projectDir]),
    );

    const parsed = JSON.parse(
      readFileSync(join(projectDir, "pondview.sources.local.json"), "utf8"),
    ) as {
      bindings: Record<string, unknown>;
    };
    expect(parsed.bindings).toEqual({});

    rmSync(projectDir, { recursive: true, force: true });
  });
});

describe("bridge CLI start browser behavior", () => {
  test("bare pondview starts the local UI", async () => {
    const openedUrls: string[] = [];

    await runCli(["--port", "0"], {
      openBrowser: async (url) => {
        openedUrls.push(url);
      },
      waitForShutdown: async () => {},
    });

    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toStartWith("http://127.0.0.1:");
  });

  test("bare pondview accepts start flags", async () => {
    const openedUrls: string[] = [];

    await runCli(["--port", "0", "--no-open"], {
      openBrowser: async (url) => {
        openedUrls.push(url);
      },
      waitForShutdown: async () => {},
    });

    expect(openedUrls).toEqual([]);
  });

  test("start opens the local UI by default", async () => {
    const openedUrls: string[] = [];

    await runCli(["start", "--port", "0"], {
      openBrowser: async (url) => {
        openedUrls.push(url);
      },
      waitForShutdown: async () => {},
    });

    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toStartWith("http://127.0.0.1:");
  });

  test("start --no-open suppresses browser launch", async () => {
    const openedUrls: string[] = [];

    await runCli(["start", "--port", "0", "--no-open"], {
      openBrowser: async (url) => {
        openedUrls.push(url);
      },
      waitForShutdown: async () => {},
    });

    expect(openedUrls).toEqual([]);
  });

  test("start --dashboard-mode opens the dashboards UI", async () => {
    const openedUrls: string[] = [];

    await runCli(["start", "--port", "0", "--dashboard-mode"], {
      openBrowser: async (url) => {
        openedUrls.push(url);
      },
      waitForShutdown: async () => {},
    });

    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toStartWith("http://127.0.0.1:");
    expect(openedUrls[0]).toEndWith("/dashboards?pondviewMode=dashboard");
  });

  test("start --no-ui starts the API without opening the browser", async () => {
    const openedUrls: string[] = [];
    const output = await captureStdout(() =>
      runCli(["start", "--port", "0", "--no-ui"], {
        openBrowser: async (url) => {
          openedUrls.push(url);
        },
        waitForShutdown: async () => {},
      }),
    );

    expect(output).toContain("Pondview bridge listening at");
    expect(openedUrls).toEqual([]);
  });

  test("rejects removed serve/use-existing flags", async () => {
    await expect(runCli(["serve"])).rejects.toThrow("Unknown command: serve");
    await expect(runCli(["bridge"])).rejects.toThrow("Unknown command: bridge");
    await expect(runCli(["start", "--use-existing"])).rejects.toThrow(
      "Unsupported flag",
    );
    await expect(runCli(["start", "--ui-port", "0"])).rejects.toThrow(
      "Unsupported flag",
    );
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

  test("autostart receives host, port, token-env, and database flags", async () => {
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
    });
  });
});

describe("bridge CLI MCP runtime selection", () => {
  test("project-backed MCP autostarts and uses a bridge client runtime", async () => {
    const startedFlags: Record<string, string | boolean> = {};
    const queries: Array<{ sql: string; limit?: number }> = [];
    let healthCalls = 0;
    let embeddedStarted = false;
    let runtimeStarted = false;

    await runCli(["mcp", "--project-dir", "./example"], {
      createClient: () => ({
        ...createNoopClient(),
        health: async () => {
          healthCalls += 1;
          if (healthCalls === 1) {
            throw new TypeError("fetch failed");
          }
          return createNoopClient().health();
        },
        query: async (input) => {
          queries.push(input);
          return queryResponse();
        },
      }),
      startBridgeProcess: (args) => {
        for (const [name, value] of args.flags) {
          startedFlags[name] = value;
        }
      },
      runBridgeMcpServer: async () => {
        embeddedStarted = true;
      },
      runBridgeMcpServerWithRuntime: async (runtime) => {
        runtimeStarted = true;
        await runtime.query("SELECT 1", 7);
      },
      sleep: async () => {},
    });

    expect(runtimeStarted).toBe(true);
    expect(embeddedStarted).toBe(false);
    expect(startedFlags).toMatchObject({ "project-dir": "./example" });
    expect(queries).toEqual([{ sql: "SELECT 1", limit: 7 }]);
    expect(healthCalls).toBeGreaterThanOrEqual(3);
  });

  test("--url selects bridge client mode without autostarting", async () => {
    let started = false;
    let runtimeStarted = false;

    await runCli(["mcp", "--url", "http://example.test"], {
      createClient: () => createNoopClient(),
      startBridgeProcess: () => {
        started = true;
      },
      runBridgeMcpServer: async () => {
        throw new Error("embedded MCP should not start");
      },
      runBridgeMcpServerWithRuntime: async () => {
        runtimeStarted = true;
      },
    });

    expect(runtimeStarted).toBe(true);
    expect(started).toBe(false);
  });

  test("--database keeps embedded MCP mode", async () => {
    let embeddedOptions: unknown;

    await runCli(["mcp", "--database", "./analytics.duckdb"], {
      createClient: () => {
        throw new Error("client should not be created");
      },
      runBridgeMcpServer: async (options) => {
        embeddedOptions = options;
      },
      runBridgeMcpServerWithRuntime: async () => {
        throw new Error("client MCP should not start");
      },
    });

    expect(embeddedOptions).toMatchObject({
      databasePath: "./analytics.duckdb",
    });
  });

  test("MCP client mode accepts token flags", async () => {
    const originalValue = process.env.PONDVIEW_TEST_TOKEN;
    process.env.PONDVIEW_TEST_TOKEN = "env-secret";
    const seenFlags: Array<Record<string, string | boolean>> = [];

    try {
      await runCli(
        [
          "mcp",
          "--project-dir",
          "./example",
          "--token",
          "inline-secret",
          "--token-env",
          "PONDVIEW_TEST_TOKEN",
        ],
        {
          createClient: (args) => {
            seenFlags.push(Object.fromEntries(args.flags));
            return createNoopClient();
          },
          runBridgeMcpServerWithRuntime: async () => {},
        },
      );
    } finally {
      if (originalValue === undefined) {
        delete process.env.PONDVIEW_TEST_TOKEN;
      } else {
        process.env.PONDVIEW_TEST_TOKEN = originalValue;
      }
    }

    expect(seenFlags.length).toBeGreaterThan(0);
    expect(seenFlags[0]).toMatchObject({
      token: "inline-secret",
      "token-env": "PONDVIEW_TEST_TOKEN",
    });
  });
});

describe("bridge CLI query files", () => {
  test("query --file reads SQL from disk", async () => {
    const tempDir = createTempDir();
    const sqlPath = join(tempDir, "statement.sql");
    writeFileSync(sqlPath, "SELECT 42 AS answer;\n", "utf8");
    const queries: string[] = [];

    try {
      await runCli(["query", "--file", sqlPath], {
        createClient: () => ({
          ...createNoopClient(),
          query: async (input) => {
            queries.push(input.sql);
            return { columns: [], rows: [], rowCount: 0 };
          },
        }),
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    expect(queries).toEqual(["SELECT 42 AS answer;"]);
  });

  test("query rejects mixed inline SQL and --file input", async () => {
    await expect(
      runCli(["query", "SELECT 1", "--file", "statement.sql"]),
    ).rejects.toThrow("Use either inline SQL or --file");
  });
});

describe("bridge CLI dashboard commands", () => {
  const tables = [
    "dashboards",
    "dashboard_charts",
    "dashboard_measures",
    "dashboard_slicers",
    "dashboard_join_defs",
    "chart_slicers",
    "dashboard_cache_tables",
    "dashboard_source_caches",
    "dashboard_snapshots",
  ];

  function dashboardClient(options?: {
    previewError?: boolean;
    queries?: string[];
    dashboards?: TestRow[];
    charts?: TestRow[];
    measures?: TestRow[];
    slicers?: TestRow[];
    joinDefs?: TestRow[];
    currentCatalog?: string;
  }) {
    const dashboards = options?.dashboards ?? [
      {
        id: "dash_1",
        title: "Revenue",
        updated_at: 123,
        runtime_backend: "bridge",
      },
    ];
    const measures = options?.measures ?? [
      {
        id: "measure_1",
        dashboard_id: "dash_1",
        key: "total_revenue",
        label: "Total Revenue",
        sql: "SELECT 1 AS total_revenue",
        sql_backend: "bridge",
        source_descriptor_json:
          '{"kind":"runtime","runtimeBackend":"bridge","dbIdentifier":null,"catalogContext":null}',
      },
    ];
    const charts = options?.charts ?? [
      {
        id: "chart_1",
        dashboard_id: "dash_1",
        title: "Revenue",
        description: "Revenue card",
        sql: "SELECT 1 AS total_revenue",
        sql_backend: "bridge",
        chart_config_json:
          '{"configType":"card","measureId":"measure_1","title":"Revenue","description":"Revenue card"}',
        source_descriptor_json:
          '{"kind":"runtime","runtimeBackend":"bridge","dbIdentifier":null,"catalogContext":null}',
      },
    ];
    const slicers = options?.slicers ?? [
      { id: "slicer_1", dashboard_id: "dash_1", field: "region" },
    ];
    const joinDefs = options?.joinDefs ?? [
      { dashboard_id: "dash_1", position: 0, left_table: "a" },
    ];

    return {
      ...createNoopClient(),
      query: async (input: { sql: string }): Promise<BridgeQueryResponse> => {
        options?.queries?.push(input.sql);
        const sql = input.sql;
        const hasMetadataTable = (table: string) =>
          sql.includes(`"pondview"."${table}"`) ||
          sql.includes(`"pondview"."pondview"."${table}"`);
        if (sql.includes("current_catalog()")) {
          return queryResponse(
            options?.currentCatalog
              ? [{ current_catalog: options.currentCatalog }]
              : [],
          );
        }
        if (sql.includes("information_schema.tables")) {
          return queryResponse(tables.map((table_name) => ({ table_name })));
        }
        if (sql.startsWith("SELECT * FROM (")) {
          if (options?.previewError) {
            throw new Error("preview failed");
          }
          return queryResponse();
        }
        if (hasMetadataTable("dashboards") && sql.includes("UPDATE")) {
          return queryResponse([], 1);
        }
        if (sql.includes("DELETE FROM")) {
          return queryResponse([], 9);
        }
        if (
          hasMetadataTable("dashboard_charts") &&
          sql.includes("COUNT(*) FROM")
        ) {
          return queryResponse(
            dashboards.map((dashboard) => ({
              ...dashboard,
              chart_count: charts.filter(
                (chart) => chart.dashboard_id === dashboard.id,
              ).length,
              measure_count: measures.filter(
                (measure) => measure.dashboard_id === dashboard.id,
              ).length,
              slicer_count: slicers.filter(
                (slicer) => slicer.dashboard_id === dashboard.id,
              ).length,
            })),
          );
        }
        if (hasMetadataTable("dashboards")) {
          return queryResponse(dashboards);
        }
        if (hasMetadataTable("dashboard_charts")) {
          return queryResponse(charts);
        }
        if (hasMetadataTable("dashboard_measures")) {
          return queryResponse(measures);
        }
        if (hasMetadataTable("dashboard_slicers")) {
          return queryResponse(slicers);
        }
        if (hasMetadataTable("dashboard_join_defs")) {
          return queryResponse(joinDefs);
        }
        return queryResponse();
      },
    };
  }

  test("dashboard list prints dashboard summaries", async () => {
    const output = await captureStdout(() =>
      runCli(["dashboard", "list"], {
        createClient: () => dashboardClient(),
      }),
    );

    expect(JSON.parse(output)).toMatchObject({
      dashboards: [
        {
          id: "dash_1",
          title: "Revenue",
          chart_count: 1,
          measure_count: 1,
          slicer_count: 1,
        },
      ],
    });
  });

  test("dashboard show prints dashboard metadata", async () => {
    const output = await captureStdout(() =>
      runCli(["dashboard", "show", "dash_1"], {
        createClient: () => dashboardClient(),
      }),
    );

    expect(JSON.parse(output)).toMatchObject({
      dashboard: { id: "dash_1", title: "Revenue" },
      charts: [{ id: "chart_1" }],
      measures: [{ id: "measure_1" }],
      slicers: [{ id: "slicer_1" }],
      joinDefs: [{ dashboard_id: "dash_1" }],
    });
  });

  test("dashboard validate passes valid metadata", async () => {
    const output = await captureStdout(() =>
      runCli(["dashboard", "validate", "dash_1"], {
        createClient: () => dashboardClient(),
      }),
    );

    expect(JSON.parse(output)).toMatchObject({
      ok: true,
      dashboards: ["dash_1"],
      errors: [],
    });
  });

  test("dashboard commands qualify metadata refs when the catalog is also pondview", async () => {
    const queries: string[] = [];
    await captureStdout(() =>
      runCli(["dashboard", "list"], {
        createClient: () =>
          dashboardClient({ queries, currentCatalog: "pondview" }),
      }),
    );

    expect(
      queries.some((sql) =>
        sql.includes('FROM "pondview"."pondview"."dashboards"'),
      ),
    ).toBe(true);
  });

  test("dashboard validate reports metadata and SQL failures", async () => {
    const { output, error } = await captureStdoutAndError(() =>
      runCli(["dashboard", "validate", "dash_1"], {
        createClient: () =>
          dashboardClient({
            previewError: true,
            measures: [],
            charts: [
              {
                id: "chart_bad_json",
                dashboard_id: "dash_1",
                sql: "SELECT 1 AS value",
                sql_backend: "bridge",
                chart_config_json: "not json",
                source_descriptor_json: "not json",
              },
              {
                id: "chart_bad_refs",
                dashboard_id: "dash_1",
                title: "Bad refs",
                description: "Bad refs",
                sql: "SELECT 1 AS value",
                sql_backend: "duckdb-wasm",
                chart_config_json:
                  '{"configType":"card","measureId":"missing_measure"}',
                source_descriptor_json:
                  '{"kind":"runtime","runtimeBackend":"bridge"}',
              },
            ],
          }),
      }),
    );
    const parsed = JSON.parse(output);

    expect(error).toBeInstanceOf(Error);
    expect(parsed.ok).toBe(false);
    expect(
      parsed.errors.map((entry: { message: string }) => entry.message),
    ).toEqual(
      expect.arrayContaining([
        "Invalid source_descriptor_json.",
        "Invalid chart_config_json.",
        'Runtime mismatch: dashboard runtime_backend is "bridge" but sql_backend is "duckdb-wasm".',
        'Runtime mismatch: sql_backend is "duckdb-wasm" but source descriptor runtimeBackend is "bridge".',
        'Card config references missing measureId "missing_measure".',
        "SQL preview failed: preview failed",
      ]),
    );
  });

  test("dashboard rename requires a title and sends update SQL", async () => {
    await expect(
      runCli(["dashboard", "rename", "dash_1"], {
        createClient: () => dashboardClient(),
      }),
    ).rejects.toThrow("Missing required --title");

    const queries: string[] = [];
    const output = await captureStdout(() =>
      runCli(["dashboard", "rename", "dash_1", "--title", "New Title"], {
        createClient: () => dashboardClient({ queries }),
      }),
    );

    expect(queries.some((sql) => sql.includes("UPDATE"))).toBe(true);
    expect(JSON.parse(output)).toMatchObject({
      id: "dash_1",
      title: "New Title",
      rowsChanged: 1,
    });
  });

  test("dashboard delete requires --yes and deletes dependent metadata first", async () => {
    await expect(
      runCli(["dashboard", "delete", "dash_1"], {
        createClient: () => dashboardClient(),
      }),
    ).rejects.toThrow("without --yes");

    const queries: string[] = [];
    const output = await captureStdout(() =>
      runCli(["dashboard", "delete", "dash_1", "--yes"], {
        createClient: () => dashboardClient({ queries }),
      }),
    );
    const deleteSql = queries.find((sql) => sql.includes("DELETE FROM")) ?? "";

    expect(deleteSql.indexOf('"pondview"."dashboard_charts"')).toBeLessThan(
      deleteSql.indexOf('"pondview"."dashboards"'),
    );
    expect(JSON.parse(output)).toMatchObject({
      id: "dash_1",
      deleted: true,
      rowsChanged: 9,
    });
  });

  test("dashboard open opens a specific dashboard in dashboard mode", async () => {
    const openedUrls: string[] = [];

    await runCli(["dashboard", "open", "dash_1", "--port", "0"], {
      createClient: () => dashboardClient(),
      openBrowser: async (url) => {
        openedUrls.push(url);
      },
      waitForShutdown: async () => {},
    });

    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toStartWith("http://127.0.0.1:");
    expect(openedUrls[0]).toEndWith(
      "/dashboards/view?id=dash_1&pondviewMode=dashboard",
    );
  });

  test("dashboard open rejects removed use-existing flags", async () => {
    await expect(
      runCli(["dashboard", "open", "--use-existing"]),
    ).rejects.toThrow("Unsupported flag");
    await expect(
      runCli(["dashboard", "open", "--ui-port", "0"]),
    ).rejects.toThrow("Unsupported flag");
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
  test("MCP accepts client flags", async () => {
    let embeddedOptions: unknown;

    await runCli(["mcp", "--port", "17817"], {
      runBridgeMcpServer: async (options) => {
        embeddedOptions = options;
      },
    });

    expect(embeddedOptions).toBeDefined();
  });

  test("rejects unsupported MCP flags", async () => {
    await expect(runCli(["mcp", "--ui-port", "17818"])).rejects.toThrow(
      "Unsupported flag for pondview mcp: --ui-port",
    );
  });

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
