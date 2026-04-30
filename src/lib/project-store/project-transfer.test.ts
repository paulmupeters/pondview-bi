import { describe, expect, test } from "bun:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  BROWSER_PROJECT_ARCHIVE_METADATA_PATH,
  BROWSER_PROJECT_EXPORT_MANIFEST_PATH,
  BROWSER_PROJECT_RUNTIME_SNAPSHOT_PATH,
  BROWSER_PROJECT_VIEWER_HTML_PATH,
  BROWSER_PROJECT_VIEWER_SCRIPT_PATH,
  createBrowserProjectArchive,
  createBrowserProjectBundle,
  parseBrowserProjectArchive,
  parseBrowserProjectArchiveWithRuntime,
  parseBrowserProjectBundle,
} from "@/lib/project-store/project-transfer";

describe("browser project transfer", () => {
  test("creates a portable bundle for an open browser project", () => {
    const bundle = createBrowserProjectBundle({
      project: {
        id: "browser-project-revenue",
        name: "Revenue",
        backingKind: "browser-indexeddb",
        openedAt: 1,
        updatedAt: 2,
        defaultSourceRef: "analytics",
      },
      files: [
        {
          path: "pondview/queries/shared/revenue.query.json",
          content: '{\n  "schemaVersion": 1\n}\n',
        },
      ],
    });

    expect(bundle.project.name).toBe("Revenue");
    expect(bundle.files[0]?.path).toBe(
      "pondview/queries/shared/revenue.query.json",
    );
  });

  test("parses a serialized project bundle", () => {
    const parsed = parseBrowserProjectBundle(`{
      "schemaVersion": 1,
      "exportedAt": "2026-04-23T12:00:00.000Z",
      "project": {
        "id": "browser-project-revenue",
        "name": "Revenue",
        "backingKind": "browser-indexeddb",
        "defaultSourceRef": "analytics"
      },
      "files": [
        {
          "path": "pondview/notebooks/revenue/notebook.json",
          "content": "{\\n  \\"schemaVersion\\": 1\\n}\\n"
        }
      ]
    }`);

    expect(parsed.project.id).toBe("browser-project-revenue");
    expect(parsed.project.defaultSourceRef).toBe("analytics");
    expect(parsed.files).toHaveLength(1);
  });

  test("creates a zip archive with project metadata and tracked files", () => {
    const archive = createBrowserProjectArchive({
      project: {
        id: "browser-project-revenue",
        name: "Revenue",
        backingKind: "browser-indexeddb",
        openedAt: 1,
        updatedAt: 2,
        defaultSourceRef: "analytics",
      },
      files: [
        {
          path: "pondview/queries/shared/revenue.query.json",
          content: '{\n  "schemaVersion": 1\n}\n',
        },
        {
          path: "pondview/queries/shared/revenue.sql",
          content: "select 1;\n",
        },
      ],
    });

    const parsed = parseBrowserProjectArchive(archive);

    expect(parsed.project.name).toBe("Revenue");
    expect(parsed.files.map((file) => file.path)).toEqual([
      "pondview/queries/shared/revenue.query.json",
      "pondview/queries/shared/revenue.sql",
    ]);
  });

  test("includes an offline project viewer in the zip archive", () => {
    const archive = createBrowserProjectArchive({
      project: {
        id: "browser-project-revenue",
        name: "Revenue",
        backingKind: "browser-indexeddb",
        openedAt: 1,
        updatedAt: 2,
        defaultSourceRef: "analytics",
      },
      files: [
        {
          path: "pondview/queries/shared/revenue.query.json",
          content: '{\n  "schemaVersion": 1,\n  "name": "Revenue"\n}\n',
        },
        {
          path: "pondview/queries/shared/revenue.sql",
          content: "select 1;\n",
        },
      ],
    });

    const entries = unzipSync(archive);
    const html = strFromU8(entries[BROWSER_PROJECT_VIEWER_HTML_PATH]);
    const script = strFromU8(entries[BROWSER_PROJECT_VIEWER_SCRIPT_PATH]);
    const parsed = parseBrowserProjectArchive(archive);

    expect(html).toContain("Pondview project export");
    expect(html).toContain("./pondview-export.js");
    expect(script).toContain("const pondviewExport = ");
    expect(script).toContain("pondview/queries/shared/revenue.sql");
    expect(parsed.files.map((file) => file.path)).toEqual([
      "pondview/queries/shared/revenue.query.json",
      "pondview/queries/shared/revenue.sql",
    ]);
  });

  test("includes a runtime snapshot and export manifest when provided", () => {
    const snapshotBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const archive = createBrowserProjectArchive({
      project: {
        id: "browser-project-revenue",
        name: "Revenue",
        backingKind: "browser-indexeddb",
        openedAt: 1,
        updatedAt: 2,
        defaultSourceRef: "analytics",
      },
      files: [
        {
          path: "pondview/queries/shared/revenue.sql",
          content: "select 1;\n",
        },
      ],
      runtimeSnapshot: { bytes: snapshotBytes },
    });

    const { bundle, manifest, runtimeSnapshotBytes } =
      parseBrowserProjectArchiveWithRuntime(archive);

    expect(bundle.files.map((file) => file.path)).toEqual([
      "pondview/queries/shared/revenue.sql",
    ]);
    expect(manifest?.projectArtifacts.included).toBe(true);
    expect(manifest?.runtimeSnapshot).toMatchObject({
      included: true,
      kind: "local",
      path: BROWSER_PROJECT_RUNTIME_SNAPSHOT_PATH,
      sizeBytes: 5,
    });
    expect(runtimeSnapshotBytes).not.toBeNull();
    expect(Array.from(runtimeSnapshotBytes ?? [])).toEqual([1, 2, 3, 4, 5]);
  });

  test("writes a manifest with runtimeSnapshot.included=false when omitted", () => {
    const archive = createBrowserProjectArchive({
      project: {
        id: "browser-project-revenue",
        name: "Revenue",
        backingKind: "browser-indexeddb",
        openedAt: 1,
        updatedAt: 2,
        defaultSourceRef: "analytics",
      },
      files: [],
    });

    const { manifest, runtimeSnapshotBytes } =
      parseBrowserProjectArchiveWithRuntime(archive);

    expect(manifest?.runtimeSnapshot).toEqual({ included: false });
    expect(runtimeSnapshotBytes).toBeNull();
    expect(BROWSER_PROJECT_EXPORT_MANIFEST_PATH).toBe(
      ".pondview/export-manifest.json",
    );
  });

  test("zip archive parser requires the project metadata entry", () => {
    const archive = zipSync({
      "pondview/queries/shared/revenue.sql": strToU8("select 1;\n"),
    });

    expect(() => parseBrowserProjectArchive(archive)).toThrow(
      `Project archive is missing "${BROWSER_PROJECT_ARCHIVE_METADATA_PATH}".`,
    );
  });
});
