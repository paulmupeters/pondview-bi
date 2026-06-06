import { describe, expect, test } from "bun:test";
import { BridgeClient } from "./client";

describe("BridgeClient project endpoints", () => {
  test("sends filesystem project requests with auth", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = new BridgeClient({
      baseUrl: "http://bridge.test",
      token: "secret",
      fetch: (async (url, init = {}) => {
        requests.push({ url: String(url), init });
        if (String(url).endsWith("/project")) {
          return jsonResponse({
            project: {
              id: "bridge-project-root",
              name: "Revenue",
              backingKind: "bridge-filesystem",
              openedAt: 1,
              updatedAt: 2,
              defaultSourceRef: null,
              rootPath: "/work/revenue",
            },
          });
        }
        if (String(url).endsWith("/project/database-paths")) {
          return jsonResponse({
            paths: ["analytics.duckdb"],
          });
        }
        if (String(url).endsWith("/imports/file")) {
          return jsonResponse({
            schemaName: "uploads",
            tableName: "customers",
            rowCount: 1,
            format: "csv",
          });
        }
        return jsonResponse({
          files: [
            {
              path: "pondview/queries/shared/revenue.sql",
              content: "select 1;\n",
            },
          ],
        });
      }) as typeof fetch,
    });

    await client.project();
    await client.updateProject({ name: "Revenue 2026" });
    await client.projectDatabasePaths();
    await client.projectFiles();
    await client.saveProjectFiles({
      files: [{ path: "pondview/queries/shared/revenue.sql", content: "" }],
    });
    await client.replaceProjectFiles({
      scopePath: "pondview/queries/shared",
      files: [],
    });
    await client.deleteProjectFiles({
      paths: ["pondview/queries/shared/revenue.sql"],
    });
    await client.importFile({
      fileName: "customers.csv",
      bytesBase64: "aWQKMQo=",
      schemaName: "uploads",
      tableName: "customers",
    });

    expect(requests.map((request) => request.url)).toEqual([
      "http://bridge.test/project",
      "http://bridge.test/project",
      "http://bridge.test/project/database-paths",
      "http://bridge.test/project/files",
      "http://bridge.test/project/files",
      "http://bridge.test/project/files/replace",
      "http://bridge.test/project/files",
      "http://bridge.test/imports/file",
    ]);
    expect(requests.map((request) => request.init.method ?? "GET")).toEqual([
      "GET",
      "PUT",
      "GET",
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "POST",
    ]);
    expect(
      requests.every(
        (request) =>
          new Headers(request.init.headers).get("authorization") ===
          "Bearer secret",
      ),
    ).toBe(true);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
