import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import {
  BROWSER_PROJECT_ARCHIVE_METADATA_PATH,
  createBrowserProjectArchive,
  createBrowserProjectBundle,
  parseBrowserProjectArchive,
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

  test("zip archive parser requires the project metadata entry", () => {
    const archive = zipSync({
      "pondview/queries/shared/revenue.sql": strToU8("select 1;\n"),
    });

    expect(() => parseBrowserProjectArchive(archive)).toThrow(
      `Project archive is missing "${BROWSER_PROJECT_ARCHIVE_METADATA_PATH}".`,
    );
  });
});
