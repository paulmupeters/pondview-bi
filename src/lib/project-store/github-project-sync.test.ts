import { describe, expect, test } from "bun:test";
import {
  EMPTY_GITHUB_PROJECT_CONFIG,
  fetchProjectArtifactsFromGitHub,
  isGitHubProjectConfigComplete,
  parseGitHubProjectConfigPayload,
  parseGitHubProjectUrl,
  uploadProjectArtifactsToGitHub,
} from "@/lib/project-store/github-project-sync";

describe("github project sync", () => {
  test("normalizes config payloads", () => {
    const config = parseGitHubProjectConfigPayload({
      owner: " paul ",
      repo: " pondview-artifacts.git ",
      branch: "",
      pathPrefix: "/team//analytics/",
      token: " ghp_token ",
    });

    expect(config).toEqual({
      owner: "paul",
      repo: "pondview-artifacts",
      branch: "main",
      pathPrefix: "team/analytics",
      token: "ghp_token",
    });
  });

  test("detects complete config", () => {
    expect(isGitHubProjectConfigComplete(EMPTY_GITHUB_PROJECT_CONFIG)).toBe(
      false,
    );
    expect(
      isGitHubProjectConfigComplete({
        owner: "paul",
        repo: "analytics",
        branch: "main",
        pathPrefix: "",
        token: "token",
      }),
    ).toBe(true);
  });

  test("uploads files through GitHub contents API", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      requests.push({ url: String(url), init });
      if (init?.method === "GET") {
        return new Response(JSON.stringify({ sha: "existing-sha" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ content: { path: "ok" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await uploadProjectArtifactsToGitHub(
      {
        owner: "paul",
        repo: "analytics",
        branch: "project-sync",
        pathPrefix: "examples",
        token: "token",
      },
      [
        {
          path: "pondview/project.json",
          content: '{\n  "name": "Revenue"\n}\n',
        },
      ],
      { fetchImpl, message: "Export project" },
    );

    expect(result.uploaded).toBe(1);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe(
      "https://api.github.com/repos/paul/analytics/contents/examples/pondview/project.json?ref=project-sync",
    );
    expect(requests[1]?.init?.method).toBe("PUT");
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({
      message: "Export project",
      branch: "project-sync",
      sha: "existing-sha",
    });
  });

  test("parses GitHub project URLs", () => {
    expect(parseGitHubProjectUrl("https://github.com/paul/analytics")).toEqual({
      owner: "paul",
      repo: "analytics",
    });
    expect(
      parseGitHubProjectUrl("https://github.com/paul/analytics.git/"),
    ).toEqual({
      owner: "paul",
      repo: "analytics",
    });
    expect(
      parseGitHubProjectUrl(
        "https://github.com/paul/analytics/tree/release/examples/revenue",
      ),
    ).toEqual({
      owner: "paul",
      repo: "analytics",
      branch: "release",
      pathPrefix: "examples/revenue",
    });
    expect(parseGitHubProjectUrl("https://example.com/paul/analytics")).toBe(
      null,
    );
    expect(parseGitHubProjectUrl("not a url")).toBe(null);
    expect(parseGitHubProjectUrl("")).toBe(null);
  });

  test("imports project artifacts from a public GitHub repository", async () => {
    const treePath = (path: string, sha = `sha-${path}`) => ({
      path,
      type: "blob",
      sha,
    });
    const blobs: Record<string, string> = {
      "sha-pondview/project.json": '{ "name": "Revenue" }',
      "sha-pondview/dashboards/sales/dashboard.json": "{}",
      "sha-pondview/queries/top-customers/top-customers.query.json": "{}",
    };

    const requests: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      const target = String(url);
      requests.push(target);

      if (
        target ===
        "https://api.github.com/repos/paul/analytics/git/trees/main?recursive=1"
      ) {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "README.md", type: "blob", sha: "sha-readme" },
              { path: "pondview", type: "tree", sha: "sha-pondview-tree" },
              treePath("pondview/project.json"),
              treePath("pondview/dashboards/sales/dashboard.json"),
              treePath(
                "pondview/queries/top-customers/top-customers.query.json",
              ),
            ],
            truncated: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      const blobMatch = target.match(
        /^https:\/\/api\.github\.com\/repos\/paul\/analytics\/git\/blobs\/(.+)$/,
      );
      if (blobMatch) {
        const sha = decodeURIComponent(blobMatch[1]);
        const content = blobs[sha];
        if (content === undefined) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ content: btoa(content), encoding: "base64" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response("not found", { status: 404 });
    };

    const result = await fetchProjectArtifactsFromGitHub(
      { owner: "paul", repo: "analytics", branch: "main" },
      { fetchImpl },
    );

    expect(result.branch).toBe("main");
    expect(result.pathPrefix).toBe("");
    expect(result.truncated).toBe(false);
    expect(result.files.map((file) => file.path)).toEqual([
      "pondview/dashboards/sales/dashboard.json",
      "pondview/project.json",
      "pondview/queries/top-customers/top-customers.query.json",
    ]);
    expect(
      result.files.find((file) => file.path === "pondview/project.json")
        ?.content,
    ).toBe('{ "name": "Revenue" }');
    expect(requests[0]).toBe(
      "https://api.github.com/repos/paul/analytics/git/trees/main?recursive=1",
    );
  });

  test("resolves the default branch when none is provided", async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const target = String(url);
      if (target === "https://api.github.com/repos/paul/analytics") {
        return new Response(JSON.stringify({ default_branch: "trunk" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (
        target ===
        "https://api.github.com/repos/paul/analytics/git/trees/trunk?recursive=1"
      ) {
        return new Response(
          JSON.stringify({
            tree: [
              {
                path: "examples/revenue/pondview/project.json",
                type: "blob",
                sha: "sha-project",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (
        target ===
        "https://api.github.com/repos/paul/analytics/git/blobs/sha-project"
      ) {
        return new Response(
          JSON.stringify({ content: btoa("{}"), encoding: "base64" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    };

    const result = await fetchProjectArtifactsFromGitHub(
      { owner: "paul", repo: "analytics", pathPrefix: "examples/revenue" },
      { fetchImpl },
    );

    expect(result.branch).toBe("trunk");
    expect(result.pathPrefix).toBe("examples/revenue");
    expect(result.files.map((file) => file.path)).toEqual([
      "pondview/project.json",
    ]);
  });

  test("throws when no Pondview artifacts are present", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          tree: [{ path: "README.md", type: "blob", sha: "sha-readme" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    await expect(
      fetchProjectArtifactsFromGitHub(
        { owner: "paul", repo: "analytics", branch: "main" },
        { fetchImpl },
      ),
    ).rejects.toThrow(/No Pondview project artifacts found/);
  });

  test("treats missing files as creates", async () => {
    const putBodies: unknown[] = [];
    const fetchImpl = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      if (init?.method === "GET") {
        return new Response(JSON.stringify({ message: "Not Found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      putBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ content: { path: "ok" } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    };

    await uploadProjectArtifactsToGitHub(
      {
        owner: "paul",
        repo: "analytics",
        branch: "main",
        pathPrefix: "",
        token: "token",
      },
      [{ path: "pondview/project.json", content: "{}\n" }],
      { fetchImpl },
    );

    expect(putBodies[0]).not.toHaveProperty("sha");
  });
});
