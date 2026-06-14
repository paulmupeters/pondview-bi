import { describe, expect, test } from "bun:test";
import { mergeAnalysisCellPatch } from "@/hooks/use-notebook-session.utils";
import type { WorkspaceAnalysisCell } from "@/lib/workspace/workspace-db";

const baseCell: WorkspaceAnalysisCell = {
  id: "cell-1",
  notebookId: "notebook-1",
  position: 0,
  kind: "sql",
  aiEnabled: false,
  sqlEnabled: true,
  promptText: "",
  sqlDraft: "select 1;",
  selectedDbIdentifier: null,
  selectedCatalogContext: null,
  status: "complete",
  resultPayloadJson: '{"visualType":"card"}',
  createdAt: 1,
  updatedAt: 1,
  lastRunAt: 1,
};

describe("mergeAnalysisCellPatch", () => {
  test("returns null when a patch does not change any persisted values", () => {
    expect(
      mergeAnalysisCellPatch({
        cell: baseCell,
        patch: {
          sqlDraft: "select 1;",
          status: "complete",
        },
        updatedAt: 2,
      }),
    ).toBeNull();
  });

  test("returns an updated cell when at least one field changes", () => {
    expect(
      mergeAnalysisCellPatch({
        cell: baseCell,
        patch: {
          status: "running",
        },
        updatedAt: 2,
      }),
    ).toEqual({
      ...baseCell,
      status: "running",
      updatedAt: 2,
    });
  });

  test("returns an updated cell when pane visibility changes", () => {
    expect(
      mergeAnalysisCellPatch({
        cell: baseCell,
        patch: {
          aiEnabled: true,
          sqlEnabled: true,
        },
        updatedAt: 2,
      }),
    ).toEqual({
      ...baseCell,
      aiEnabled: true,
      sqlEnabled: true,
      updatedAt: 2,
    });
  });
});
