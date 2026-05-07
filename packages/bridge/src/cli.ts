#!/usr/bin/env bun
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

interface BridgeApiClient {
  health: BridgeClient["health"];
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
  sleep?: (ms: number) => Promise<void>;
}

const defaultDeps = {
  openBrowser,
  waitForShutdown,
  createClient,
  startBridgeProcess,
  sleep,
} satisfies Required<CliDeps>;

export async function runCli(
  argv: string[],
  deps: CliDeps = {},
): Promise<void> {
  const args = parseArgs(argv);
  const resolvedDeps = { ...defaultDeps, ...deps };

  switch (args.command) {
    case "bridge":
      await runBridge(args, resolvedDeps);
      break;
    case "serve":
      await runServe(args, resolvedDeps);
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
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      if (!args.command) {
        printHelp();
        return;
      }
      throw new Error(`Unknown command: ${args.command}`);
  }
}

async function runBridge(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  const host = readStringFlag(args, "host") ?? DEFAULT_HOST;
  const port = readNumberFlag(args, "port") ?? DEFAULT_PORT;
  const token = readToken(args);
  const readonly = args.flags.has("readonly");

  const server = await startBridgeServer({ host, port, token, readonly });
  console.log(`Pondview bridge listening at ${server.url}`);
  console.log("Press Ctrl+C to stop.");

  await deps.waitForShutdown();
  await server.stop();
}

async function runServe(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
  const host = readStringFlag(args, "host") ?? DEFAULT_HOST;
  const port = readNumberFlag(args, "port") ?? DEFAULT_PORT;
  const token = readToken(args);
  const readonly = args.flags.has("readonly");

  const server = await startBridgeServer({
    host,
    port,
    token,
    readonly,
    serveUi: true,
  });
  console.log(`Pondview local app listening at ${server.url}`);
  console.log("Press Ctrl+C to stop.");

  if (!args.flags.has("no-open")) {
    await deps.openBrowser(server.url).catch((error) => {
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
  printJson(await runClientCommand(args, deps, (client) => client.sources()));
}

async function runDetach(
  args: ParsedArgs,
  deps: Required<CliDeps>,
): Promise<void> {
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
  const sql = args.positionals.join(" ").trim();
  if (!sql) {
    throw new Error("Usage: pondview query <sql>");
  }
  printJson(
    await runClientCommand(args, deps, (client) => client.query({ sql })),
  );
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
  const childArgs = [import.meta.path, "bridge"];
  appendFlag(childArgs, args, "host");
  appendFlag(childArgs, args, "port");
  appendFlag(childArgs, args, "token");
  appendFlag(childArgs, args, "token-env");
  if (args.flags.has("readonly")) {
    childArgs.push("--readonly");
  }

  const subprocess = Bun.spawn([process.execPath, ...childArgs], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  subprocess.unref();
}

function appendFlag(target: string[], args: ParsedArgs, name: string): void {
  const value = readStringFlag(args, name);
  if (value) {
    target.push(`--${name}`, value);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const tokenEnv = readStringFlag(args, "token-env");
  if (tokenEnv) {
    return process.env[tokenEnv];
  }

  return process.env.PONDVIEW_TOKEN;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "", ...rest] = argv;
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
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

function readStringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function readNumberFlag(args: ParsedArgs, name: string): number | undefined {
  const value = readStringFlag(args, name);
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid --${name} value: ${value}`);
  }
  return parsed;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp(): void {
  console.log(`Pondview CLI

Usage:
  pondview bridge [--host 127.0.0.1] [--port 17817] [--readonly]
  pondview serve [--host 127.0.0.1] [--port 17817] [--readonly] [--no-open]
  pondview attach <file.duckdb|s3://...> --as <alias> [--readonly]
  pondview list-sources
  pondview detach <source-id-or-alias>
  pondview query <sql>

Client flags:
  --url <url>             Bridge URL for client commands
  --token <token>         Bearer token
  --token-env <name>      Read bearer token from an environment variable
  --no-autostart          Do not start a local bridge for client commands
  --no-open               Do not open the browser for pondview serve
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
