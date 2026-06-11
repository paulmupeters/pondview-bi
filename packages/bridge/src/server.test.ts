import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
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

  test("serve mode scopes browser workspace storage to the bridge project", async () => {
    const staticDir = createStaticDir();
    const projectDir = createTempDir();
    const server = await startTrackedServer({
      serveUi: true,
      staticDir,
      projectDir,
    });

    const project = (await (await fetch(`${server.url}/project`)).json()) as {
      project: { id: string };
    };
    const root = await fetch(`${server.url}/`);
    const html = await root.text();

    expect(html).toContain("data-pondview-bridge-workspace");
    expect(html).toContain("pondview-workspace-name-override");
    expect(html).toContain(`pondview-workspace-${project.project.id}`);
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
    const projectDir = createTempDir();
    const runtimePath = join(projectDir, "runtime", "pondview-runtime.duckdb");
    const server = await startTrackedServer({
      serveUi: true,
      staticDir,
      projectDir,
    });

    const ping = await fetch(`${server.url}/ping`);
    expect(await ping.json()).toEqual({ status: "ok" });

    const config = await fetch(`${server.url}/api/duckdb/config`);
    expect(await config.json()).toMatchObject({
      host: "127.0.0.1",
      port: Number(new URL(server.url).port),
      requires_auth: false,
      database: {
        mode: "memory",
      },
    });
    expect(existsSync(runtimePath)).toBe(false);

    const query = await fetch(`${server.url}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 7 AS value;" }),
    });
    expect(await query.json()).toMatchObject({
      rows: [{ value: 7 }],
      rowCount: 1,
    });
    expect(existsSync(runtimePath)).toBe(false);
  });

  test("project init creates local runtime database after explicit choice", async () => {
    const projectDir = createTempDir();
    const runtimePath = join(projectDir, "runtime", "pondview-runtime.duckdb");
    const server = await startTrackedServer({
      serveUi: true,
      staticDir: createStaticDir(),
      projectDir,
    });

    const health = await fetch(`${server.url}/health`);
    expect(health.status).toBe(200);
    expect(existsSync(runtimePath)).toBe(false);

    const init = await fetch(`${server.url}/project/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: [
          {
            path: "pondview/project.json",
            content: '{ "schemaVersion": 1, "name": "Local" }\n',
          },
        ],
      }),
    });
    expect(init.status).toBe(200);

    const config = await fetch(`${server.url}/api/duckdb/config`);
    expect(await config.json()).toMatchObject({
      database: {
        mode: "file",
        name: "pondview-runtime.duckdb",
      },
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
    expect(existsSync(runtimePath)).toBe(true);
  });

  test("project init can use a custom local runtime database path", async () => {
    const projectDir = createTempDir();
    const runtimePath = join(projectDir, "data", "custom.duckdb");
    const server = await startTrackedServer({
      serveUi: true,
      staticDir: createStaticDir(),
      projectDir,
    });

    const init = await fetch(`${server.url}/project/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: [
          {
            path: "pondview/project.json",
            content: '{ "schemaVersion": 1, "name": "Local" }\n',
          },
        ],
        databasePath: "data/custom.duckdb",
      }),
    });
    expect(init.status).toBe(200);

    const config = await fetch(`${server.url}/api/duckdb/config`);
    expect(await config.json()).toMatchObject({
      database: {
        mode: "file",
        name: "custom.duckdb",
      },
    });

    const query = await fetch(`${server.url}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 11 AS value;" }),
    });
    expect(await query.json()).toMatchObject({
      rows: [{ value: 11 }],
      rowCount: 1,
    });
    expect(existsSync(runtimePath)).toBe(true);
  });

  test("project init can switch runtime without writing project files", async () => {
    const projectDir = createTempDir();
    const runtimePath = join(projectDir, "runtime", "pondview-runtime.duckdb");
    const server = await startTrackedServer({ projectDir });

    const init = await fetch(`${server.url}/project/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: [] }),
    });

    expect(init.status).toBe(200);
    expect(await init.json()).toEqual({ files: [] });
    const config = await fetch(`${server.url}/api/duckdb/config`);
    expect(await config.json()).toMatchObject({
      database: {
        mode: "file",
        name: "pondview-runtime.duckdb",
      },
    });
    const query = await fetch(`${server.url}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 13 AS value;" }),
    });
    expect(await query.json()).toMatchObject({
      rows: [{ value: 13 }],
      rowCount: 1,
    });
    expect(existsSync(runtimePath)).toBe(true);
    expect(existsSync(join(projectDir, "pondview", "project.json"))).toBe(
      false,
    );
  });

  test("imports CSV files into the bridge runtime and cleans up temp files", async () => {
    const beforeTempDirs = listImportTempDirs();
    const server = await startTrackedServer();

    const imported = await fetch(`${server.url}/imports/file`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "customers.csv",
        bytesBase64: Buffer.from("id,name\n1,Ada\n2,Grace\n").toString(
          "base64",
        ),
        schemaName: "uploads",
        tableName: "customers",
      }),
    });

    expect(imported.status).toBe(200);
    expect(await imported.json()).toMatchObject({
      schemaName: "uploads",
      tableName: "customers",
      rowCount: 2,
      format: "csv",
    });

    const query = await fetch(`${server.url}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sql: "SELECT name FROM uploads.customers ORDER BY id;",
      }),
    });
    expect(await query.json()).toMatchObject({
      rows: [{ name: "Ada" }, { name: "Grace" }],
      rowCount: 2,
    });
    expect(listImportTempDirs()).toEqual(beforeTempDirs);
  });

  test("imports Parquet files into the bridge runtime", async () => {
    const tempDir = createTempDir();
    const parquetPath = join(tempDir, "orders.parquet");
    const server = await startTrackedServer();

    const copy = await fetch(`${server.url}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sql: `COPY (SELECT 3 AS id, 'Lin' AS name) TO '${parquetPath.replaceAll("'", "''")}' (FORMAT PARQUET);`,
      }),
    });
    expect(copy.status).toBe(200);

    const imported = await fetch(`${server.url}/imports/file`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "orders.parquet",
        bytesBase64: readFileSync(parquetPath).toString("base64"),
        schemaName: "uploads",
        tableName: "orders",
      }),
    });

    expect(imported.status).toBe(200);
    expect(await imported.json()).toMatchObject({
      schemaName: "uploads",
      tableName: "orders",
      rowCount: 1,
      format: "parquet",
    });
  });

  test("imports a selected XLSX worksheet into the bridge runtime", async () => {
    const server = await startTrackedServer();

    const imported = await fetch(`${server.url}/imports/file`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "workbook.xlsx",
        bytesBase64: Buffer.from(createXlsxFixture()).toString("base64"),
        schemaName: "uploads",
        tableName: "workbook",
        xlsxSheet: "Orders",
      }),
    });

    expect(imported.status).toBe(200);
    expect(await imported.json()).toMatchObject({
      schemaName: "uploads",
      tableName: "workbook",
      rowCount: 1,
      format: "xlsx",
    });

    const query = await fetch(`${server.url}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sql: "SELECT name FROM uploads.workbook ORDER BY id;",
      }),
    });
    expect(await query.json()).toMatchObject({
      rows: [{ name: "Ada" }],
      rowCount: 1,
    });
  });

  test("rejects legacy XLS imports with a clear message", async () => {
    const server = await startTrackedServer();

    const imported = await fetch(`${server.url}/imports/file`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "customers.xls",
        bytesBase64: Buffer.from("legacy").toString("base64"),
        schemaName: "uploads",
        tableName: "customers",
      }),
    });

    expect(imported.status).toBe(400);
    expect(await imported.json()).toMatchObject({
      error: {
        message: "Legacy .xls files are not supported. Use .xlsx instead.",
      },
    });
  });

  test("detects root-level DuckDB files for startup choices", async () => {
    const projectDir = createTempDir();
    mkdirSync(join(projectDir, "nested"));
    writeFileSync(join(projectDir, "analytics.duckdb"), "");
    writeFileSync(join(projectDir, "report.DUCKDB"), "");
    writeFileSync(join(projectDir, "analytics.duckdb.wal"), "");
    writeFileSync(join(projectDir, "nested", "ignored.duckdb"), "");
    const server = await startTrackedServer({ projectDir });

    const response = await fetch(`${server.url}/project/database-paths`);

    expect(await response.json()).toEqual({
      paths: ["analytics.duckdb", "report.DUCKDB"],
    });
  });

  test("reports explicit database path separately from detected files", async () => {
    const projectDir = createTempDir();
    const databasePath = join(projectDir, "analytics.duckdb");
    const server = await startTrackedServer({ projectDir, databasePath });

    const response = await fetch(`${server.url}/project/database-paths`);

    expect(await response.json()).toEqual({
      paths: [],
      configuredDatabasePath: databasePath,
    });
  });

  test("starts on the project default DuckDB source", async () => {
    const projectDir = createTempDir();
    mkdirSync(join(projectDir, ".pondview"));
    writeFileSync(
      join(projectDir, ".pondview", "project.json"),
      JSON.stringify({
        schemaVersion: 1,
        project: {
          id: "bridge-project-example",
          name: "Example",
          backingKind: "bridge-filesystem",
          openedAt: Date.now(),
          updatedAt: Date.now(),
          defaultSourceRef: "local",
        },
      }),
    );
    writeFileSync(
      join(projectDir, "pondview.sources.local.json"),
      JSON.stringify({
        schemaVersion: 1,
        bindings: {
          local: {
            runtimeBackend: "bridge",
            dbIdentifier: "pondview.duckdb",
            catalogContext: "main",
          },
        },
      }),
    );
    const server = await startTrackedServer({ projectDir });

    const response = await fetch(`${server.url}/api/duckdb/config`);

    expect(await response.json()).toMatchObject({
      database: {
        mode: "file",
        name: "pondview.duckdb",
      },
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

    const importResponse = await fetch(`${server.url}/imports/file`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "blocked.csv",
        bytesBase64: Buffer.from("id\n1\n").toString("base64"),
        schemaName: "uploads",
        tableName: "blocked",
      }),
    });
    expect(importResponse.status).toBe(401);
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
    writeFileSync(join(projectDir, ".gitignore"), ".pondview/\n");
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
          path: ".gitignore",
          content: ".pondview/\n",
        },
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

  test("project endpoints read settings export metadata", async () => {
    const projectDir = createTempDir();
    mkdirSync(join(projectDir, ".pondview"), { recursive: true });
    writeFileSync(
      join(projectDir, ".pondview", "project.json"),
      JSON.stringify({
        schemaVersion: 1,
        project: {
          id: "browser-project-exported",
          name: "Exported Revenue",
          backingKind: "browser-indexeddb",
          openedAt: 1,
          updatedAt: 1,
          defaultSourceRef: "analytics",
        },
      }),
    );

    const server = await startTrackedServer({ projectDir });
    const project = await fetch(`${server.url}/project`);

    expect(await project.json()).toMatchObject({
      project: {
        name: "Exported Revenue",
        defaultSourceRef: "analytics",
        backingKind: "bridge-filesystem",
      },
    });
  });

  test("project endpoints reject traversal", async () => {
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

    const rootFile = await fetch(`${server.url}/project/files`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: [{ path: "package.json", content: "{}\n" }],
      }),
    });
    expect(rootFile.status).toBe(400);
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

function listImportTempDirs(): string[] {
  return readdirSync(tmpdir())
    .filter((entry) => entry.startsWith("pondview-import-"))
    .sort();
}

function createXlsxFixture(): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
        "</Types>",
      ].join(""),
    ),
    "_rels/.rels": strToU8(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
        "</Relationships>",
      ].join(""),
    ),
    "xl/workbook.xml": strToU8(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        '<sheets><sheet name="Orders" sheetId="1" r:id="rId1"/></sheets>',
        "</workbook>",
      ].join(""),
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
        "</Relationships>",
      ].join(""),
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
        '<row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c><c r="B1" t="inlineStr"><is><t>name</t></is></c></row>',
        '<row r="2"><c r="A2"><v>1</v></c><c r="B2" t="inlineStr"><is><t>Ada</t></is></c></row>',
        "</sheetData></worksheet>",
      ].join(""),
    ),
  });
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
