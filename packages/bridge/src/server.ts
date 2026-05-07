import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  bridgeAttachSourceRequestSchema,
  bridgeQueryRequestSchema,
} from "@pondview/bridge-protocol";
import { DuckDbRuntime } from "./runtime/duckdb-runtime";
import { BRIDGE_VERSION } from "./version";

export interface BridgeServerOptions {
  host?: string;
  port?: number;
  token?: string;
  readonly?: boolean;
  serveUi?: boolean;
  staticDir?: string;
}

export interface BridgeServerHandle {
  url: string;
  stop: () => Promise<void>;
}

export async function startBridgeServer(
  options: BridgeServerOptions = {},
): Promise<BridgeServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 17817;
  const runtime = new DuckDbRuntime({ readonly: options.readonly });

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(request) {
      return handleRequest(request, runtime, options);
    },
  });

  return {
    url: `http://${server.hostname}:${server.port}`,
    stop: () => Promise.resolve(server.stop(true)),
  };
}

export async function handleBridgeRequest(
  request: Request,
  runtime: DuckDbRuntime,
  options: BridgeServerOptions,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return json(null, { status: 204 });
  }

  const url = new URL(request.url);

  try {
    if (request.method === "GET" && url.pathname === "/ping") {
      return json({ status: "ok" });
    }

    if (request.method === "GET" && url.pathname === "/api/duckdb/config") {
      return json({
        host: options.host ?? "127.0.0.1",
        port: options.port ?? 17817,
        requires_auth: Boolean(options.token),
      });
    }

    if (!isAuthorized(request, options.token)) {
      return errorResponse("Unauthorized", 401, "unauthorized");
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "pondview-bridge",
        version: BRIDGE_VERSION,
        runtime: {
          backend: "bridge",
          duckdb: await runtime.version(),
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/capabilities") {
      return json({
        runtimeBackend: "bridge",
        query: true,
        catalog: true,
        attachDuckDb: true,
        importFiles: false,
        projects: false,
        readonly: options.readonly ?? false,
      });
    }

    if (request.method === "GET" && url.pathname === "/catalog") {
      return json(await runtime.catalog());
    }

    if (request.method === "POST" && url.pathname === "/query") {
      const input = bridgeQueryRequestSchema.parse(await request.json());
      return json(await runtime.query(input.sql, input.limit));
    }

    if (request.method === "GET" && url.pathname === "/sources") {
      return json({ sources: runtime.listSources() });
    }

    if (request.method === "POST" && url.pathname === "/sources/attach") {
      const input = bridgeAttachSourceRequestSchema.parse(await request.json());
      await runtime.attachDuckDb(input);
      return json({ sources: runtime.listSources() });
    }

    const detachMatch = url.pathname.match(/^\/sources\/([^/]+)$/);
    if (request.method === "DELETE" && detachMatch) {
      await runtime.detachSource(decodeURIComponent(detachMatch[1] ?? ""));
      return json({ sources: runtime.listSources() });
    }

    return errorResponse("Not found", 404, "not_found");
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Bridge request failed",
      400,
      "bad_request",
    );
  }
}

async function handleRequest(
  request: Request,
  runtime: DuckDbRuntime,
  options: BridgeServerOptions,
): Promise<Response> {
  const apiResponse = await handleBridgeRequest(request, runtime, options);
  if (
    !options.serveUi ||
    apiResponse.status !== 404 ||
    request.method !== "GET"
  ) {
    return apiResponse;
  }

  return serveStaticUi(request, options.staticDir);
}

function isAuthorized(request: Request, token: string | undefined): boolean {
  if (!token) {
    return true;
  }
  return (
    request.headers.get("authorization") === `Bearer ${token}` ||
    request.headers.get("x-api-key") === token
  );
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization");
  if (body !== null) {
    headers.set("content-type", "application/json");
  }
  return new Response(body === null ? null : JSON.stringify(body), {
    ...init,
    headers,
  });
}

function errorResponse(
  message: string,
  status: number,
  code: string,
): Response {
  return json(
    {
      error: {
        message,
        code,
      },
    },
    { status },
  );
}

async function serveStaticUi(
  request: Request,
  staticDir = defaultStaticDir(),
): Promise<Response> {
  const root = resolve(staticDir);
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(root, `.${requestedPath}`);

  if (!filePath.startsWith(root)) {
    return errorResponse("Not found", 404, "not_found");
  }

  if (existsSync(filePath)) {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file, {
        headers: {
          "content-type": contentTypeForPath(filePath),
        },
      });
    }
  }

  const indexPath = resolve(root, "index.html");
  const indexFile = Bun.file(indexPath);
  if (await indexFile.exists()) {
    return new Response(indexFile, {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  return errorResponse(
    `Bundled Pondview UI was not found at ${indexPath}. Run bun run bridge:build-ui to build packages/bridge/dist first.`,
    404,
    "ui_not_built",
  );
}

function defaultStaticDir(): string {
  return resolve(import.meta.dirname, "../dist");
}

function contentTypeForPath(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}
