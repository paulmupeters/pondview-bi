import { useCallback, useEffect, useReducer, useRef } from "react";
import { logNotebookDebug } from "@/components/chat/notebook-debug";
import type { PromptMode } from "@/components/prompt-input-wrapper";
import type { NotebookSession } from "@/hooks/use-notebook-session";
import type { WorkspaceAnalysisCell } from "@/lib/workspace/workspace-db";

const STALE_NOTEBOOK_CONTROLLER_MUTATION = "STALE_NOTEBOOK_CONTROLLER_MUTATION";

export type PendingNotebookSqlLoad = {
  sql: string;
  autorun: boolean;
};

export type NotebookCellControllerPhase = "hydrate" | "ready" | "mutate";

export type NotebookCellControllerState = {
  phase: NotebookCellControllerPhase;
  focusedCellId: string | null;
  notebookCellModes: Record<string, PromptMode>;
  pendingNotebookSqlLoads: Record<string, PendingNotebookSqlLoad>;
  isBootstrapPending: boolean;
  hasSeededCell: boolean;
  isHydrated: boolean;
  activeMutationCount: number;
};

type NotebookCellControllerAction =
  | { type: "reset"; chatId: string }
  | { type: "mutation:start" }
  | { type: "mutation:end" }
  | { type: "bootstrap:set"; value: boolean }
  | { type: "seed:mark" }
  | { type: "focus:set"; cellId: string | null }
  | { type: "mode:set"; cellId: string; mode: PromptMode }
  | {
      type: "pending-sql:set";
      cellId: string;
      payload: PendingNotebookSqlLoad;
    }
  | { type: "pending-sql:clear"; cellId: string }
  | { type: "cells:prune"; cellIds: Set<string> }
  | { type: "hydration:set"; hydrated: boolean };

export type ResolveNotebookTargetCellInput = {
  cells: WorkspaceAnalysisCell[];
  focusedCellId: string | null;
  preferredCellId?: string | null;
};

export type ShouldSeedNotebookCellInput = {
  hasNotebookSession: boolean;
  hasLoaded: boolean;
  isLoading: boolean;
  cellCount: number;
  hasSeededCell: boolean;
  hasPendingNotebookBootstrapParam: boolean;
  isBootstrapPending: boolean;
  isMutating: boolean;
};

function nextPhase(
  isHydrated: boolean,
  activeMutationCount: number,
): NotebookCellControllerPhase {
  if (!isHydrated) {
    return "hydrate";
  }

  if (activeMutationCount > 0) {
    return "mutate";
  }

  return "ready";
}

function omitRecordKey<T>(
  record: Record<string, T>,
  keyToRemove: string,
): Record<string, T> {
  if (!(keyToRemove in record)) {
    return record;
  }

  const next = { ...record };
  delete next[keyToRemove];
  return next;
}

function pruneRecordKeys<T>(
  record: Record<string, T>,
  allowedCellIds: Set<string>,
): Record<string, T> {
  let changed = false;
  const next: Record<string, T> = {};

  for (const [key, value] of Object.entries(record)) {
    if (!allowedCellIds.has(key)) {
      changed = true;
      continue;
    }

    next[key] = value;
  }

  return changed ? next : record;
}

export function createInitialNotebookCellControllerState(): NotebookCellControllerState {
  return {
    phase: "hydrate",
    focusedCellId: null,
    notebookCellModes: {},
    pendingNotebookSqlLoads: {},
    isBootstrapPending: false,
    hasSeededCell: false,
    isHydrated: false,
    activeMutationCount: 0,
  };
}

export function notebookCellControllerReducer(
  state: NotebookCellControllerState,
  action: NotebookCellControllerAction,
): NotebookCellControllerState {
  switch (action.type) {
    case "reset": {
      return createInitialNotebookCellControllerState();
    }

    case "mutation:start": {
      const activeMutationCount = state.activeMutationCount + 1;
      return {
        ...state,
        activeMutationCount,
        phase: nextPhase(state.isHydrated, activeMutationCount),
      };
    }

    case "mutation:end": {
      const activeMutationCount = Math.max(0, state.activeMutationCount - 1);
      return {
        ...state,
        activeMutationCount,
        phase: nextPhase(state.isHydrated, activeMutationCount),
      };
    }

    case "bootstrap:set": {
      if (state.isBootstrapPending === action.value) {
        return state;
      }

      return {
        ...state,
        isBootstrapPending: action.value,
      };
    }

    case "seed:mark": {
      if (state.hasSeededCell) {
        return state;
      }

      return {
        ...state,
        hasSeededCell: true,
      };
    }

    case "focus:set": {
      if (state.focusedCellId === action.cellId) {
        return state;
      }

      return {
        ...state,
        focusedCellId: action.cellId,
      };
    }

    case "mode:set": {
      if (state.notebookCellModes[action.cellId] === action.mode) {
        return state;
      }

      return {
        ...state,
        notebookCellModes: {
          ...state.notebookCellModes,
          [action.cellId]: action.mode,
        },
      };
    }

    case "pending-sql:set": {
      const existing = state.pendingNotebookSqlLoads[action.cellId];
      if (
        existing?.sql === action.payload.sql &&
        existing?.autorun === action.payload.autorun
      ) {
        return state;
      }

      return {
        ...state,
        pendingNotebookSqlLoads: {
          ...state.pendingNotebookSqlLoads,
          [action.cellId]: action.payload,
        },
      };
    }

    case "pending-sql:clear": {
      const pendingNotebookSqlLoads = omitRecordKey(
        state.pendingNotebookSqlLoads,
        action.cellId,
      );
      if (pendingNotebookSqlLoads === state.pendingNotebookSqlLoads) {
        return state;
      }

      return {
        ...state,
        pendingNotebookSqlLoads,
      };
    }

    case "cells:prune": {
      const notebookCellModes = pruneRecordKeys(
        state.notebookCellModes,
        action.cellIds,
      );
      const pendingNotebookSqlLoads = pruneRecordKeys(
        state.pendingNotebookSqlLoads,
        action.cellIds,
      );
      const focusedCellId =
        state.focusedCellId && !action.cellIds.has(state.focusedCellId)
          ? null
          : state.focusedCellId;

      if (
        notebookCellModes === state.notebookCellModes &&
        pendingNotebookSqlLoads === state.pendingNotebookSqlLoads &&
        focusedCellId === state.focusedCellId
      ) {
        return state;
      }

      return {
        ...state,
        notebookCellModes,
        pendingNotebookSqlLoads,
        focusedCellId,
      };
    }

    case "hydration:set": {
      if (state.isHydrated === action.hydrated) {
        return state;
      }

      return {
        ...state,
        isHydrated: action.hydrated,
        phase: nextPhase(action.hydrated, state.activeMutationCount),
      };
    }

    default: {
      return state;
    }
  }
}

export function resolveNotebookTargetCell({
  cells,
  focusedCellId,
  preferredCellId,
}: ResolveNotebookTargetCellInput): WorkspaceAnalysisCell | null {
  if (preferredCellId) {
    const preferredCell = cells.find((cell) => cell.id === preferredCellId);
    if (preferredCell) {
      return preferredCell;
    }
  }

  if (focusedCellId) {
    const focusedCell = cells.find((cell) => cell.id === focusedCellId);
    if (focusedCell) {
      return focusedCell;
    }
  }

  return cells[cells.length - 1] ?? null;
}

export function shouldSeedNotebookCell({
  hasNotebookSession,
  hasLoaded,
  isLoading,
  cellCount,
  hasSeededCell,
  hasPendingNotebookBootstrapParam,
  isBootstrapPending,
  isMutating,
}: ShouldSeedNotebookCellInput): boolean {
  if (!hasNotebookSession || !hasLoaded || isLoading) {
    return false;
  }

  if (
    hasSeededCell ||
    isMutating ||
    isBootstrapPending ||
    hasPendingNotebookBootstrapParam ||
    cellCount > 0
  ) {
    return false;
  }

  return true;
}

function createStaleMutationError() {
  return new Error(STALE_NOTEBOOK_CONTROLLER_MUTATION);
}

function isStaleMutationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === STALE_NOTEBOOK_CONTROLLER_MUTATION
  );
}

function noop() {
  // no-op
}

type UseNotebookCellControllerArgs = {
  chatId: string;
  notebookSession: NotebookSession | null | undefined;
  notebookCells: WorkspaceAnalysisCell[];
  hasPendingNotebookBootstrapParam: boolean;
};

export type NotebookCellController = {
  phase: NotebookCellControllerPhase;
  focusedCellId: string | null;
  notebookCellModes: Record<string, PromptMode>;
  pendingNotebookSqlLoads: Record<string, PendingNotebookSqlLoad>;
  isBootstrapPending: boolean;
  focusCell: (cellId: string | null) => void;
  setCellMode: (cellId: string, mode: PromptMode) => void;
  queuePendingSqlLoad: (
    cellId: string,
    payload: PendingNotebookSqlLoad,
  ) => void;
  markPendingSqlLoadHandled: (cellId: string) => void;
  createCell: (options?: {
    focus?: boolean;
    mode?: PromptMode;
  }) => Promise<WorkspaceAnalysisCell>;
  ensureTargetCell: (
    preferredCellId?: string | null,
  ) => Promise<WorkspaceAnalysisCell>;
  withBootstrapMutation: <T>(task: () => Promise<T>) => Promise<T>;
};

export function useNotebookCellController({
  chatId,
  notebookSession,
  notebookCells,
  hasPendingNotebookBootstrapParam,
}: UseNotebookCellControllerArgs): NotebookCellController {
  const [state, dispatch] = useReducer(
    notebookCellControllerReducer,
    undefined,
    createInitialNotebookCellControllerState,
  );

  const stateRef = useRef(state);
  const cellsRef = useRef(notebookCells);
  const generationRef = useRef(0);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const cellCreationPromiseRef = useRef<Promise<WorkspaceAnalysisCell> | null>(
    null,
  );
  const bootstrapMutationCountRef = useRef(0);
  const mutationSequenceRef = useRef(0);

  const hasNotebookSession = Boolean(notebookSession);
  const isLoading = notebookSession?.isLoading ?? false;
  const hasLoaded = notebookSession?.hasLoaded ?? false;
  const addCell = notebookSession?.addCell;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    cellsRef.current = notebookCells;
  }, [notebookCells]);

  useEffect(() => {
    generationRef.current += 1;
    mutationQueueRef.current = Promise.resolve();
    cellCreationPromiseRef.current = null;
    bootstrapMutationCountRef.current = 0;
    logNotebookDebug("controller:reset-chat", {
      chatId,
      generation: generationRef.current,
    });
    dispatch({ type: "reset", chatId });
  }, [chatId]);

  const runSerializedMutation = useCallback(
    async <T>(task: () => Promise<T>): Promise<T> => {
      const mutationGeneration = generationRef.current;
      const mutationId = mutationSequenceRef.current + 1;
      mutationSequenceRef.current = mutationId;
      logNotebookDebug("controller:mutation:start", {
        mutationId,
        generation: mutationGeneration,
      });
      dispatch({ type: "mutation:start" });

      const runTask = async () => {
        if (mutationGeneration !== generationRef.current) {
          throw createStaleMutationError();
        }

        return task();
      };

      const pendingTask = mutationQueueRef.current.then(runTask, runTask);
      mutationQueueRef.current = pendingTask.then(noop, noop);

      try {
        const result = await pendingTask;
        logNotebookDebug("controller:mutation:resolved", {
          mutationId,
          generation: mutationGeneration,
        });
        return result;
      } catch (error) {
        logNotebookDebug("controller:mutation:rejected", {
          mutationId,
          generation: mutationGeneration,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        if (mutationGeneration === generationRef.current) {
          dispatch({ type: "mutation:end" });
        }
        logNotebookDebug("controller:mutation:end", {
          mutationId,
          generation: mutationGeneration,
          activeGeneration: generationRef.current,
        });
      }
    },
    [],
  );

  const createCellInternal =
    useCallback(async (): Promise<WorkspaceAnalysisCell> => {
      if (!addCell) {
        throw new Error("Notebook session is required.");
      }

      if (cellCreationPromiseRef.current) {
        return cellCreationPromiseRef.current;
      }

      const pendingCell = addCell();
      cellCreationPromiseRef.current = pendingCell;

      try {
        return await pendingCell;
      } finally {
        if (cellCreationPromiseRef.current === pendingCell) {
          cellCreationPromiseRef.current = null;
        }
      }
    }, [addCell]);

  useEffect(() => {
    logNotebookDebug("controller:reconcile:start", {
      chatId,
      phase: state.phase,
      hasNotebookSession,
      hasLoaded,
      isLoading,
      cellCount: notebookCells.length,
      focusedCellId: state.focusedCellId,
      hasSeededCell: state.hasSeededCell,
      hasPendingNotebookBootstrapParam,
      isBootstrapPending: state.isBootstrapPending,
      activeMutationCount: state.activeMutationCount,
    });

    dispatch({
      type: "cells:prune",
      cellIds: new Set(notebookCells.map((cell) => cell.id)),
    });

    dispatch({
      type: "hydration:set",
      hydrated: hasNotebookSession ? hasLoaded && !isLoading : true,
    });

    if (
      !shouldSeedNotebookCell({
        hasNotebookSession,
        hasLoaded,
        isLoading,
        cellCount: notebookCells.length,
        hasSeededCell: state.hasSeededCell,
        hasPendingNotebookBootstrapParam,
        isBootstrapPending: state.isBootstrapPending,
        isMutating: state.activeMutationCount > 0,
      })
    ) {
      const focusedCellId = stateRef.current.focusedCellId;
      if (
        focusedCellId &&
        notebookCells.some((cell) => cell.id === focusedCellId)
      ) {
        logNotebookDebug("controller:reconcile:keep-focused", {
          focusedCellId,
          cellCount: notebookCells.length,
        });
        return;
      }

      const fallbackCell = notebookCells[notebookCells.length - 1] ?? null;
      logNotebookDebug("controller:reconcile:set-fallback-focus", {
        fallbackCellId: fallbackCell?.id ?? null,
        previousFocusedCellId: focusedCellId,
      });
      dispatch({ type: "focus:set", cellId: fallbackCell?.id ?? null });
      return;
    }

    void runSerializedMutation(async () => {
      const seededCell = await createCellInternal();
      logNotebookDebug("controller:reconcile:seeded-cell", {
        seededCellId: seededCell.id,
      });
      dispatch({ type: "seed:mark" });
      dispatch({ type: "focus:set", cellId: seededCell.id });
    }).catch((error) => {
      if (!isStaleMutationError(error)) {
        console.error("Failed to seed initial notebook cell:", error);
      }
    });
  }, [
    createCellInternal,
    hasLoaded,
    hasNotebookSession,
    hasPendingNotebookBootstrapParam,
    isLoading,
    notebookCells,
    runSerializedMutation,
    state.activeMutationCount,
    state.hasSeededCell,
    state.isBootstrapPending,
    chatId,
    state.focusedCellId,
    state.phase,
  ]);

  const focusCell = useCallback((cellId: string | null) => {
    logNotebookDebug("controller:intent:focus-cell", { cellId });
    dispatch({ type: "focus:set", cellId });
  }, []);

  const setCellMode = useCallback((cellId: string, mode: PromptMode) => {
    logNotebookDebug("controller:intent:set-cell-mode", { cellId, mode });
    dispatch({ type: "mode:set", cellId, mode });
  }, []);

  const queuePendingSqlLoad = useCallback(
    (cellId: string, payload: PendingNotebookSqlLoad) => {
      logNotebookDebug("controller:intent:queue-sql-load", {
        cellId,
        autorun: payload.autorun,
        sqlPreview: payload.sql.slice(0, 100),
      });
      dispatch({
        type: "pending-sql:set",
        cellId,
        payload,
      });
    },
    [],
  );

  const markPendingSqlLoadHandled = useCallback((cellId: string) => {
    logNotebookDebug("controller:intent:sql-load-handled", { cellId });
    dispatch({ type: "pending-sql:clear", cellId });
  }, []);

  const createCell = useCallback(
    async (options?: {
      focus?: boolean;
      mode?: PromptMode;
    }): Promise<WorkspaceAnalysisCell> => {
      logNotebookDebug("controller:intent:create-cell", {
        focus: options?.focus ?? false,
        mode: options?.mode ?? null,
      });
      return runSerializedMutation(async () => {
        const createdCell = await createCellInternal();
        logNotebookDebug("controller:create-cell:created", {
          createdCellId: createdCell.id,
          focus: options?.focus ?? false,
          mode: options?.mode ?? null,
        });

        if (options?.focus) {
          dispatch({ type: "focus:set", cellId: createdCell.id });
        }

        if (options?.mode) {
          dispatch({
            type: "mode:set",
            cellId: createdCell.id,
            mode: options.mode,
          });
        }

        return createdCell;
      });
    },
    [createCellInternal, runSerializedMutation],
  );

  const ensureTargetCell = useCallback(
    async (preferredCellId?: string | null): Promise<WorkspaceAnalysisCell> => {
      if (!hasNotebookSession) {
        throw new Error("Notebook session is required.");
      }

      logNotebookDebug("controller:intent:ensure-target-cell", {
        preferredCellId: preferredCellId ?? null,
      });
      return runSerializedMutation(async () => {
        const targetCell = resolveNotebookTargetCell({
          cells: cellsRef.current,
          focusedCellId: stateRef.current.focusedCellId,
          preferredCellId,
        });

        if (targetCell) {
          logNotebookDebug("controller:ensure-target-cell:existing", {
            targetCellId: targetCell.id,
            preferredCellId: preferredCellId ?? null,
            focusedCellId: stateRef.current.focusedCellId,
          });
          dispatch({ type: "focus:set", cellId: targetCell.id });
          return targetCell;
        }

        const createdCell = await createCellInternal();
        logNotebookDebug("controller:ensure-target-cell:created", {
          createdCellId: createdCell.id,
          preferredCellId: preferredCellId ?? null,
        });
        dispatch({ type: "focus:set", cellId: createdCell.id });
        return createdCell;
      });
    },
    [createCellInternal, hasNotebookSession, runSerializedMutation],
  );

  const withBootstrapMutation = useCallback(
    async <T>(task: () => Promise<T>): Promise<T> => {
      bootstrapMutationCountRef.current += 1;
      logNotebookDebug("controller:bootstrap:start", {
        activeBootstrapMutations: bootstrapMutationCountRef.current,
      });
      if (bootstrapMutationCountRef.current === 1) {
        dispatch({ type: "bootstrap:set", value: true });
      }

      try {
        return await task();
      } finally {
        bootstrapMutationCountRef.current = Math.max(
          0,
          bootstrapMutationCountRef.current - 1,
        );
        if (bootstrapMutationCountRef.current === 0) {
          dispatch({ type: "bootstrap:set", value: false });
        }
        logNotebookDebug("controller:bootstrap:end", {
          activeBootstrapMutations: bootstrapMutationCountRef.current,
        });
      }
    },
    [],
  );

  useEffect(() => {
    logNotebookDebug("controller:state", {
      chatId,
      phase: state.phase,
      focusedCellId: state.focusedCellId,
      cellModeCount: Object.keys(state.notebookCellModes).length,
      pendingSqlLoadCount: Object.keys(state.pendingNotebookSqlLoads).length,
      isBootstrapPending: state.isBootstrapPending,
      hasSeededCell: state.hasSeededCell,
      isHydrated: state.isHydrated,
      activeMutationCount: state.activeMutationCount,
    });
  }, [chatId, state]);

  return {
    phase: state.phase,
    focusedCellId: state.focusedCellId,
    notebookCellModes: state.notebookCellModes,
    pendingNotebookSqlLoads: state.pendingNotebookSqlLoads,
    isBootstrapPending: state.isBootstrapPending,
    focusCell,
    setCellMode,
    queuePendingSqlLoad,
    markPendingSqlLoadHandled,
    createCell,
    ensureTargetCell,
    withBootstrapMutation,
  };
}
