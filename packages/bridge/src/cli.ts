#!/usr/bin/env bun
import { BridgeClient } from "@pondview/bridge-protocol";
import { startBridgeServer } from "./server";

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Map<string, string | boolean>;
}

const DEFAULT_PORT = 17817;
const DEFAULT_HOST = "127.0.0.1";

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  switch (args.command) {
    case "bridge":
    case "serve":
      await runServe(args);
      break;
    case "attach":
      await runAttach(args);
      break;
    case "list-sources":
      await runListSources(args);
      break;
    case "detach":
      await runDetach(args);
      break;
    case "query":
      await runQuery(args);
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

async function runServe(args: ParsedArgs): Promise<void> {
  const host = readStringFlag(args, "host") ?? DEFAULT_HOST;
  const port = readNumberFlag(args, "port") ?? DEFAULT_PORT;
  const token = readToken(args);
  const readonly = args.flags.has("readonly");

  const server = await startBridgeServer({ host, port, token, readonly });
  console.log(`Pondview bridge listening at ${server.url}`);
  console.log("Press Ctrl+C to stop.");

  await new Promise<void>((resolve) => {
    process.on("SIGINT", resolve);
    process.on("SIGTERM", resolve);
  });
  await server.stop();
}

async function runAttach(args: ParsedArgs): Promise<void> {
  const identifier = args.positionals[0];
  if (!identifier) {
    throw new Error("Usage: pondview attach <duckdb-file-or-url> --as <alias>");
  }

  const alias = readStringFlag(args, "as");
  if (!alias) {
    throw new Error("Missing required --as <alias> flag.");
  }

  const client = createClient(args);
  const response = await client.attachSource({
    identifier,
    alias,
    readonly: args.flags.has("readonly") ? true : undefined,
  });
  printJson(response);
}

async function runListSources(args: ParsedArgs): Promise<void> {
  printJson(await createClient(args).sources());
}

async function runDetach(args: ParsedArgs): Promise<void> {
  const id = args.positionals[0];
  if (!id) {
    throw new Error("Usage: pondview detach <source-id-or-alias>");
  }
  printJson(await createClient(args).detachSource(id));
}

async function runQuery(args: ParsedArgs): Promise<void> {
  const sql = args.positionals.join(" ").trim();
  if (!sql) {
    throw new Error("Usage: pondview query <sql>");
  }
  printJson(await createClient(args).query({ sql }));
}

function createClient(args: ParsedArgs): BridgeClient {
  const port = readNumberFlag(args, "port") ?? DEFAULT_PORT;
  const host = readStringFlag(args, "host") ?? DEFAULT_HOST;
  const baseUrl = readStringFlag(args, "url") ?? `http://${host}:${port}`;
  return new BridgeClient({ baseUrl, token: readToken(args) });
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
  pondview serve [--host 127.0.0.1] [--port 17817] [--readonly]
  pondview attach <file.duckdb|s3://...> --as <alias> [--readonly]
  pondview list-sources
  pondview detach <source-id-or-alias>
  pondview query <sql>

Client flags:
  --url <url>             Bridge URL for client commands
  --token <token>         Bearer token
  --token-env <name>      Read bearer token from an environment variable
`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
