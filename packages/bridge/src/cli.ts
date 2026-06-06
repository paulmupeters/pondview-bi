#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BridgeClient } from "@pondview/bridge-protocol";
import { type BrowserOpener, openBrowser } from "./open-browser";
import { startBridgeServer } from "./server";

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Map<string, string | boolean>;
}

const DEFAULT_PORT = 17817;
const DEFAULT_HOST = "127.0.0.1";
const AUTOSTART_TIMEOUT_MS = 5_000;
const AUTOSTART_POLL_INTERVAL_MS = 100;
const DASHBOARD_MODE_PATH = "/dashboards?pondviewMode=dashboard";
const DASHBOARD_VIEW_PATH = "/dashboards/view";
const METADATA_SCHEMA = "pondview";
const LOCAL_SOURCE_BINDINGS_PATH = "pondview.sources.local.json";
const CLIENT_FLAGS = [
  "database",
  "host",
  "no-autostart",
  "port",
  "project-dir",
  "token",
  "token-env",
  "url",
] as const;

interface BridgeApiClient {
  health: BridgeClient["health"];
  capabilities: BridgeClient["capabilities"];
  attachSource: BridgeClient["attachSource"];
  sources: BridgeClient["sources"];
  detachSource: BridgeClient["detachSource"];
  query: BridgeClient["query"];
}

interface CliDeps {
  openBrowser?: BrowserOpener;
  waitForShutdown?: () => Promise<void>;
  createClient?: (args: ParsedArgs) => BridgeApiClient;
  startBridgeProcess?: (args: ParsedArgs) => void;
  findProcessIdsByPort?: (port: number) => Promise<number[]>;
  isPondviewBridgePort?: (args: ParsedArgs) => Promise<boolean>;
  killProcess?: (pid: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultDeps = {
  openBrowser,
  waitForShutdown,
  createClient,
  startBridgeProcess,
  findProcessIdsByPort,
  isPondviewBridgePort,
  killProcess,
  sleep,
} satisfies Required<CliDeps>;

export async function runCli(
  argv: string[],
  deps: CliDeps = {},
): Promise<void> {
  const args = parseArgs(argv);
  const resolvedDeps = { ...defaultDeps, ...deps };

  if (printRequestedHelp(args)) {
    return;
  }

  switch (args.command) {
    case "":
    case "start":
      await runStart(args, resolvedDeps);
      break;
    case "attach":
      await runAttach(args, resolvedDeps);
      break;
    case "list-sources":
      await runListSources(args, resolvedDeps);
      break;
    case "detach":
      await runDetach(args, resolvedDeps);
      break;
    case "query":
      await runQuery(args, resolvedDeps);
      break;
    case "dashboard":
      await runDashboard(args, resolvedDeps);
      break;
    case "source":
      await runSource(args);
      break;
    case "stop":
      await runStop(args, resolvedDeps);
      break;
    case "doctor":
      await runDoctor(args, resolvedDeps);
      break;
    default:
      throw new Error(`Unknown command: ${args.command}`);
  }
}

async function runSource(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0];
  switch (subcommand) {
    case "add":
      await runSourceAdd(args);
      break;
    case "list":
      await runSourceList(args);
      break;
    case "remove":
      await runSourceRemove(args);
      break;
    default:
      throw new Error("Usage: pondview source <add|list|remove>");
  }
}

type LocalSourceBindingsFile = {
  schemaVersion: 1;
  bindings: Record<string, LocalSourceBinding>;
};

type LocalSourceBinding = {
  runtimeBackend: "duckdb-wasm" | "bridge";
  dbIdentifier?: string | null;
  catalogContext?: string | null;
  connection?: {
    type: string;
    setupSql?: string;
  };
};

async function runSourceAdd(args: ParsedArgs): Promise<void> {
  assertAllowedFlags(args, [
    "catalog-context",
    "project-dir",
    "runtime",
    "sql",
    "sql-file",
  ]);

  const sourceRef = args.positionals[1];
  if (!sourceRef || !isProjectSourceRef(sourceRef)) {
    throw new Error("Usage: pondview source add <source-ref> --sql <sql>");
  }

  const inlineSql = readStringFlag(args, "sql");
  const sqlFile = readStringFlag(args, "sql-file");
  if (inlineSql && sqlFile) {
    throw new Error("Provide --sql or --sql-file, not both.");
  }
  const setupSql =
    inlineSql ?? (sqlFile ? await readFile(sqlFile, "utf8") : "");
  if (!setupSql.trim()) {
    throw new Error("Provide setup SQL with --sql <sql> or --sql-file <path>.");
  }

  const runtime = readStringFlag(args, "runtime") ?? "bridge";
  if (runtime !== "bridge" && runtime !== "duckdb-wasm") {
    throw new Error("--runtime must be bridge or duckdb-wasm.");
  }

  const binding: LocalSourceBinding = {
    runtimeBackend: runtime,
    dbIdentifier: null,
    catalogContext: readStringFlag(args, "catalog-context") ?? null,
    connection: {
      type: "custom",
      setupSql,
    },
  };

  const file = await readLocalSourceBindings(args);
  file.bindings[sourceRef] = stripUndefined(binding);
  await writeLocalSourceBindings(args, file);
  printJson({ sourceRef, binding: file.bindings[sourceRef] });
}

async function runSourceList(args: ParsedArgs): Promise<void> {
  assertAllowedFlags(args, ["project-dir"]);
  printJson(await readLocalSourceBindings(args));
}

async function runSourceRemove(args: ParsedArgs): Promise<void> {
  assertAllowedFlags(args, ["project-dir"]);
  const sourceRef = args.positionals[1];
  if (!sourceRef || !isProjectSourceRef(sourceRef)) {
    throw new Error("Usage: pondview source remove <source-ref>");
  }
  const file = await readLocalSourceBindings(args);
  delete file.bindings[sourceRef];
  await writeLocalSourceBindings(args, file);
  printJson({ removed: sourceRef, bindings: file.bindings });
}

async function runStart(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, [
    "dashboard-mode",
    "database",
    "host",
    "no-open",
    "no-ui",
    "port",
    "project-dir",
    "token",
    "token-env",
  ]);

  const host = readStringFlag(args, "host") ?? DEFAULT_HOST;
  const port = readNumberFlag(args, "port") ?? DEFAULT_PORT;
  const token = readToken(args);
  const databasePath = readStringFlag(args, "database");
  const projectDir = readStringFlag(args, "project-dir");

  if (args.flags.has("no-ui") && args.flags.has("dashboard-mode")) {
    throw new Error("Use either --no-ui or --dashboard-mode, not both.");
  }

  const server = await startBridgeServer({
    host,
    port,
    token,
    databasePath,
    projectDir,
    serveUi: !args.flags.has("no-ui"),
    dashboardMode: args.flags.has("dashboard-mode"),
  });

  console.log(
    args.flags.has("no-ui")
      ? `Pondview bridge listening at ${server.url}`
      : `Pondview local app listening at ${server.url}`,
  );
  console.log("Press Ctrl+C to stop.");

  if (!args.flags.has("no-ui") && !args.flags.has("no-open")) {
    await deps
      .openBrowser(resolveStartOpenUrl(server.url, args))
      .catch((error) => {
        console.warn(
          `Could not open browser: ${error instanceof Error ? error.message : error}`,
        );
      });
  }

  await deps.waitForShutdown();
  await server.stop();
}

async function runAttach(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, [
    "as",
    "database",
    "host",
    "no-autostart",
    "port",
    "project-dir",
    "readonly",
    "token",
    "token-env",
    "url",
  ]);

  const identifier = args.positionals[0];
  if (!identifier) {
    throw new Error("Usage: pondview attach <duckdb-file-or-url> --as <alias>");
  }

  const alias = readStringFlag(args, "as");
  if (!alias) {
    throw new Error("Missing required --as <alias> flag.");
  }

  const response = await runClientCommand(args, deps, (client) =>
    client.attachSource({
      identifier,
      alias,
      readonly: args.flags.has("readonly") ? true : undefined,
    }),
  );
  printJson(response);
}

async function runListSources(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, CLIENT_FLAGS);
  printJson(await runClientCommand(args, deps, (client) => client.sources()));
}

async function runDetach(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, CLIENT_FLAGS);
  const id = args.positionals[0];
  if (!id) {
    throw new Error("Usage: pondview detach <source-id-or-alias>");
  }
  printJson(
    await runClientCommand(args, deps, (client) => client.detachSource(id)),
  );
}

async function runQuery(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, [...CLIENT_FLAGS, "file"]);
  const sql = await readQuerySql(args);
  if (!sql) {
    throw new Error(
      "Usage: pondview query <sql> OR pondview query --file <path.sql>",
    );
  }
  printJson(
    await runClientCommand(args, deps, (client) => client.query({ sql })),
  );
}

async function runDashboard(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  const [subcommand = "", ...positionals] = args.positionals;
  const dashboardArgs = { ...args, positionals };

  switch (subcommand) {
    case "list":
      await runDashboardList(dashboardArgs, deps);
      break;
    case "show":
      await runDashboardShow(dashboardArgs, deps);
      break;
    case "validate":
      await runDashboardValidate(dashboardArgs, deps);
      break;
    case "rename":
      await runDashboardRename(dashboardArgs, deps);
      break;
    case "delete":
      await runDashboardDelete(dashboardArgs, deps);
      break;
    case "open":
      await runDashboardOpen(dashboardArgs, deps);
      break;
    default:
      throw new Error(
        "Usage: pondview dashboard <list|show|validate|rename|delete|open>",
      );
  }
}

async function runDashboardList(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, CLIENT_FLAGS);
  printJson({
    dashboards: await loadDashboardSummaries(args, deps),
  });
}

async function runDashboardShow(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, CLIENT_FLAGS);
  const dashboardId = requireDashboardId(args);
  const snapshot = await loadDashboardSnapshot(args, deps, dashboardId);
  if (!snapshot.dashboard) {
    throw new Error(`Dashboard "${dashboardId}" was not found.`);
  }
  printJson(snapshot);
}

async function runDashboardValidate(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, CLIENT_FLAGS);
  const dashboardId = args.positionals[0]?.trim();
  const result = await validateDashboards(args, deps, dashboardId || null);
  printJson(result);
  if (!result.ok) {
    throw new Error("Dashboard validation failed.");
  }
}

async function runDashboardRename(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, [...CLIENT_FLAGS, "title"]);
  const dashboardId = requireDashboardId(args);
  const title = readStringFlag(args, "title")?.trim();
  if (!title) {
    throw new Error("Missing required --title <title> flag.");
  }
  await assertDashboardExists(args, deps, dashboardId);
  const response = await runClientCommand(args, deps, (client) =>
    client.query({
      sql: `UPDATE ${metadataTable("dashboards")}
            SET title = ${quoteString(title)},
                updated_at = epoch_ms(current_timestamp)
            WHERE id = ${quoteString(dashboardId)};`,
    }),
  );
  printJson({
    id: dashboardId,
    title,
    rowsChanged: response.rowsChanged,
  });
}

async function runDashboardDelete(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, [...CLIENT_FLAGS, "yes"]);
  const dashboardId = requireDashboardId(args);
  if (!args.flags.has("yes")) {
    throw new Error("Refusing to delete dashboard without --yes.");
  }
  await assertDashboardExists(args, deps, dashboardId);
  const existingTables = await listMetadataTables(args, deps);
  const deleteStatements = [
    [
      "chart_slicers",
      `chart_id IN (SELECT id FROM ${metadataTable("dashboard_charts")} WHERE dashboard_id = ${quoteString(dashboardId)})`,
    ],
    ["dashboard_charts", `dashboard_id = ${quoteString(dashboardId)}`],
    ["dashboard_measures", `dashboard_id = ${quoteString(dashboardId)}`],
    ["dashboard_slicers", `dashboard_id = ${quoteString(dashboardId)}`],
    ["dashboard_join_defs", `dashboard_id = ${quoteString(dashboardId)}`],
    ["dashboard_cache_tables", `dashboard_id = ${quoteString(dashboardId)}`],
    ["dashboard_source_caches", `dashboard_id = ${quoteString(dashboardId)}`],
    ["dashboard_snapshots", `dashboard_id = ${quoteString(dashboardId)}`],
    ["dashboards", `id = ${quoteString(dashboardId)}`],
  ] as const;

  const statements = deleteStatements
    .filter(
      ([table]) =>
        existingTables.has(table) &&
        (table !== "chart_slicers" || existingTables.has("dashboard_charts")),
    )
    .map(
      ([table, where]) => `DELETE FROM ${metadataTable(table)} WHERE ${where};`,
    );
  const response = await runClientCommand(args, deps, (client) =>
    client.query({ sql: statements.join("\n") }),
  );
  printJson({
    id: dashboardId,
    deleted: true,
    rowsChanged: response.rowsChanged,
  });
}

async function runDashboardOpen(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, [
    "database",
    "host",
    "no-open",
    "port",
    "project-dir",
    "token",
    "token-env",
  ]);

  const dashboardId = args.positionals[0]?.trim();
  const host = readStringFlag(args, "host") ?? DEFAULT_HOST;
  const openPath = dashboardId
    ? `${DASHBOARD_VIEW_PATH}?id=${encodeURIComponent(dashboardId)}&pondviewMode=dashboard`
    : DASHBOARD_MODE_PATH;

  const server = await startBridgeServer({
    host,
    port: readNumberFlag(args, "port") ?? DEFAULT_PORT,
    token: readToken(args),
    databasePath: readStringFlag(args, "database"),
    projectDir: readStringFlag(args, "project-dir"),
    serveUi: true,
    dashboardMode: true,
  });
  console.log(`Pondview local app listening at ${server.url}`);
  console.log("Press Ctrl+C to stop.");
  if (!args.flags.has("no-open")) {
    await deps.openBrowser(new URL(openPath, server.url).toString());
  }
  await deps.waitForShutdown();
  await server.stop();
}

async function runStop(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, ["force", "host", "port", "token", "token-env"]);
  const port = readNumberFlag(args, "port") ?? DEFAULT_PORT;
  const pids = await deps.findProcessIdsByPort(port);

  if (pids.length === 0) {
    console.log(`No process is listening on port ${port}.`);
    return;
  }

  if (!args.flags.has("force") && !(await deps.isPondviewBridgePort(args))) {
    throw new Error(
      `Port ${port} is in use, but it does not appear to be a Pondview bridge. Pass --force to stop it anyway.`,
    );
  }

  for (const pid of pids) {
    deps.killProcess(pid);
  }

  console.log(
    `Stopped ${pids.length === 1 ? "process" : "processes"} listening on port ${port}: ${pids.join(", ")}`,
  );
}

async function runDoctor(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  assertAllowedFlags(args, ["host", "port", "token", "token-env", "url"]);
  const url = getClientBaseUrl(args);
  const client = deps.createClient(args);
  const result: {
    ok: boolean;
    url: string;
    reachable: boolean;
    health?: Awaited<ReturnType<BridgeApiClient["health"]>>;
    capabilities?: Awaited<ReturnType<BridgeApiClient["capabilities"]>>;
    error?: string;
  } = {
    ok: false,
    url,
    reachable: false,
  };

  try {
    result.health = await client.health();
    result.reachable = true;
    result.capabilities = await client.capabilities();
    result.ok = true;
  } catch (error) {
    result.error = formatError(error);
  }

  printJson(result);
}

async function readQuerySql(args: ParsedArgs): Promise<string> {
  const inlineSql = args.positionals.join(" ").trim();
  const filePath = readStringFlag(args, "file");
  if (inlineSql && filePath) {
    throw new Error("Use either inline SQL or --file <path.sql>, not both.");
  }
  if (!filePath) {
    return inlineSql;
  }
  const sql = await readFile(filePath, "utf8");
  return sql.trim();
}

type QueryRow = Record<string, unknown>;

type DashboardSnapshot = {
  dashboard: QueryRow | null;
  charts: QueryRow[];
  measures: QueryRow[];
  slicers: QueryRow[];
  joinDefs: QueryRow[];
};

type ValidationIssue = {
  dashboardId?: string;
  entityType?: string;
  entityId?: string;
  message: string;
};

type DashboardValidationResult = {
  ok: boolean;
  dashboards: string[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

async function loadDashboardSummaries(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<QueryRow[]> {
  const tables = await listMetadataTables(args, deps);
  if (!tables.has("dashboards")) {
    return [];
  }
  const chartCount = tables.has("dashboard_charts")
    ? `(SELECT COUNT(*) FROM ${metadataTable("dashboard_charts")} c WHERE c.dashboard_id = d.id)`
    : "0";
  const measureCount = tables.has("dashboard_measures")
    ? `(SELECT COUNT(*) FROM ${metadataTable("dashboard_measures")} m WHERE m.dashboard_id = d.id)`
    : "0";
  const slicerCount = tables.has("dashboard_slicers")
    ? `(SELECT COUNT(*) FROM ${metadataTable("dashboard_slicers")} s WHERE s.dashboard_id = d.id)`
    : "0";
  return queryRows(
    args,
    deps,
    `SELECT
       d.id,
       d.title,
       d.updated_at,
       d.runtime_backend,
       ${chartCount} AS chart_count,
       ${measureCount} AS measure_count,
       ${slicerCount} AS slicer_count
     FROM ${metadataTable("dashboards")} d
     ORDER BY d.updated_at DESC;`,
  );
}

async function loadDashboardSnapshot(
  args: ParsedArgs,
  deps: Required<CliDeps>,
  dashboardId: string,
): Promise<DashboardSnapshot> {
  const tables = await listMetadataTables(args, deps);
  if (!tables.has("dashboards")) {
    return {
      dashboard: null,
      charts: [],
      measures: [],
      slicers: [],
      joinDefs: [],
    };
  }
  const dashboard =
    (
      await queryRows(
        args,
        deps,
        `SELECT * FROM ${metadataTable("dashboards")}
       WHERE id = ${quoteString(dashboardId)}
       LIMIT 1;`,
      )
    )[0] ?? null;
  return {
    dashboard,
    charts: await queryTableRows(
      args,
      deps,
      tables,
      "dashboard_charts",
      dashboardId,
    ),
    measures: await queryTableRows(
      args,
      deps,
      tables,
      "dashboard_measures",
      dashboardId,
    ),
    slicers: await queryTableRows(
      args,
      deps,
      tables,
      "dashboard_slicers",
      dashboardId,
    ),
    joinDefs: await queryTableRows(
      args,
      deps,
      tables,
      "dashboard_join_defs",
      dashboardId,
    ),
  };
}

async function queryTableRows(
  args: ParsedArgs,
  deps: Required<CliDeps>,
  tables: Set<string>,
  table: string,
  dashboardId: string,
): Promise<QueryRow[]> {
  if (!tables.has(table)) {
    return [];
  }
  return queryRows(
    args,
    deps,
    `SELECT * FROM ${metadataTable(table)}
     WHERE dashboard_id = ${quoteString(dashboardId)}
     ORDER BY ${table === "dashboard_join_defs" ? "position" : "created_at"};`,
  );
}

async function validateDashboards(
  args: ParsedArgs,
  deps: Required<CliDeps>,
  dashboardId: string | null,
): Promise<DashboardValidationResult> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const tables = await listMetadataTables(args, deps);
  if (!tables.has("dashboards")) {
    return {
      ok: false,
      dashboards: [],
      errors: [{ message: "Missing pondview.dashboards metadata table." }],
      warnings,
    };
  }

  const dashboardRows = await queryRows(
    args,
    deps,
    `SELECT * FROM ${metadataTable("dashboards")}
     ${dashboardId ? `WHERE id = ${quoteString(dashboardId)}` : ""}
     ORDER BY updated_at DESC;`,
  );
  if (dashboardId && dashboardRows.length === 0) {
    errors.push({
      dashboardId,
      message: `Dashboard "${dashboardId}" was not found.`,
    });
  }

  const dashboardIds = new Set(
    dashboardRows.map((row) => readRequiredString(row, "id")),
  );
  const charts = await queryAllMetadataRows(
    args,
    deps,
    tables,
    "dashboard_charts",
  );
  const measures = await queryAllMetadataRows(
    args,
    deps,
    tables,
    "dashboard_measures",
  );
  const slicers = await queryAllMetadataRows(
    args,
    deps,
    tables,
    "dashboard_slicers",
  );
  const scopedCharts = filterRowsByDashboards(charts, dashboardIds);
  const scopedMeasures = filterRowsByDashboards(measures, dashboardIds);
  const measureIds = new Set(
    scopedMeasures.map((row) => readRequiredString(row, "id")),
  );

  const rowsToCheckForMissingDashboard = dashboardId
    ? [...charts, ...measures, ...slicers].filter(
        (row) => readRequiredString(row, "dashboard_id") === dashboardId,
      )
    : [...charts, ...measures, ...slicers];
  for (const row of rowsToCheckForMissingDashboard) {
    const childDashboardId = readRequiredString(row, "dashboard_id");
    if (!dashboardIds.has(childDashboardId)) {
      errors.push({
        dashboardId: childDashboardId,
        entityId: readOptionalString(row, "id") ?? undefined,
        message: `Child row references missing dashboard "${childDashboardId}".`,
      });
    }
  }

  const runtimeBackendByDashboard = new Map<string, string | null>();
  for (const dashboard of dashboardRows) {
    const id = readRequiredString(dashboard, "id");
    const runtimeBackend = readOptionalString(dashboard, "runtime_backend");
    runtimeBackendByDashboard.set(id, runtimeBackend);
    const dashboardCharts = scopedCharts.filter(
      (row) => readRequiredString(row, "dashboard_id") === id,
    );
    if (dashboardCharts.length === 0) {
      warnings.push({
        dashboardId: id,
        message: "Dashboard has no charts.",
      });
    }
    if (runtimeBackend && runtimeBackend !== "bridge") {
      warnings.push({
        dashboardId: id,
        message: `Dashboard runtime is "${runtimeBackend}" while validating through the bridge.`,
      });
    }
  }

  for (const chart of scopedCharts) {
    validateDashboardEntity({
      row: chart,
      entityType: "chart",
      dashboardRuntimeBackend: runtimeBackendByDashboard.get(
        readRequiredString(chart, "dashboard_id"),
      ),
      measureIds,
      errors,
      warnings,
    });
    await validateStoredSql(args, deps, chart, "chart", errors);
  }

  for (const measure of scopedMeasures) {
    validateDashboardEntity({
      row: measure,
      entityType: "measure",
      dashboardRuntimeBackend: runtimeBackendByDashboard.get(
        readRequiredString(measure, "dashboard_id"),
      ),
      measureIds,
      errors,
      warnings,
    });
    await validateStoredSql(args, deps, measure, "measure", errors);
  }

  return {
    ok: errors.length === 0,
    dashboards: dashboardRows.map((row) => readRequiredString(row, "id")),
    errors,
    warnings,
  };
}

function validateDashboardEntity(input: {
  row: QueryRow;
  entityType: "chart" | "measure";
  dashboardRuntimeBackend?: string | null;
  measureIds: Set<string>;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}): void {
  const {
    row,
    entityType,
    dashboardRuntimeBackend,
    measureIds,
    errors,
    warnings,
  } = input;
  const dashboardId = readRequiredString(row, "dashboard_id");
  const entityId = readRequiredString(row, "id");
  const sourceDescriptor = parseJsonObject(
    readOptionalString(row, "source_descriptor_json"),
  );
  if (!sourceDescriptor) {
    errors.push({
      dashboardId,
      entityType,
      entityId,
      message: "Invalid source_descriptor_json.",
    });
  }
  const sqlBackend = readOptionalString(row, "sql_backend");
  const descriptorBackend = readOptionalString(
    sourceDescriptor,
    "runtimeBackend",
  );
  if (dashboardRuntimeBackend && sqlBackend !== dashboardRuntimeBackend) {
    errors.push({
      dashboardId,
      entityType,
      entityId,
      message: `Runtime mismatch: dashboard runtime_backend is "${dashboardRuntimeBackend}" but sql_backend is "${sqlBackend}".`,
    });
  }
  if (sourceDescriptor && sqlBackend && descriptorBackend !== sqlBackend) {
    errors.push({
      dashboardId,
      entityType,
      entityId,
      message: `Runtime mismatch: sql_backend is "${sqlBackend}" but source descriptor runtimeBackend is "${descriptorBackend}".`,
    });
  }
  if (!readOptionalString(row, "title") && entityType === "chart") {
    warnings.push({
      dashboardId,
      entityType,
      entityId,
      message: "Chart is missing an optional title.",
    });
  }
  if (!readOptionalString(row, "description") && entityType === "chart") {
    warnings.push({
      dashboardId,
      entityType,
      entityId,
      message: "Chart is missing an optional description.",
    });
  }
  if (entityType !== "chart") {
    return;
  }
  const chartConfig = parseJsonObject(
    readOptionalString(row, "chart_config_json"),
  );
  if (!chartConfig) {
    errors.push({
      dashboardId,
      entityType,
      entityId,
      message: "Invalid chart_config_json.",
    });
    return;
  }
  const measureId = readOptionalString(chartConfig, "measureId");
  if (measureId && !measureIds.has(measureId)) {
    errors.push({
      dashboardId,
      entityType,
      entityId,
      message: `Card config references missing measureId "${measureId}".`,
    });
  }
}

async function validateStoredSql(
  args: ParsedArgs,
  deps: Required<CliDeps>,
  row: QueryRow,
  entityType: "chart" | "measure",
  errors: ValidationIssue[],
): Promise<void> {
  const sql = readOptionalString(row, "sql");
  if (!sql) {
    return;
  }
  try {
    await runClientCommand(args, deps, (client) =>
      client.query({ sql: buildPreviewSql(sql) }),
    );
  } catch (error) {
    errors.push({
      dashboardId: readRequiredString(row, "dashboard_id"),
      entityType,
      entityId: readRequiredString(row, "id"),
      message: `SQL preview failed: ${formatError(error)}`,
    });
  }
}

async function assertDashboardExists(
  args: ParsedArgs,
  deps: Required<CliDeps>,
  dashboardId: string,
): Promise<void> {
  if (!(await hasMetadataTable(args, deps, "dashboards"))) {
    throw new Error("Missing pondview.dashboards metadata table.");
  }
  const rows = await queryRows(
    args,
    deps,
    `SELECT id FROM ${metadataTable("dashboards")}
     WHERE id = ${quoteString(dashboardId)}
     LIMIT 1;`,
  );
  if (rows.length === 0) {
    throw new Error(`Dashboard "${dashboardId}" was not found.`);
  }
}

async function queryAllMetadataRows(
  args: ParsedArgs,
  deps: Required<CliDeps>,
  tables: Set<string>,
  table: string,
): Promise<QueryRow[]> {
  if (!tables.has(table)) {
    return [];
  }
  return queryRows(args, deps, `SELECT * FROM ${metadataTable(table)};`);
}

async function hasMetadataTable(
  args: ParsedArgs,
  deps: Required<CliDeps>,
  table: string,
): Promise<boolean> {
  return (await listMetadataTables(args, deps)).has(table);
}

async function listMetadataTables(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<Set<string>> {
  const rows = await queryRows(
    args,
    deps,
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = ${quoteString(METADATA_SCHEMA)};`,
  );
  return new Set(rows.map((row) => readRequiredString(row, "table_name")));
}

async function queryRows(
  args: ParsedArgs,
  deps: Required<CliDeps>,
  sql: string,
): Promise<QueryRow[]> {
  const response = await runClientCommand(args, deps, (client) =>
    client.query({ sql }),
  );
  return response.rows as QueryRow[];
}

function filterRowsByDashboards(rows: QueryRow[], dashboardIds: Set<string>) {
  return rows.filter((row) =>
    dashboardIds.has(readRequiredString(row, "dashboard_id")),
  );
}

function requireDashboardId(args: ParsedArgs): string {
  const id = args.positionals[0]?.trim();
  if (!id) {
    throw new Error("Dashboard id is required.");
  }
  return id;
}

function metadataTable(table: string): string {
  return `${quoteIdentifier(METADATA_SCHEMA)}.${quoteIdentifier(table)}`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function readRequiredString(row: QueryRow | null, key: string): string {
  return readOptionalString(row, key) ?? "";
}

function readOptionalString(row: QueryRow | null, key: string): string | null {
  const value = row?.[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function parseJsonObject(value: string | null): QueryRow | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as QueryRow)
      : null;
  } catch {
    return null;
  }
}

function buildPreviewSql(sql: string): string {
  return `SELECT * FROM (${stripTrailingSemicolon(sql)}) LIMIT 1;`;
}

function stripTrailingSemicolon(sql: string): string {
  return sql.trim().replace(/;+$/, "").trim();
}

async function runClientCommand<T>(
  args: ParsedArgs,
  deps: Required<CliDeps>,
  operation: (client: BridgeApiClient) => Promise<T>,
): Promise<T> {
  try {
    return await operation(deps.createClient(args));
  } catch (error) {
    if (!shouldAutostart(args, error)) {
      throw error;
    }
  }

  deps.startBridgeProcess(args);
  await waitForBridgeHealth(args, deps);
  console.warn(`Started Pondview bridge at ${getClientBaseUrl(args)}`);
  return operation(deps.createClient(args));
}

async function waitForBridgeHealth(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < AUTOSTART_TIMEOUT_MS) {
    try {
      await deps.createClient(args).health();
      return;
    } catch (error) {
      lastError = error;
      await deps.sleep(AUTOSTART_POLL_INTERVAL_MS);
    }
  }

  throw new Error(
    `Started Pondview bridge but it did not become ready: ${formatError(lastError)}`,
  );
}

function shouldAutostart(args: ParsedArgs, error: unknown): boolean {
  return (
    !args.flags.has("url") &&
    !args.flags.has("no-autostart") &&
    isConnectionFailure(error)
  );
}

function isConnectionFailure(error: unknown): boolean {
  const message = formatError(error);
  return /ECONNREFUSED|Connection refused|Unable to connect|fetch failed|Failed to fetch|NetworkError/i.test(
    message,
  );
}

function createClient(args: ParsedArgs): BridgeApiClient {
  return new BridgeClient({
    baseUrl: getClientBaseUrl(args),
    token: readToken(args),
  });
}

function getClientBaseUrl(args: ParsedArgs): string {
  const port = readNumberFlag(args, "port") ?? DEFAULT_PORT;
  const host = readStringFlag(args, "host") ?? DEFAULT_HOST;
  return readStringFlag(args, "url") ?? `http://${host}:${port}`;
}

function startBridgeProcess(args: ParsedArgs): void {
  const childArgs = [fileURLToPath(import.meta.url), "start", "--no-ui"];
  appendFlag(childArgs, args, "host");
  appendFlag(childArgs, args, "port");
  appendFlag(childArgs, args, "token");
  appendFlag(childArgs, args, "token-env");
  appendFlag(childArgs, args, "database");
  appendFlag(childArgs, args, "project-dir");

  const subprocess = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: "ignore",
  });
  subprocess.unref();
}

function appendFlag(target: string[], args: ParsedArgs, name: string): void {
  const value = readStringFlag(args, name);
  if (value) {
    target.push(`--${name}`, value);
  }
}

async function findProcessIdsByPort(port: number): Promise<number[]> {
  const proc = spawn("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = await readStream(proc.stdout);
  await waitForExit(proc);

  return output
    .split(/\s+/)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));
}

async function isPondviewBridgePort(args: ParsedArgs): Promise<boolean> {
  const response = await fetch(`${getClientBaseUrl(args)}/ping`, {
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) {
    return false;
  }

  const payload = (await response.json().catch(() => null)) as {
    status?: string;
  } | null;
  return payload?.status === "ok";
}

function killProcess(pid: number): void {
  process.kill(pid, "SIGTERM");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  await new Promise<void>((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("close", () => resolveExit());
  });
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error ? `: ${error.cause.message}` : "";
    return `${error.message}${cause}`;
  }
  return String(error);
}

function readToken(args: ParsedArgs): string | undefined {
  const token = readStringFlag(args, "token");
  if (token) {
    return token;
  }

  const tokenEnvValue = args.flags.get("token-env");
  if (tokenEnvValue === true) {
    throw new Error("Missing required value for --token-env <name>.");
  }

  const tokenEnv = readStringFlag(args, "token-env");
  if (tokenEnv) {
    const envToken = process.env[tokenEnv]?.trim();
    if (!envToken) {
      throw new Error(
        `Environment variable ${tokenEnv} is not set or is empty.`,
      );
    }
    return envToken;
  }

  return process.env.PONDVIEW_TOKEN;
}

function parseArgs(argv: string[]): ParsedArgs {
  const first = argv[0];
  const command = first && !first.startsWith("-") ? first : "";
  const rest = command ? argv.slice(1) : argv;
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "-h") {
      flags.set("help", true);
      continue;
    }
    if (!value?.startsWith("--")) {
      if (value) {
        positionals.push(value);
      }
      continue;
    }

    const [rawName, inlineValue] = value.slice(2).split("=", 2);
    if (!rawName) {
      continue;
    }

    if (inlineValue !== undefined) {
      flags.set(rawName, inlineValue);
      continue;
    }

    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(rawName, next);
      index += 1;
    } else {
      flags.set(rawName, true);
    }
  }

  return { command, positionals, flags };
}

function printRequestedHelp(args: ParsedArgs): boolean {
  if (!isHelpRequest(args)) {
    return false;
  }

  const command = args.command === "help" ? args.positionals[0] : args.command;
  const subcommand =
    args.command === "help" ? args.positionals[1] : args.positionals[0];
  printHelp(command, subcommand);
  return true;
}

function isHelpRequest(args: ParsedArgs): boolean {
  return (
    args.command === "help" ||
    args.command === "--help" ||
    args.command === "-h" ||
    args.flags.has("help")
  );
}

function assertAllowedFlags(
  args: ParsedArgs,
  allowedFlags: readonly string[],
): void {
  const allowed = new Set(allowedFlags);
  for (const name of args.flags.keys()) {
    if (!allowed.has(name)) {
      throw new Error(
        `Unsupported flag for pondview ${args.command}: --${name}`,
      );
    }
  }
}

function readStringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function readNumberFlag(args: ParsedArgs, name: string): number | undefined {
  const value = readStringFlag(args, name);
  if (!value) {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid --${name} value: ${value}`);
  }
  const parsed = Number.parseInt(value, 10);
  if (name === "port" && parsed > 65_535) {
    throw new Error(`Invalid --${name} value: ${value}`);
  }
  return parsed;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function localSourceBindingsFilePath(args: ParsedArgs): string {
  return resolve(
    readStringFlag(args, "project-dir") ??
      process.env.INIT_CWD ??
      process.cwd(),
    LOCAL_SOURCE_BINDINGS_PATH,
  );
}

async function readLocalSourceBindings(
  args: ParsedArgs,
): Promise<LocalSourceBindingsFile> {
  const path = localSourceBindingsFilePath(args);
  if (!existsSync(path)) {
    return { schemaVersion: 1, bindings: {} };
  }

  const parsed = JSON.parse(
    await readFile(path, "utf8"),
  ) as Partial<LocalSourceBindingsFile>;
  if (parsed.schemaVersion !== 1 || typeof parsed.bindings !== "object") {
    throw new Error(
      `${LOCAL_SOURCE_BINDINGS_PATH} is not a valid source file.`,
    );
  }

  return {
    schemaVersion: 1,
    bindings: parsed.bindings ?? {},
  };
}

async function writeLocalSourceBindings(
  args: ParsedArgs,
  file: LocalSourceBindingsFile,
): Promise<void> {
  const path = localSourceBindingsFilePath(args);
  const sorted: LocalSourceBindingsFile = {
    schemaVersion: 1,
    bindings: Object.fromEntries(
      Object.entries(file.bindings).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

function isProjectSourceRef(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefined(item))
      .filter((item) => item !== undefined) as T;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefined(entryValue)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

function resolveStartOpenUrl(baseUrl: string, args: ParsedArgs): string {
  if (!args.flags.has("dashboard-mode")) {
    return baseUrl;
  }
  return new URL(DASHBOARD_MODE_PATH, baseUrl).toString();
}

function printHelp(command?: string, subcommand?: string): void {
  switch (command) {
    case undefined:
    case "":
    case "--help":
    case "-h":
      printTopLevelHelp();
      break;
    case "start":
      printStartHelp();
      break;
    case "attach":
      printAttachHelp();
      break;
    case "list-sources":
      printListSourcesHelp();
      break;
    case "detach":
      printDetachHelp();
      break;
    case "query":
      printQueryHelp();
      break;
    case "dashboard":
      printDashboardHelp(subcommand);
      break;
    case "source":
      printSourceHelp(subcommand);
      break;
    case "doctor":
      printDoctorHelp();
      break;
    case "stop":
      printStopHelp();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function printTopLevelHelp(): void {
  console.log(`Work with Pondview projects from the command line.

Usage:
  pondview [command]

Local Runtime
  start          Start the local Pondview app and bridge API

Data
  attach         Attach a DuckDB database source
  list-sources   List attached database sources
  detach         Detach a database source
  source         Manage project-local source bindings
  query          Run SQL through the bridge

Dashboards
  dashboard      Inspect, validate, open, and maintain dashboards

Diagnostics
  doctor         Check bridge connectivity and capabilities
  stop           Stop a local Pondview bridge by port

Flags:
  -h, --help              Print usage
      --host <host>       Local bridge host (default: 127.0.0.1)
      --port <port>       Local bridge port (default: 17817)
      --database <file>   Open a DuckDB file as the primary database
      --project-dir <dir> Filesystem project root
      --token <token>     Bearer token
      --token-env <name>  Read bearer token from an environment variable

Run "pondview" without a command to start the local app.
Use "pondview <command> --help" for more information about a command.
`);
}

function printStartHelp(): void {
  console.log(`Start the local Pondview runtime.

Usage:
  pondview start [flags]

Examples:
  pondview start
  pondview start --database ./analytics.duckdb
  pondview start --no-ui
  pondview start --dashboard-mode --no-open

Flags:
      --host <host>        Local bridge host (default: 127.0.0.1)
      --port <port>        Local bridge port (default: 17817)
      --database <file>    Open a DuckDB file as the primary database
      --project-dir <dir>  Filesystem project root (default: launch directory)
      --dashboard-mode     Open a view-only dashboards UI
      --no-open            Do not open the browser
      --no-ui              Start the bridge API only
      --token <token>      Require a bearer token
      --token-env <name>   Read bearer token from an environment variable
`);
}

function printAttachHelp(): void {
  console.log(`Attach a DuckDB database source.

Usage:
  pondview attach <file.duckdb|s3://...> --as <alias> [--readonly]

Flags:
      --as <alias>         Source alias
      --readonly           Attach the source readonly
      --url <url>          Bridge URL for client commands
      --no-autostart       Do not start a local bridge if unreachable
`);
}

function printListSourcesHelp(): void {
  console.log(`List attached database sources.

Usage:
  pondview list-sources [--url <url>] [--no-autostart]
`);
}

function printSourceHelp(subcommand?: string): void {
  if (subcommand === "add") {
    console.log(`Add a project-local source binding.

Usage:
  pondview source add <source-ref> --sql <sql> [flags]

Flags:
      --sql <sql>                         Raw DuckDB setup SQL to prepare the source
      --sql-file <path>                   Read raw DuckDB setup SQL from a file
      --catalog-context <schema>          Default catalog/schema context
      --runtime <bridge|duckdb-wasm>      Runtime backend (default: bridge)
      --project-dir <dir>                 Filesystem project root
`);
    return;
  }

  console.log(`Manage project-local source bindings.

Usage:
  pondview source add <source-ref> --sql <sql>
  pondview source list
  pondview source remove <source-ref>

Source bindings are written to ${LOCAL_SOURCE_BINDINGS_PATH}.
`);
}

function printDetachHelp(): void {
  console.log(`Detach a database source.

Usage:
  pondview detach <source-id-or-alias> [--url <url>] [--no-autostart]
`);
}

function printQueryHelp(): void {
  console.log(`Run SQL through the bridge.

Usage:
  pondview query <sql>
  pondview query --file statement.sql

Flags:
      --file <path>        Read SQL from a UTF-8 file
      --url <url>          Bridge URL for client commands
      --no-autostart       Do not start a local bridge if unreachable
`);
}

function printDashboardHelp(subcommand?: string): void {
  if (subcommand === "open") {
    console.log(`Open dashboards in the local Pondview app.

Usage:
  pondview dashboard open [dashboard-id] [flags]

Flags:
      --host <host>        Local bridge host (default: 127.0.0.1)
      --port <port>        Local bridge port (default: 17817)
      --database <file>    Open a DuckDB file as the primary database
      --project-dir <dir>  Filesystem project root
      --no-open            Do not open the browser
`);
    return;
  }

  console.log(`Inspect and maintain dashboard metadata.

Usage:
  pondview dashboard <command>

Commands:
  list                 List dashboards
  show <dashboard-id>  Print a dashboard metadata snapshot
  validate [id]        Validate dashboard metadata and stored SQL
  rename <id> --title  Rename a dashboard
  delete <id> --yes    Delete a dashboard and dependent metadata
  open [id]            Open dashboards in the local app

Use "pondview dashboard open --help" for open-specific flags.
`);
}

function printDoctorHelp(): void {
  console.log(`Check bridge connectivity and capabilities.

Usage:
  pondview doctor [--url <url>]
`);
}

function printStopHelp(): void {
  console.log(`Stop a local Pondview bridge by port.

Usage:
  pondview stop [--port 17817] [--force]

Flags:
      --port <port>        Local bridge port (default: 17817)
      --force              Stop whatever is listening on the port
`);
}

function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    process.on("SIGINT", resolve);
    process.on("SIGTERM", resolve);
  });
}

if (import.meta.main) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
