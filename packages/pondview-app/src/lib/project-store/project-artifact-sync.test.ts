import { describe, expect, test } from "bun:test";
import { findDashboardProjectPathByManifestId } from "@/lib/project-store/dashboard-project-artifact-sync";
import {
  findPublishedNotebookProjectPathByManifestId,
  getPublishedNotebookProjectArtifactId,
  getPublishedNotebookProjectScopePath,
} from "@/lib/project-store/project-artifact-sync";

describe("dashboard project artifact paths", () => {
  test("finds an existing dashboard folder by project-safe attached manifest id", () => {
    expect(
      findDashboardProjectPathByManifestId(
        [
          {
            path: "pondview/dashboards/attached-revenue/dashboard.json",
            content: JSON.stringify({
              schemaVersion: 1,
              id: "attached_bridge_sales-catalog_dashboard_123",
              title: "Attached Revenue",
              measures: [],
              visuals: [],
            }),
          },
        ],
        "attached:bridge::sales-catalog:dashboard_123",
      ),
    ).toBe("pondview/dashboards/attached-revenue");
  });
});

describe("published notebook project artifact paths", () => {
  test("uses the stored project path when one exists", () => {
    expect(
      getPublishedNotebookProjectScopePath({
        notebookId: "notebook-2",
        title: "Revenue overview",
        projectPath: "pondview/notebooks/revenue-overview",
      }),
    ).toBe("pondview/notebooks/revenue-overview");
  });

  test("includes the notebook id in title-derived artifact ids", () => {
    expect(
      getPublishedNotebookProjectArtifactId({
        notebookId: "notebook-2",
        title: "Revenue overview",
      }),
    ).toBe("revenue-overview-notebook-2");
  });

  test("keeps duplicate notebook titles in separate project folders", () => {
    const first = getPublishedNotebookProjectScopePath({
      notebookId: "notebook-1",
      title: "Revenue overview",
    });
    const second = getPublishedNotebookProjectScopePath({
      notebookId: "notebook-2",
      title: "Revenue overview",
    });

    expect(first).toBe("pondview/notebooks/revenue-overview-notebook-1");
    expect(second).toBe("pondview/notebooks/revenue-overview-notebook-2");
  });

  test("finds an existing notebook folder by manifest id", () => {
    expect(
      findPublishedNotebookProjectPathByManifestId(
        [
          {
            path: "pondview/notebooks/notebook-abc/notebook.json",
            content: JSON.stringify({
              schemaVersion: 1,
              id: "notebook-abc",
              title: "Exploration",
              cells: [],
            }),
          },
          {
            path: "pondview/notebooks/products/notebook.json",
            content: JSON.stringify({
              schemaVersion: 1,
              id: "notebook-products",
              title: "Products",
              cells: [],
            }),
          },
        ],
        "notebook-products",
      ),
    ).toBe("pondview/notebooks/products");
  });

  test("ignores invalid notebook manifests while matching existing folders", () => {
    expect(
      findPublishedNotebookProjectPathByManifestId(
        [
          {
            path: "pondview/notebooks/broken/notebook.json",
            content: "{",
          },
          {
            path: "pondview/notebooks/notebook-abc/notebook.json",
            content: JSON.stringify({
              schemaVersion: 1,
              id: "notebook-abc",
              title: "Exploration",
              cells: [],
            }),
          },
        ],
        "notebook-abc",
      ),
    ).toBe("pondview/notebooks/notebook-abc");
  });
});
