import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  test("serve mode keeps API routes ahead of static routing", async () => {
    const staticDir = createStaticDir();
    const server = await startTrackedServer({ serveUi: true, staticDir });

    const ping = await fetch(`${server.url}/ping`);
    expect(await ping.json()).toEqual({ status: "ok" });

    const config = await fetch(`${server.url}/api/duckdb/config`);
    expect(await config.json()).toMatchObject({
      host: "127.0.0.1",
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
}): Promise<BridgeServerHandle> {
  const server = await startBridgeUiServer({ ...options, port: 0 });
  handles.push(server);
  return server;
}

function createStaticDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pondview-static-"));
  tempDirs.push(dir);
  writeFileSync(join(dir, "index.html"), "<h1>Pondview test shell</h1>");
  const assetsDir = join(dir, "assets");
  mkdirSync(assetsDir);
  writeFileSync(
    join(assetsDir, "app.js"),
    "console.log('hello from pondview');",
  );
  return dir;
}
