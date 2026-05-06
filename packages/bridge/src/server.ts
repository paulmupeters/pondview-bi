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

async function handleRequest(
  request: Request,
  runtime: DuckDbRuntime,
  options: BridgeServerOptions,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return json(null, { status: 204 });
  }

  if (!isAuthorized(request, options.token)) {
    return errorResponse("Unauthorized", 401, "unauthorized");
  }

  const url = new URL(request.url);

  try {
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

function isAuthorized(request: Request, token: string | undefined): boolean {
  if (!token) {
    return true;
  }
  return request.headers.get("authorization") === `Bearer ${token}`;
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
