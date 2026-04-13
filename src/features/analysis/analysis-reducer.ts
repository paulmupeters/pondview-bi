import type {
  WorkspaceAnalysisCell,
  WorkspaceAnalysisCellKind,
} from "@/lib/workspace/workspace-db";

export type AnalysisCellState = WorkspaceAnalysisCell & {
  aiEnabled: boolean;
  sqlEnabled: boolean;
  activeMode: "ai" | "sql" | "text" | null;
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
      type: "cellModeSelected";
      cellId: string;
      mode: "ai" | "sql" | "text";
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
  if (cell.kind === "text") {
    return { aiEnabled: false, sqlEnabled: false };
  }

  return { aiEnabled: true, sqlEnabled: true };
}

function resolveActiveMode(params: {
  aiEnabled: boolean;
  sqlEnabled: boolean;
  kind?: WorkspaceAnalysisCellKind;
  currentActiveMode?: "ai" | "sql" | "text" | null;
  hasPersistedSql?: boolean;
}): "ai" | "sql" | "text" | null {
  const {
    aiEnabled,
    sqlEnabled,
    kind,
    currentActiveMode = null,
    hasPersistedSql = false,
  } = params;

  if (kind === "text") {
    return "text";
  }

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

  if (kind === "ai") {
    return "ai";
  }

  if (kind === "sql" || hasPersistedSql) {
    return "sql";
  }

  if (aiEnabled) {
    return "ai";
  }

  if (sqlEnabled) {
    return "sql";
  }

  return null;
}

function updateCellPaneState(
  cell: AnalysisCellState,
  patch: Partial<Pick<AnalysisCellState, "aiEnabled" | "sqlEnabled">>,
): AnalysisCellState {
  const aiEnabled = patch.aiEnabled ?? cell.aiEnabled;
  const sqlEnabled = patch.sqlEnabled ?? cell.sqlEnabled;

  return {
    ...cell,
    aiEnabled,
    sqlEnabled,
    activeMode: resolveActiveMode({
      aiEnabled,
      sqlEnabled,
      kind: cell.kind,
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

function canSelectMode(
  cell: AnalysisCellState,
  mode: "ai" | "sql" | "text",
): boolean {
  if (mode === "text") {
    return cell.kind === "text";
  }

  if (cell.kind === "text") {
    return false;
  }

  return mode === "ai" ? cell.aiEnabled : cell.sqlEnabled;
}

function preserveLoadedCellMode(
  currentCell: AnalysisCellState | undefined,
  loadedCell: AnalysisCellState,
): AnalysisCellState {
  if (
    !currentCell?.activeMode ||
    !canSelectMode(loadedCell, currentCell.activeMode)
  ) {
    return loadedCell;
  }

  return {
    ...loadedCell,
    activeMode: currentCell.activeMode,
  };
}

export function toAnalysisCellState(
  cell: WorkspaceAnalysisCell,
): AnalysisCellState {
  const { aiEnabled, sqlEnabled } = inferPaneVisibility(cell);
  const hasPersistedSql =
    (typeof cell.sqlDraft === "string" && cell.sqlDraft.trim().length > 0) ||
    (typeof cell.resultPayloadJson === "string" &&
      cell.resultPayloadJson.trim().length > 0);
  return {
    ...cell,
    aiEnabled,
    sqlEnabled,
    activeMode: resolveActiveMode({
      aiEnabled,
      sqlEnabled,
      kind: cell.kind,
      hasPersistedSql,
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
      const cells = action.cells.map((loadedCell) =>
        preserveLoadedCellMode(
          state.cells.find((cell) => cell.id === loadedCell.id),
          loadedCell,
        ),
      );

      return {
        ...state,
        hydration: "ready",
        cells,
        selectedCellId: resolveSelectedCellId(cells, state.selectedCellId),
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
    case "cellModeSelected": {
      return {
        ...state,
        cells: state.cells.map((cell) =>
          cell.id === action.cellId && canSelectMode(cell, action.mode)
            ? { ...cell, activeMode: action.mode }
            : cell,
        ),
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
