import { describe, expect, test } from "bun:test";
import {
  getPublishedNotebookProjectArtifactId,
  getPublishedNotebookProjectScopePath,
} from "@/lib/project-store/project-artifact-sync";

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
});
