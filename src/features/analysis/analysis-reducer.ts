import type { WorkspaceAnalysisCell } from "@/lib/workspace/workspace-db";

export type AnalysisCellState = WorkspaceAnalysisCell & {
  aiEnabled: boolean;
  sqlEnabled: boolean;
  activeMode: "ai" | "sql" | null;
};

export type AnalysisState = {
  notebookId: string;
  hydration: "loading" | "ready" | "error";
  selectedCellId: string | null;
  cells: AnalysisCellState[];
  bootstrapApplied: boolean;
};

export type AnalysisAction =
  | {
      type: "workspaceLoaded";
      cells: AnalysisCellState[];
    }
  | {
      type: "workspaceFailed";
    }
  | {
      type: "cellAdded";
      cell: AnalysisCellState;
    }
  | {
      type: "cellDeleted";
      cellId: string;
    }
  | {
      type: "cellSelected";
      cellId: string | null;
    }
  | {
      type: "cellAiPaneToggled";
      cellId: string;
      enabled: boolean;
    }
  | {
      type: "cellSqlPaneToggled";
      cellId: string;
      enabled: boolean;
    };

function inferPaneVisibility(cell: WorkspaceAnalysisCell): {
  aiEnabled: boolean;
  sqlEnabled: boolean;
} {
  if (
    typeof cell.aiEnabled === "boolean" &&
    typeof cell.sqlEnabled === "boolean"
  ) {
    if (!cell.aiEnabled && !cell.sqlEnabled) {
      return { aiEnabled: true, sqlEnabled: false };
    }

    return {
      aiEnabled: cell.aiEnabled,
      sqlEnabled: cell.sqlEnabled,
    };
  }

  if (cell.kind === "sql") {
    return { aiEnabled: false, sqlEnabled: true };
  }

  if (cell.kind === "ai") {
    return { aiEnabled: true, sqlEnabled: false };
  }

  if (
    (typeof cell.sqlDraft === "string" && cell.sqlDraft.trim().length > 0) ||
    (typeof cell.resultPayloadJson === "string" &&
      cell.resultPayloadJson.trim().length > 0)
  ) {
    return { aiEnabled: false, sqlEnabled: true };
  }

  return { aiEnabled: true, sqlEnabled: false };
}

function resolveActiveMode(params: {
  aiEnabled: boolean;
  sqlEnabled: boolean;
  currentActiveMode?: "ai" | "sql" | null;
}): "ai" | "sql" | null {
  const { aiEnabled, sqlEnabled, currentActiveMode = null } = params;

  if (currentActiveMode === "ai" && aiEnabled) {
    return "ai";
  }

  if (currentActiveMode === "sql" && sqlEnabled) {
    return "sql";
  }

  if (aiEnabled && !sqlEnabled) {
    return "ai";
  }

  if (sqlEnabled && !aiEnabled) {
    return "sql";
  }

  if (sqlEnabled) {
    return "sql";
  }

  if (aiEnabled) {
    return "ai";
  }

  return null;
}

function updateCellPaneState(
  cell: AnalysisCellState,
  patch: Partial<Pick<AnalysisCellState, "aiEnabled" | "sqlEnabled">>,
): AnalysisCellState {
  const aiEnabled = patch.aiEnabled ?? cell.aiEnabled;
  const sqlEnabled = patch.sqlEnabled ?? cell.sqlEnabled;

  if (!aiEnabled && !sqlEnabled) {
    return cell;
  }

  return {
    ...cell,
    aiEnabled,
    sqlEnabled,
    activeMode: resolveActiveMode({
      aiEnabled,
      sqlEnabled,
      currentActiveMode: cell.activeMode,
    }),
  };
}

function resolveSelectedCellId(
  cells: AnalysisCellState[],
  preferredCellId: string | null,
): string | null {
  if (preferredCellId && cells.some((cell) => cell.id === preferredCellId)) {
    return preferredCellId;
  }

  return cells[0]?.id ?? null;
}

export function toAnalysisCellState(
  cell: WorkspaceAnalysisCell,
): AnalysisCellState {
  const { aiEnabled, sqlEnabled } = inferPaneVisibility(cell);
  return {
    ...cell,
    aiEnabled,
    sqlEnabled,
    activeMode: resolveActiveMode({
      aiEnabled,
      sqlEnabled,
    }),
  };
}

export function createInitialAnalysisState(notebookId: string): AnalysisState {
  return {
    notebookId,
    hydration: "loading",
    selectedCellId: null,
    cells: [],
    bootstrapApplied: false,
  };
}

export function analysisReducer(
  state: AnalysisState,
  action: AnalysisAction,
): AnalysisState {
  switch (action.type) {
    case "workspaceLoaded": {
      return {
        ...state,
        hydration: "ready",
        cells: action.cells,
        selectedCellId: resolveSelectedCellId(
          action.cells,
          state.selectedCellId,
        ),
        bootstrapApplied: true,
      };
    }
    case "workspaceFailed": {
      return {
        ...state,
        hydration: "error",
      };
    }
    case "cellAdded": {
      const cells = [...state.cells, action.cell].sort((left, right) => {
        if (left.position !== right.position) {
          return left.position - right.position;
        }

        return left.createdAt - right.createdAt;
      });

      return {
        ...state,
        cells,
        selectedCellId: action.cell.id,
      };
    }
    case "cellDeleted": {
      const deletedIndex = state.cells.findIndex(
        (cell) => cell.id === action.cellId,
      );
      if (deletedIndex < 0) {
        return state;
      }

      const cells = state.cells.filter((cell) => cell.id !== action.cellId);
      const fallbackCell =
        cells[deletedIndex] ?? cells[Math.max(0, deletedIndex - 1)] ?? null;

      return {
        ...state,
        cells,
        selectedCellId:
          state.selectedCellId === action.cellId
            ? (fallbackCell?.id ?? null)
            : resolveSelectedCellId(cells, state.selectedCellId),
      };
    }
    case "cellSelected": {
      return {
        ...state,
        selectedCellId: resolveSelectedCellId(state.cells, action.cellId),
      };
    }
    case "cellAiPaneToggled": {
      return {
        ...state,
        cells: state.cells.map((cell) =>
          cell.id === action.cellId
            ? updateCellPaneState(cell, { aiEnabled: action.enabled })
            : cell,
        ),
      };
    }
    case "cellSqlPaneToggled": {
      return {
        ...state,
        cells: state.cells.map((cell) =>
          cell.id === action.cellId
            ? updateCellPaneState(cell, { sqlEnabled: action.enabled })
            : cell,
        ),
      };
    }
  }
}
