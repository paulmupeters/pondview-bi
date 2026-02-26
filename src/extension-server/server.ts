/* biome-ignore-all lint/suspicious/noExplicitAny: extension adapter uses intentional boundary casts */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { promises as fs } from "node:fs";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import * as chartRoute from "../app/api/charts/[chartId]/route";
import * as chartSlicersRoute from "../app/api/charts/[chartId]/slicers/route";
import * as chatRoute from "../app/api/chat/[chatId]/route";
import * as chatMessageRoute from "../app/api/chat/[chatId]/message/route";
import * as chatMessageArtifactRoute from "../app/api/chat/[chatId]/message/[messageId]/artifact/route";
import * as chatMessageDeleteRoute from "../app/api/chat/[chatId]/message/[messageId]/route";
import * as legacyChatRoute from "../app/api/chat/route";
import * as chatsRoute from "../app/api/chats/route";
import * as dashboardChartsRoute from "../app/api/dashboard/[dashboardId]/charts/route";
import * as dashboardDataRoute from "../app/api/dashboard/[dashboardId]/data/route";
import * as dashboardDimensionValuesRoute from "../app/api/dashboard/[dashboardId]/dimension-values/route";
import * as dashboardDimensionsRoute from "../app/api/dashboard/[dashboardId]/dimensions/route";
import * as dashboardSlicersRoute from "../app/api/dashboard/[dashboardId]/slicers/route";
import * as dashboardsRoute from "../app/api/dashboards/route";
import * as dashboardsIdRoute from "../app/api/dashboards/[dashboardId]/route";
import * as duckdbConfigRoute from "../app/api/duckdb/config/route";
import * as duckdbQueryRoute from "../app/api/duckdb/query/route";
import * as duckdbSecretsRoute from "../app/api/duckdb/secrets/route";
import * as duckdbTablesRoute from "../app/api/duckdb/tables/route";
import * as materializedTablesRoute from "../app/api/semantic-layer/materialized-tables/route";
import * as semanticSourcesRoute from "../app/api/semantic-layer/sources/route";
import * as tablesRoute from "../app/api/tables/route";
import * as uploadRoute from "../app/api/upload/route";
import * as uploadFileRoute from "../app/api/upload/[fileId]/route";

const PORT = Number(process.env.EXTENSION_SERVER_PORT || 4318);
const STATIC_ROOT = process.env.STATIC_OUT_DIR || join(process.cwd(), "out");

type Handler = (
  request: Request,
  params: Record<string, string>,
) => Promise<Response>;

type Route = {
  method: string;
  pattern: RegExp;
  handler: Handler;
};

function routeResponseNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405 });
}

const routes: Route[] = [
  {
    method: "GET",
    pattern: /^\/api\/tables$/,
    handler: (request) => tablesRoute.GET(request as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/chats$/,
    handler: () => chatsRoute.GET(),
  },
  {
    method: "GET",
    pattern: /^\/api\/chat\/([^/]+)$/,
    handler: (request, params) =>
      chatRoute.GET(request as any, {
        params: Promise.resolve({ chatId: params.chatId }),
      } as any),
  },
  {
    method: "POST",
    pattern: /^\/api\/chat\/([^/]+)$/,
    handler: (request, params) =>
      chatRoute.POST(request as any, {
        params: Promise.resolve({ chatId: params.chatId }),
      } as any),
  },
  {
    method: "DELETE",
    pattern: /^\/api\/chat\/([^/]+)$/,
    handler: (request, params) =>
      chatRoute.DELETE(request as any, {
        params: Promise.resolve({ chatId: params.chatId }),
      } as any),
  },
  {
    method: "POST",
    pattern: /^\/api\/chat\/([^/]+)\/message$/,
    handler: (request, params) =>
      chatMessageRoute.POST(request as any, {
        params: Promise.resolve({ chatId: params.chatId }),
      } as any),
  },
  {
    method: "DELETE",
    pattern: /^\/api\/chat\/([^/]+)\/message\/([^/]+)$/,
    handler: (request, params) =>
      chatMessageDeleteRoute.DELETE(request as any, {
        params: Promise.resolve({
          chatId: params.chatId,
          messageId: params.messageId,
        }),
      } as any),
  },
  {
    method: "PUT",
    pattern: /^\/api\/chat\/([^/]+)\/message\/([^/]+)\/artifact$/,
    handler: (request, params) =>
      chatMessageArtifactRoute.PUT(request as any, {
        params: Promise.resolve({
          chatId: params.chatId,
          messageId: params.messageId,
        }),
      } as any),
  },
  {
    method: "POST",
    pattern: /^\/api\/chat$/,
    handler: (request) => legacyChatRoute.POST(request as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/dashboards$/,
    handler: () => dashboardsRoute.GET(),
  },
  {
    method: "POST",
    pattern: /^\/api\/dashboards$/,
    handler: (request) => dashboardsRoute.POST(request as any),
  },
  {
    method: "DELETE",
    pattern: /^\/api\/dashboards\/([^/]+)$/,
    handler: (request, params) =>
      dashboardsIdRoute.DELETE(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "PATCH",
    pattern: /^\/api\/dashboards\/([^/]+)$/,
    handler: (request, params) =>
      dashboardsIdRoute.PATCH(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/dashboard\/([^/]+)\/charts$/,
    handler: (request, params) =>
      dashboardChartsRoute.GET(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "POST",
    pattern: /^\/api\/dashboard\/([^/]+)\/charts$/,
    handler: (request, params) =>
      dashboardChartsRoute.POST(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "PATCH",
    pattern: /^\/api\/dashboard\/([^/]+)\/charts$/,
    handler: (request, params) =>
      dashboardChartsRoute.PATCH(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "DELETE",
    pattern: /^\/api\/dashboard\/([^/]+)\/charts$/,
    handler: (request, params) =>
      dashboardChartsRoute.DELETE(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "PUT",
    pattern: /^\/api\/charts\/([^/]+)$/,
    handler: (request, params) =>
      chartRoute.PUT(request as any, {
        params: Promise.resolve({ chartId: params.chartId }),
      } as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/dashboard\/([^/]+)\/slicers$/,
    handler: (request, params) =>
      dashboardSlicersRoute.GET(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "POST",
    pattern: /^\/api\/dashboard\/([^/]+)\/slicers$/,
    handler: (request, params) =>
      dashboardSlicersRoute.POST(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "PATCH",
    pattern: /^\/api\/dashboard\/([^/]+)\/slicers$/,
    handler: (request, params) =>
      dashboardSlicersRoute.PATCH(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "DELETE",
    pattern: /^\/api\/dashboard\/([^/]+)\/slicers$/,
    handler: (request, params) =>
      dashboardSlicersRoute.DELETE(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/charts\/([^/]+)\/slicers$/,
    handler: (request, params) =>
      chartSlicersRoute.GET(request as any, {
        params: Promise.resolve({ chartId: params.chartId }),
      } as any),
  },
  {
    method: "POST",
    pattern: /^\/api\/charts\/([^/]+)\/slicers$/,
    handler: (request, params) =>
      chartSlicersRoute.POST(request as any, {
        params: Promise.resolve({ chartId: params.chartId }),
      } as any),
  },
  {
    method: "PATCH",
    pattern: /^\/api\/charts\/([^/]+)\/slicers$/,
    handler: (request, params) =>
      chartSlicersRoute.PATCH(request as any, {
        params: Promise.resolve({ chartId: params.chartId }),
      } as any),
  },
  {
    method: "DELETE",
    pattern: /^\/api\/charts\/([^/]+)\/slicers$/,
    handler: (request, params) =>
      chartSlicersRoute.DELETE(request as any, {
        params: Promise.resolve({ chartId: params.chartId }),
      } as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/dashboard\/([^/]+)\/data$/,
    handler: (request, params) =>
      dashboardDataRoute.GET(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/dashboard\/([^/]+)\/dimensions$/,
    handler: (request, params) =>
      dashboardDimensionsRoute.GET(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/dashboard\/([^/]+)\/dimension-values$/,
    handler: (request, params) =>
      dashboardDimensionValuesRoute.GET(request as any, {
        params: Promise.resolve({ dashboardId: params.dashboardId }),
      } as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/duckdb\/config$/,
    handler: (request) => duckdbConfigRoute.GET(request as any),
  },
  {
    method: "POST",
    pattern: /^\/api\/duckdb\/query$/,
    handler: (request) => duckdbQueryRoute.POST(request as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/duckdb\/tables$/,
    handler: (request) => duckdbTablesRoute.GET(request as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/duckdb\/secrets$/,
    handler: () => duckdbSecretsRoute.GET(),
  },
  {
    method: "GET",
    pattern: /^\/api\/semantic-layer\/sources$/,
    handler: (request) => semanticSourcesRoute.GET(request as any),
  },
  {
    method: "POST",
    pattern: /^\/api\/semantic-layer\/sources$/,
    handler: (request) => semanticSourcesRoute.POST(request as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/semantic-layer\/materialized-tables$/,
    handler: (request) => materializedTablesRoute.GET(request as any),
  },
  {
    method: "POST",
    pattern: /^\/api\/upload$/,
    handler: (request) => uploadRoute.POST(request as any),
  },
  {
    method: "GET",
    pattern: /^\/api\/upload\/([^/]+)$/,
    handler: (request, params) =>
      uploadFileRoute.GET(request as any, {
        params: Promise.resolve({ fileId: params.fileId }),
      } as any),
  },
];

function collectParams(match: RegExpExecArray): Record<string, string> {
  const params: Record<string, string> = {};
  if (match[1]) params.chatId = decodeURIComponent(match[1]);
  if (match[2]) params.messageId = decodeURIComponent(match[2]);

  if (match[1] && /\/dashboard\//.test(match.input)) {
    params.dashboardId = decodeURIComponent(match[1]);
  }
  if (match[1] && /\/dashboards\//.test(match.input)) {
    params.dashboardId = decodeURIComponent(match[1]);
  }
  if (match[1] && /\/charts\//.test(match.input)) {
    params.chartId = decodeURIComponent(match[1]);
  }
  if (match[1] && /\/upload\//.test(match.input)) {
    params.fileId = decodeURIComponent(match[1]);
  }

  return params;
}

function createWebRequest(req: IncomingMessage): Request {
  const method = (req.method || "GET").toUpperCase();
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const url = new URL(req.url || "/", `http://${host}`);

  const init: RequestInit = {
    method,
    headers: req.headers as Record<string, string>,
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(req) as unknown as BodyInit;
    (init as RequestInit & { duplex?: "half" }).duplex = "half";
  }
  return new Request(url, init);
}

async function writeResponse(
  target: ServerResponse,
  response: Response,
): Promise<void> {
  target.statusCode = response.status;
  response.headers.forEach((value, key) => {
    target.setHeader(key, value);
  });

  if (!response.body) {
    target.end();
    return;
  }

  const body = Readable.fromWeb(response.body as any);
  body.on("error", () => target.end());
  body.pipe(target);
}

function isSafePath(pathname: string): boolean {
  const normalizedPath = normalize(pathname);
  return !normalizedPath.includes("..");
}

function resolveStaticFile(pathname: string): string {
  if (pathname === "/") {
    return join(STATIC_ROOT, "index.html");
  }
  const requested = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  if (!requested) {
    return join(STATIC_ROOT, "index.html");
  }
  const directPath = join(STATIC_ROOT, requested);
  if (existsSync(directPath)) {
    const directPathStat = statSync(directPath);
    if (directPathStat.isFile()) {
      return directPath;
    }
    if (directPathStat.isDirectory()) {
      const directoryIndexPath = join(directPath, "index.html");
      if (existsSync(directoryIndexPath)) {
        return directoryIndexPath;
      }
    }
  }
  if (!extname(requested)) {
    const htmlPath = join(STATIC_ROOT, `${requested}.html`);
    if (existsSync(htmlPath)) {
      return htmlPath;
    }
    const indexPath = join(STATIC_ROOT, requested, "index.html");
    if (existsSync(indexPath)) {
      return indexPath;
    }
  }
  return join(STATIC_ROOT, "index.html");
}

function contentTypeFor(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

function handleLegacyDeepLink(pathname: string, res: ServerResponse): boolean {
  const chatMatch = /^\/chat\/([^/]+)$/.exec(pathname);
  if (chatMatch?.[1]) {
    res.statusCode = 302;
    res.setHeader("Location", `/chat?id=${encodeURIComponent(chatMatch[1])}`);
    res.end();
    return true;
  }

  const dashboardMatch = /^\/dashboards\/([^/]+)$/.exec(pathname);
  if (dashboardMatch?.[1]) {
    if (dashboardMatch[1] === "view") {
      return false;
    }
    res.statusCode = 302;
    res.setHeader(
      "Location",
      `/dashboards/view?id=${encodeURIComponent(dashboardMatch[1])}`,
    );
    res.end();
    return true;
  }
  return false;
}

async function handleApiRequest(request: Request): Promise<Response> {
  const method = request.method.toUpperCase();
  const pathname = new URL(request.url).pathname;
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(pathname);
    if (!match) continue;
    const params = collectParams(match);
    return route.handler(request, params);
  }

  const maybeAllowed = routes.some((route) => route.pattern.test(pathname));
  if (maybeAllowed) {
    return routeResponseNotAllowed();
  }
  return new Response("Not Found", { status: 404 });
}

const server = createServer(async (req, res) => {
  try {
    const webRequest = createWebRequest(req);
    const url = new URL(webRequest.url);

    if (url.pathname.startsWith("/api/")) {
      const response = await handleApiRequest(webRequest);
      await writeResponse(res, response);
      return;
    }

    if (handleLegacyDeepLink(url.pathname, res)) {
      return;
    }

    if (!isSafePath(url.pathname)) {
      res.statusCode = 400;
      res.end("Invalid path");
      return;
    }

    const staticFile = resolveStaticFile(url.pathname);
    const stat = await fs.stat(staticFile).catch(() => null);
    if (!stat || !stat.isFile()) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", contentTypeFor(staticFile));
    createReadStream(staticFile).pipe(res);
  } catch (error) {
    console.error("[extension-server] request error", error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(
    `[extension-server] listening on http://127.0.0.1:${PORT} serving ${STATIC_ROOT}`,
  );
});
