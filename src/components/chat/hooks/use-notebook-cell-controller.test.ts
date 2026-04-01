import { describe, expect, test } from "bun:test";
import {
  createInitialNotebookCellControllerState,
  notebookCellControllerReducer,
  resolveNotebookTargetCell,
  shouldSeedNotebookCell,
} from "@/components/chat/hooks/use-notebook-cell-controller";
import type { WorkspaceAnalysisCell } from "@/lib/workspace/workspace-db";

function makeCell(id: string, position: number): WorkspaceAnalysisCell {
  return {
    id,
    notebookId: "notebook-1",
    position,
    promptText: "",
    sqlDraft: null,
    selectedDbIdentifier: null,
    selectedCatalogContext: null,
    status: "idle",
    resultPayloadJson: null,
    createdAt: position,
    updatedAt: position,
    lastRunAt: null,
  };
}

describe("notebook cell controller helpers", () => {
  test("moves through hydrate -> ready -> mutate phases", () => {
    const initial = createInitialNotebookCellControllerState();
    expect(initial.phase).toBe("hydrate");

    const hydrated = notebookCellControllerReducer(initial, {
      type: "hydration:set",
      hydrated: true,
    });
    expect(hydrated.phase).toBe("ready");

    const mutating = notebookCellControllerReducer(hydrated, {
      type: "mutation:start",
    });
    expect(mutating.phase).toBe("mutate");

    const settled = notebookCellControllerReducer(mutating, {
      type: "mutation:end",
    });
    expect(settled.phase).toBe("ready");

    const resetHydration = notebookCellControllerReducer(settled, {
      type: "hydration:set",
      hydrated: false,
    });
    expect(resetHydration.phase).toBe("hydrate");
  });

  test("prunes focus, mode, and pending SQL for removed cells", () => {
    const baseline = createInitialNotebookCellControllerState();
    const withFocus = notebookCellControllerReducer(baseline, {
      type: "focus:set",
      cellId: "cell-2",
    });
    const withModes = notebookCellControllerReducer(withFocus, {
      type: "mode:set",
      cellId: "cell-2",
      mode: "manual",
    });
    const withPending = notebookCellControllerReducer(withModes, {
      type: "pending-sql:set",
      cellId: "cell-2",
      payload: {
        sql: "select 1",
        autorun: false,
      },
    });

    const pruned = notebookCellControllerReducer(withPending, {
      type: "cells:prune",
      cellIds: new Set(["cell-1"]),
    });

    expect(pruned.focusedCellId).toBeNull();
    expect(pruned.notebookCellModes).toEqual({});
    expect(pruned.pendingNotebookSqlLoads).toEqual({});
  });

  test("resolves preferred, then focused, then last cell", () => {
    const cells = [makeCell("cell-1", 0), makeCell("cell-2", 1)];

    expect(
      resolveNotebookTargetCell({
        cells,
        focusedCellId: "cell-1",
        preferredCellId: "cell-2",
      })?.id,
    ).toBe("cell-2");

    expect(
      resolveNotebookTargetCell({
        cells,
        focusedCellId: "cell-1",
        preferredCellId: "missing",
      })?.id,
    ).toBe("cell-1");

    expect(
      resolveNotebookTargetCell({
        cells,
        focusedCellId: "missing",
      })?.id,
    ).toBe("cell-2");

    expect(
      resolveNotebookTargetCell({
        cells: [],
        focusedCellId: null,
      }),
    ).toBeNull();
  });

  test("only seeds when notebook is loaded, empty, and not blocked", () => {
    expect(
      shouldSeedNotebookCell({
        hasNotebookSession: true,
        hasLoaded: true,
        isLoading: false,
        cellCount: 0,
        hasSeededCell: false,
        hasPendingNotebookBootstrapParam: false,
        isBootstrapPending: false,
        isMutating: false,
      }),
    ).toBeTrue();

    expect(
      shouldSeedNotebookCell({
        hasNotebookSession: true,
        hasLoaded: true,
        isLoading: false,
        cellCount: 1,
        hasSeededCell: false,
        hasPendingNotebookBootstrapParam: false,
        isBootstrapPending: false,
        isMutating: false,
      }),
    ).toBeFalse();

    expect(
      shouldSeedNotebookCell({
        hasNotebookSession: true,
        hasLoaded: true,
        isLoading: false,
        cellCount: 0,
        hasSeededCell: false,
        hasPendingNotebookBootstrapParam: true,
        isBootstrapPending: false,
        isMutating: false,
      }),
    ).toBeFalse();
  });
});
