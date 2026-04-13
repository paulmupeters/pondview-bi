import { describe, expect, test } from "bun:test";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import { resolveDisplayedCellForMissingAiConfig } from "@/features/analysis/components/CellList";

function createCell(
  overrides: Partial<AnalysisCellState> = {},
): AnalysisCellState {
  return {
    id: "cell-1",
    notebookId: "notebook-1",
    position: 0,
    kind: "ai",
    aiEnabled: true,
    sqlEnabled: true,
    activeMode: "ai",
    promptText: "",
    sqlDraft: null,
    selectedDbIdentifier: null,
    selectedCatalogContext: null,
    status: "idle",
    resultPayloadJson: null,
    createdAt: 1,
    updatedAt: 1,
    lastRunAt: null,
    ...overrides,
  };
}

describe("resolveDisplayedCellForMissingAiConfig", () => {
  test("defaults analysis cells to SQL when AI configuration is missing", () => {
    const displayedCell = resolveDisplayedCellForMissingAiConfig({
      cell: createCell(),
      hasAiConfiguration: false,
      honorChatMode: false,
    });

    expect(displayedCell.activeMode).toBe("sql");
  });

  test("keeps chat mode when it was explicitly selected", () => {
    const displayedCell = resolveDisplayedCellForMissingAiConfig({
      cell: createCell(),
      hasAiConfiguration: false,
      honorChatMode: true,
    });

    expect(displayedCell.activeMode).toBe("ai");
  });
});
