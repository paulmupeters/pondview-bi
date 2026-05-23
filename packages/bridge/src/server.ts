import { existsSync, mkdirSync } from "node:fs";
import { platform } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  bridgeAttachSourceRequestSchema,
  bridgeProjectDeleteFilesRequestSchema,
  bridgeProjectInitRequestSchema,
  bridgeProjectReplaceFilesRequestSchema,
  bridgeProjectSaveFilesRequestSchema,
  bridgeProjectUpdateRequestSchema,
  bridgeQueryRequestSchema,
  bridgeS3BackupDownloadRequestSchema,
  bridgeS3BackupUploadRequestSchema,
  bridgeSecretAiSchema,
  bridgeSecretS3BackupSchema,
  bridgeSecretSourceSchema,
} from "@pondview/bridge-protocol";
import { handleAiChatRequest } from "./ai";
import { BridgeProjectStore } from "./project-store";
import { DuckDbRuntime } from "./runtime/duckdb-runtime";
import {
  downloadBridgeS3Backup,
  listBridgeS3BackupObjects,
  testBridgeS3BackupConnection,
  uploadBridgeS3Backup,
} from "./s3-backup";
import { BridgeSecretStore } from "./secrets";
import { BRIDGE_VERSION } from "./version";

const WORKSPACE_DB_NAME = "pondview-workspace";
const WORKSPACE_DB_NAME_OVERRIDE_KEY = "pondview-workspace-name-override";
const DEFAULT_PROJECT_DATABASE_PATH = "runtime/pondview-runtime.duckdb";

export interface BridgeServerOptions {
  host?: string;
  port?: number;
  token?: string;
  readonly?: boolean;
  databasePath?: string;
  serveUi?: boolean;
  dashboardMode?: boolean;
  staticDir?: string;
  secretsPath?: string;
  projectDir?: string;
}

export interface BridgeUiServerOptions {
  host?: string;
  port?: number;
  bridgeUrl: string;
  dashboardMode?: boolean;
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
  const secrets = new BridgeSecretStore(options.secretsPath);
  const projects = new BridgeProjectStore({
    rootPath: options.projectDir,
    readonly: options.readonly,
  });
  const createRuntime = (databasePath?: string) =>
    new DuckDbRuntime({
      readonly: options.readonly,
      databasePath,
      resolveSource: (id) => secrets.getSource(id),
    });
  let runtime = createRuntime(options.databasePath);
  const initializeProjectRuntime = async (databasePath?: string) => {
    if (options.readonly || options.databasePath) {
      return runtime.databaseInfo();
    }

    const nextRuntime = createRuntime(
      createProjectDatabasePath(projects.rootPath, databasePath),
    );
    const previousRuntime = runtime;
    runtime = nextRuntime;
    await previousRuntime.close();
    return runtime.databaseInfo();
  };

  let boundOptions = { ...options, host, port };
  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(request) {
      return handleRequest(
        request,
        () => runtime,
        boundOptions,
        secrets,
        projects,
        initializeProjectRuntime,
      );
    },
  });
  boundOptions = { ...boundOptions, port: readBoundPort(server, port) };

  return {
    url: `http://${server.hostname}:${server.port}`,
    stop: async () => {
      server.stop(true);
      await runtime.close();
    },
  };
}

function createProjectDatabasePath(
  projectRootPath: string,
  requestedPath?: string,
): string {
  const normalizedPath = requestedPath?.trim();
  const projectDatabasePath =
    normalizedPath && normalizedPath.toLowerCase() !== "default"
      ? normalizedPath
      : DEFAULT_PROJECT_DATABASE_PATH;
  const databasePath = isAbsolute(projectDatabasePath)
    ? resolve(projectDatabasePath)
    : resolve(projectRootPath, projectDatabasePath);

  if (
    !isAbsolute(projectDatabasePath) &&
    !isPathInsideRoot(projectRootPath, databasePath)
  ) {
    throw new Error("Project database path must stay inside the project.");
  }

  mkdirSync(dirname(databasePath), { recursive: true });
  return databasePath;
}

export async function startBridgeUiServer(
  options: BridgeUiServerOptions,
): Promise<BridgeServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const bridgeUrl = new URL(options.bridgeUrl).toString().replace(/\/$/, "");
  let boundOptions = { ...options, host, port };

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(request) {
      return handleUiRequest(request, bridgeUrl, boundOptions);
    },
  });
  boundOptions = { ...boundOptions, port: readBoundPort(server, port) };

  return {
    url: `http://${server.hostname}:${server.port}`,
    stop: () => Promise.resolve(server.stop(true)),
  };
}

export async function handleBridgeRequest(
  request: Request,
  runtime: DuckDbRuntime,
  options: BridgeServerOptions,
  secrets = new BridgeSecretStore(options.secretsPath),
  projects = new BridgeProjectStore({
    rootPath: options.projectDir,
    readonly: options.readonly,
  }),
  initializeProjectRuntime?: (databasePath?: string) => Promise<unknown>,
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
        database: runtime.databaseInfo(),
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
          database: runtime.databaseInfo(),
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
        projects: true,
        readonly: options.readonly ?? false,
        secrets: true,
        ai: Boolean(secrets.getAi()),
        s3Backup: Boolean(secrets.getS3Backup()),
      });
    }

    if (request.method === "GET" && url.pathname === "/project") {
      return json({ project: projects.getProject() });
    }

    if (request.method === "PUT" && url.pathname === "/project") {
      const input = bridgeProjectUpdateRequestSchema.parse(
        await request.json(),
      );
      return json({ project: await projects.updateProject(input) });
    }

    if (request.method === "POST" && url.pathname === "/project/init") {
      if (options.readonly) {
        throw new Error(
          "Readonly bridge mode cannot initialize project files.",
        );
      }
      const input = bridgeProjectInitRequestSchema.parse(await request.json());
      const files = await projects.saveFiles(input.files);
      await initializeProjectRuntime?.(input.databasePath);
      return json({ files });
    }

    if (
      request.method === "POST" &&
      url.pathname === "/project/database-path/pick"
    ) {
      return json({ path: await pickProjectDatabasePath(projects.rootPath) });
    }

    if (request.method === "GET" && url.pathname === "/project/files") {
      return json({ files: projects.listFiles() });
    }

    if (request.method === "PUT" && url.pathname === "/project/files") {
      const input = bridgeProjectSaveFilesRequestSchema.parse(
        await request.json(),
      );
      return json({ files: await projects.saveFiles(input.files) });
    }

    if (
      request.method === "POST" &&
      url.pathname === "/project/files/replace"
    ) {
      const input = bridgeProjectReplaceFilesRequestSchema.parse(
        await request.json(),
      );
      return json({
        files: await projects.replaceFiles(input.scopePath, input.files),
      });
    }

    if (request.method === "DELETE" && url.pathname === "/project/files") {
      const input = bridgeProjectDeleteFilesRequestSchema.parse(
        await request.json(),
      );
      return json({ files: await projects.deleteFiles(input.paths) });
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

    if (request.method === "GET" && url.pathname === "/secrets/status") {
      return json(secrets.status());
    }

    const sourceSecretMatch = url.pathname.match(
      /^\/secrets\/source\/([^/]+)$/,
    );
    if (sourceSecretMatch) {
      const id = decodeURIComponent(sourceSecretMatch[1] ?? "");
      if (request.method === "PUT") {
        const input = bridgeSecretSourceSchema.parse(await request.json());
        secrets.saveSource(id, input);
        return json({ ok: true });
      }
      if (request.method === "DELETE") {
        secrets.deleteSource(id);
        return json({ ok: true });
      }
    }

    if (url.pathname === "/secrets/ai") {
      if (request.method === "PUT") {
        const input = bridgeSecretAiSchema.parse(await request.json());
        secrets.saveAi(input);
        return json({ ok: true });
      }
      if (request.method === "DELETE") {
        secrets.deleteAi();
        return json({ ok: true });
      }
    }

    if (url.pathname === "/secrets/s3-backup") {
      if (request.method === "PUT") {
        const input = bridgeSecretS3BackupSchema.parse(await request.json());
        secrets.saveS3Backup(input);
        return json({ ok: true });
      }
      if (request.method === "DELETE") {
        secrets.deleteS3Backup();
        return json({ ok: true });
      }
    }

    if (request.method === "POST" && url.pathname === "/ai/chat") {
      return handleAiChatRequest(request, secrets.getAi(), runtime);
    }

    if (request.method === "POST" && url.pathname === "/s3-backup/test") {
      return json(await runS3Action(secrets, testBridgeS3BackupConnection));
    }

    if (request.method === "POST" && url.pathname === "/s3-backup/list") {
      const objects = await runS3Action(secrets, listBridgeS3BackupObjects);
      return json({ objects });
    }

    if (request.method === "POST" && url.pathname === "/s3-backup/upload") {
      const input = bridgeS3BackupUploadRequestSchema.parse(
        await request.json(),
      );
      const result = await runS3Action(secrets, (config) =>
        uploadBridgeS3Backup(
          config,
          Uint8Array.from(Buffer.from(input.bytesBase64, "base64")),
          input.key,
        ),
      );
      return json(result);
    }

    if (request.method === "POST" && url.pathname === "/s3-backup/download") {
      const input = bridgeS3BackupDownloadRequestSchema.parse(
        await request.json(),
      );
      const bytes = await runS3Action(secrets, (config) =>
        downloadBridgeS3Backup(config, input.key),
      );
      return json({ bytesBase64: Buffer.from(bytes).toString("base64") });
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
  getRuntime: () => DuckDbRuntime,
  options: BridgeServerOptions,
  secrets: BridgeSecretStore,
  projects: BridgeProjectStore,
  initializeProjectRuntime?: (databasePath?: string) => Promise<unknown>,
): Promise<Response> {
  const apiResponse = await handleBridgeRequest(
    request,
    getRuntime(),
    options,
    secrets,
    projects,
    initializeProjectRuntime,
  );
  if (
    !options.serveUi ||
    apiResponse.status !== 404 ||
    request.method !== "GET"
  ) {
    return apiResponse;
  }

  if (options.dashboardMode) {
    const redirect = dashboardModeRedirect(request);
    if (redirect) {
      return redirect;
    }
  }

  return serveStaticUi(request, options.staticDir, {
    workspaceDbName: getBridgeWorkspaceDbName(projects),
  });
}

async function handleUiRequest(
  request: Request,
  bridgeUrl: string,
  options: BridgeUiServerOptions,
): Promise<Response> {
  if (shouldProxyToBridge(request)) {
    return proxyBridgeRequest(request, bridgeUrl);
  }

  if (request.method === "GET") {
    if (options.dashboardMode) {
      const redirect = dashboardModeRedirect(request);
      if (redirect) {
        return redirect;
      }
    }
    return serveStaticUi(request, options.staticDir);
  }

  return errorResponse("Not found", 404, "not_found");
}

function dashboardModeRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== "/" || url.searchParams.get("pondviewMode")) {
    return null;
  }

  url.pathname = "/dashboards";
  url.search = "?pondviewMode=dashboard";
  return Response.redirect(url.toString(), 302);
}

function shouldProxyToBridge(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.pathname === "/ping" ||
    url.pathname === "/api/duckdb/config" ||
    url.pathname === "/health" ||
    url.pathname === "/capabilities" ||
    url.pathname === "/project" ||
    url.pathname === "/project/init" ||
    url.pathname === "/project/database-path/pick" ||
    url.pathname === "/project/files" ||
    url.pathname === "/project/files/replace" ||
    url.pathname === "/catalog" ||
    url.pathname === "/query" ||
    url.pathname === "/ai/chat" ||
    url.pathname === "/cancel" ||
    url.pathname === "/sources" ||
    url.pathname === "/secrets/status" ||
    url.pathname === "/secrets/ai" ||
    url.pathname === "/secrets/s3-backup" ||
    url.pathname === "/s3-backup/test" ||
    url.pathname === "/s3-backup/list" ||
    url.pathname === "/s3-backup/upload" ||
    url.pathname === "/s3-backup/download" ||
    /^\/secrets\/source\/[^/]+$/.test(url.pathname) ||
    /^\/sources\/[^/]+$/.test(url.pathname)
  );
}

async function runS3Action<T>(
  secrets: BridgeSecretStore,
  action: (
    config: NonNullable<ReturnType<BridgeSecretStore["getS3Backup"]>>,
  ) => Promise<T>,
): Promise<T> {
  const config = secrets.getS3Backup();
  if (!config) {
    throw new Error("Bridge S3 backup is not configured.");
  }
  return action(config);
}

async function proxyBridgeRequest(
  request: Request,
  bridgeUrl: string,
): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = `${bridgeUrl}${incomingUrl.pathname}${incomingUrl.search}`;
  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return fetch(upstreamUrl, init);
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
  headers.set(
    "access-control-allow-methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  headers.set(
    "access-control-allow-headers",
    "content-type, authorization, x-api-key",
  );
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
  bridgeUiOptions: { workspaceDbName?: string } = {},
): Promise<Response> {
  const root = resolve(staticDir);
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(root, `.${requestedPath}`);

  const pathFromRoot = relative(root, filePath);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    return errorResponse("Not found", 404, "not_found");
  }

  if (existsSync(filePath)) {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      if (filePath.endsWith("index.html")) {
        return htmlResponse(
          injectBridgeWorkspaceDbName(await file.text(), bridgeUiOptions),
        );
      }
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
    return htmlResponse(
      injectBridgeWorkspaceDbName(await indexFile.text(), bridgeUiOptions),
    );
  }

  return errorResponse(
    `Bundled Pondview UI was not found at ${indexPath}. Run bun run bridge:build-ui to build packages/bridge/dist first.`,
    404,
    "ui_not_built",
  );
}

function getBridgeWorkspaceDbName(projects: BridgeProjectStore): string {
  return `${WORKSPACE_DB_NAME}-${projects.getProject().id}`;
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function injectBridgeWorkspaceDbName(
  html: string,
  options: { workspaceDbName?: string },
): string {
  if (!options.workspaceDbName) {
    return html;
  }

  const script = `<script data-pondview-bridge-workspace>try{window.localStorage.setItem(${JSON.stringify(WORKSPACE_DB_NAME_OVERRIDE_KEY)},${JSON.stringify(options.workspaceDbName)});}catch{}</script>`;
  return html.includes("</head>")
    ? html.replace("</head>", `${script}</head>`)
    : `${script}${html}`;
}

async function pickProjectDatabasePath(
  projectRootPath: string,
): Promise<string | null> {
  if (platform() !== "darwin") {
    throw new Error(
      "Native DuckDB file picker is not available on this platform.",
    );
  }

  const script = [
    `set selectedFile to choose file name with prompt ${toAppleScriptString("Choose a DuckDB file for this Pondview project")} default name ${toAppleScriptString("pondview-runtime.duckdb")} default location POSIX file ${toAppleScriptString(projectRootPath)}`,
    "POSIX path of selectedFile",
  ].join("\n");
  const process = Bun.spawn(["osascript", "-e", script], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  if (exitCode === 0) {
    return stdout.trim() || null;
  }
  if (stderr.toLowerCase().includes("user canceled")) {
    return null;
  }

  throw new Error(stderr.trim() || "DuckDB file picker failed.");
}

function toAppleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function defaultStaticDir(): string {
  return resolve(import.meta.dirname, "../dist");
}

function readBoundPort(
  server: { port?: number },
  fallbackPort: number,
): number {
  return server.port ?? fallbackPort;
}

function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !relativePath.startsWith(`..${sep}`))
  );
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
