import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BridgeServerHandle,
  type BridgeServerOptions,
  startBridgeServer,
  startBridgeUiServer,
} from "./server";

const handles: BridgeServerHandle[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.stop()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("bridge server modes", () => {
  test("API-only bridge exposes JSON routes without serving the UI", async () => {
    const server = await startTrackedServer();

    const health = await fetch(`${server.url}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      ok: true,
      service: "pondview-bridge",
    });

    const root = await fetch(`${server.url}/`);
    expect(root.status).toBe(404);
    expect(root.headers.get("content-type")).toContain("application/json");
  });

  test("serve mode serves static UI files and React Router fallbacks", async () => {
    const staticDir = createStaticDir();
    const server = await startTrackedServer({ serveUi: true, staticDir });

    const root = await fetch(`${server.url}/`);
    expect(root.status).toBe(200);
    expect(root.headers.get("content-type")).toContain("text/html");
    expect(await root.text()).toContain("Pondview test shell");

    const asset = await fetch(`${server.url}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(await asset.text()).toContain("hello from pondview");

    const fallback = await fetch(`${server.url}/dashboards/example`);
    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toContain("Pondview test shell");
  });

  test("serve mode rejects encoded static path traversal", async () => {
    const rootDir = createTempDir();
    const staticDir = join(rootDir, "app");
    const siblingDir = join(rootDir, "app2");
    mkdirSync(staticDir);
    mkdirSync(siblingDir);
    writeFileSync(
      join(staticDir, "index.html"),
      "<h1>Pondview test shell</h1>",
    );
    writeFileSync(join(siblingDir, "secret.txt"), "leaked");
    const server = await startTrackedServer({ serveUi: true, staticDir });

    const escaped = await fetch(`${server.url}/%2e%2e%2fapp2%2fsecret.txt`);
    expect(escaped.status).toBe(404);
    expect(await escaped.text()).not.toContain("leaked");
  });

  test("dashboard mode redirects the root URL into dashboards", async () => {
    const staticDir = createStaticDir();
    const server = await startTrackedServer({
      serveUi: true,
      staticDir,
      dashboardMode: true,
    });

    const root = await fetch(`${server.url}/`, { redirect: "manual" });
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe(
      `${server.url}/dashboards?pondviewMode=dashboard`,
    );

    const dashboards = await fetch(
      `${server.url}/dashboards?pondviewMode=dashboard`,
    );
    expect(dashboards.status).toBe(200);
    expect(await dashboards.text()).toContain("Pondview test shell");
  });

  test("serve mode keeps API routes ahead of static routing", async () => {
    const staticDir = createStaticDir();
    const server = await startTrackedServer({ serveUi: true, staticDir });

    const ping = await fetch(`${server.url}/ping`);
    expect(await ping.json()).toEqual({ status: "ok" });

    const config = await fetch(`${server.url}/api/duckdb/config`);
    expect(await config.json()).toMatchObject({
      host: "127.0.0.1",
      port: Number(new URL(server.url).port),
      requires_auth: false,
    });

    const query = await fetch(`${server.url}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 7 AS value;" }),
    });
    expect(await query.json()).toMatchObject({
      rows: [{ value: 7 }],
      rowCount: 1,
    });
  });

  test("database-backed bridge runs queries against the primary DuckDB file", async () => {
    const databasePath = join(createTempDir(), "analytics.duckdb");
    const setup = await startBridgeServer({ databasePath, port: 0 });

    const createTable = await fetch(`${setup.url}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sql: "CREATE TABLE metrics AS SELECT 42 AS answer;",
      }),
    });
    expect(createTable.status).toBe(200);
    await setup.stop();

    const server = await startTrackedServer({ databasePath });
    const config = await fetch(`${server.url}/api/duckdb/config`);
    expect(await config.json()).toMatchObject({
      database: { mode: "file" },
    });

    const query = await fetch(`${server.url}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT answer FROM metrics;" }),
    });
    expect(await query.json()).toMatchObject({
      rows: [{ answer: 42 }],
      rowCount: 1,
    });
  });

  test("UI server proxies bridge API routes to an existing bridge", async () => {
    const staticDir = createStaticDir();
    const bridge = await startTrackedServer({ token: "secret" });
    const ui = await startTrackedUiServer({
      bridgeUrl: bridge.url,
      staticDir,
    });

    const root = await fetch(`${ui.url}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain("Pondview test shell");

    const config = await fetch(`${ui.url}/api/duckdb/config`);
    expect(await config.json()).toMatchObject({ requires_auth: true });

    const query = await fetch(`${ui.url}/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "secret",
      },
      body: JSON.stringify({ sql: "SELECT 9 AS value;" }),
    });
    expect(await query.json()).toMatchObject({
      rows: [{ value: 9 }],
      rowCount: 1,
    });
  });

  test("dashboard mode redirects the UI server root into dashboards", async () => {
    const staticDir = createStaticDir();
    const bridge = await startTrackedServer();
    const ui = await startTrackedUiServer({
      bridgeUrl: bridge.url,
      staticDir,
      dashboardMode: true,
    });

    const root = await fetch(`${ui.url}/`, { redirect: "manual" });
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe(
      `${ui.url}/dashboards?pondviewMode=dashboard`,
    );
  });

  test("token auth accepts bearer and X-API-Key credentials", async () => {
    const server = await startTrackedServer({ token: "secret" });

    const config = await fetch(`${server.url}/api/duckdb/config`);
    expect(await config.json()).toMatchObject({ requires_auth: true });

    const unauthorized = await fetch(`${server.url}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1;" }),
    });
    expect(unauthorized.status).toBe(401);

    const bearer = await fetch(`${server.url}/query`, {
      method: "POST",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql: "SELECT 1 AS ok;" }),
    });
    expect(bearer.status).toBe(200);

    const apiKey = await fetch(`${server.url}/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "secret",
      },
      body: JSON.stringify({ sql: "SELECT 2 AS ok;" }),
    });
    expect(apiKey.status).toBe(200);
  });

  test("CORS preflight allows documented auth headers and secret mutations", async () => {
    const server = await startTrackedServer({ token: "secret" });

    const preflight = await fetch(`${server.url}/secrets/ai`, {
      method: "OPTIONS",
      headers: {
        origin: "https://pondview.example.test",
        "access-control-request-method": "PUT",
        "access-control-request-headers": "content-type, x-api-key",
      },
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain(
      "PUT",
    );
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "x-api-key",
    );
  });

  test("secret endpoints are auth protected and redacted", async () => {
    const secretsPath = join(createTempDir(), "secrets.json");
    const server = await startTrackedServer({ token: "secret", secretsPath });

    const unauthorized = await fetch(`${server.url}/secrets/status`);
    expect(unauthorized.status).toBe(401);

    const save = await fetch(`${server.url}/secrets/source/pg%3Awarehouse`, {
      method: "PUT",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "postgres",
        identifier: "host=db.example.test password=secret dbname=main",
        alias: "warehouse",
        readonly: true,
        duckdbExtension: "postgres",
      }),
    });
    expect(save.status).toBe(200);

    const status = await fetch(`${server.url}/secrets/status`, {
      headers: { authorization: "Bearer secret" },
    });
    const body = JSON.stringify(await status.json());
    expect(body).toContain("pg:warehouse");
    expect(body).not.toContain("password=secret");

    const saveAi = await fetch(`${server.url}/secrets/ai`, {
      method: "PUT",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-test",
        apiKey: "sk-secret",
      }),
    });
    expect(saveAi.status).toBe(200);

    const saveS3 = await fetch(`${server.url}/secrets/s3-backup`, {
      method: "PUT",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        endpoint: "https://s3.example.test",
        region: "auto",
        bucket: "pondview",
        accessKeyId: "access-secret",
        secretAccessKey: "s3-secret",
      }),
    });
    expect(saveS3.status).toBe(200);

    const updatedStatus = await fetch(`${server.url}/secrets/status`, {
      headers: { authorization: "Bearer secret" },
    });
    const updatedBody = JSON.stringify(await updatedStatus.json());
    expect(updatedBody).toContain("gpt-test");
    expect(updatedBody).toContain("pondview");
    expect(updatedBody).not.toContain("sk-secret");
    expect(updatedBody).not.toContain("s3-secret");
  });

  test("project endpoints read and mutate filesystem artifacts", async () => {
    const projectDir = createTempDir();
    mkdirSync(join(projectDir, "pondview", "queries", "shared"), {
      recursive: true,
    });
    writeFileSync(
      join(projectDir, "pondview", "project.json"),
      '{ "schemaVersion": 1, "name": "Revenue", "defaultSourceRef": "analytics" }\n',
    );
    writeFileSync(
      join(projectDir, "pondview", "queries", "shared", "orders.sql"),
      "select 1;\n",
    );

    const server = await startTrackedServer({ projectDir });
    const capabilities = await fetch(`${server.url}/capabilities`);
    expect(await capabilities.json()).toMatchObject({ projects: true });

    const project = await fetch(`${server.url}/project`);
    expect(await project.json()).toMatchObject({
      project: {
        name: "Revenue",
        backingKind: "bridge-filesystem",
        rootPath: projectDir,
        defaultSourceRef: "analytics",
      },
    });

    const files = await fetch(`${server.url}/project/files`);
    expect(await files.json()).toMatchObject({
      files: [
        {
          path: "pondview/project.json",
          content:
            '{ "schemaVersion": 1, "name": "Revenue", "defaultSourceRef": "analytics" }\n',
        },
        {
          path: "pondview/queries/shared/orders.sql",
          content: "select 1;\n",
        },
      ],
    });

    const save = await fetch(`${server.url}/project/files`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: [
          {
            path: "pondview/queries/shared/revenue.sql",
            content: "select 2;\n",
          },
        ],
      }),
    });
    expect(save.status).toBe(200);
    expect(
      readFileSync(
        join(projectDir, "pondview", "queries", "shared", "revenue.sql"),
        "utf8",
      ),
    ).toBe("select 2;\n");

    const replace = await fetch(`${server.url}/project/files/replace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scopePath: "pondview/queries/shared",
        files: [
          {
            path: "pondview/queries/shared/revenue.sql",
            content: "select 3;\n",
          },
        ],
      }),
    });
    expect(replace.status).toBe(200);
    expect(
      existsSync(
        join(projectDir, "pondview", "queries", "shared", "orders.sql"),
      ),
    ).toBe(false);
    expect(
      readFileSync(
        join(projectDir, "pondview", "queries", "shared", "revenue.sql"),
        "utf8",
      ),
    ).toBe("select 3;\n");

    const metadata = JSON.parse(
      readFileSync(join(projectDir, ".pondview", "project.json"), "utf8"),
    );
    expect(metadata.project.name).toBe("Revenue");
  });

  test("project endpoints reject traversal and readonly mutations", async () => {
    const projectDir = createTempDir();
    const server = await startTrackedServer({ projectDir });

    const escaped = await fetch(`${server.url}/project/files`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: [{ path: "../escape.sql", content: "select 1;" }],
      }),
    });
    expect(escaped.status).toBe(400);

    const readonly = await startTrackedServer({
      projectDir,
      readonly: true,
    });
    const readonlySave = await fetch(`${readonly.url}/project/files`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: [{ path: "pondview/queries/shared/blocked.sql", content: "" }],
      }),
    });
    expect(readonlySave.status).toBe(400);
    expect(await readonlySave.text()).toContain("Readonly bridge mode");
  });
});

async function startTrackedServer(
  options: BridgeServerOptions = {},
): Promise<BridgeServerHandle> {
  const server = await startBridgeServer({ ...options, port: 0 });
  handles.push(server);
  return server;
}

async function startTrackedUiServer(options: {
  bridgeUrl: string;
  staticDir: string;
  dashboardMode?: boolean;
}): Promise<BridgeServerHandle> {
  const server = await startBridgeUiServer({ ...options, port: 0 });
  handles.push(server);
  return server;
}

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pondview-runtime-"));
  tempDirs.push(dir);
  return dir;
}

function createStaticDir(): string {
  const dir = createTempDir();
  writeFileSync(join(dir, "index.html"), "<h1>Pondview test shell</h1>");
  const assetsDir = join(dir, "assets");
  mkdirSync(assetsDir);
  writeFileSync(
    join(assetsDir, "app.js"),
    "console.log('hello from pondview');",
  );
  return dir;
}
