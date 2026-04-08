import { nanoid } from "nanoid";
import { useCallback, useEffect, useState } from "react";
import { mergeAnalysisCellPatch } from "@/hooks/use-notebook-session.utils";
import {
  deleteAnalysisCell,
  deleteAnalysisCellEntry,
  ensureAnalysisNotebook,
  getAnalysisNotebookSnapshot,
  putAnalysisCellEntries,
  touchAnalysisNotebookUpdatedAt,
  updateAnalysisNotebookTitle,
  upsertAnalysisCell,
} from "@/lib/workspace/analysis-notebook-repo";
import type {
  WorkspaceAnalysisCell,
  WorkspaceAnalysisCellEntry,
  WorkspaceAnalysisCellKind,
  WorkspaceAnalysisNotebook,
} from "@/lib/workspace/workspace-db";

export type NotebookSessionState = {
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  notebook: WorkspaceAnalysisNotebook | null;
  cells: WorkspaceAnalysisCell[];
  cellEntriesByCellId: Map<string, WorkspaceAnalysisCellEntry[]>;
};

export type NotebookSessionActions = {
  updateTitle: (title: string | null) => Promise<void>;
  addCell: (
    input?:
      | string
      | {
          promptText?: string;
          kind?: WorkspaceAnalysisCellKind;
          aiEnabled?: boolean;
          sqlEnabled?: boolean;
        },
  ) => Promise<WorkspaceAnalysisCell>;
  appendCellEntry: (input: {
    cellId: string;
    role: WorkspaceAnalysisCellEntry["role"];
    partsJson: string;
    createdAt?: number;
    id?: string;
  }) => Promise<WorkspaceAnalysisCellEntry>;
  updateCell: (
    cellId: string,
    patch: Partial<
      Pick<
        WorkspaceAnalysisCell,
        | "promptText"
        | "kind"
        | "aiEnabled"
        | "sqlEnabled"
        | "sqlDraft"
        | "selectedDbIdentifier"
        | "selectedCatalogContext"
        | "status"
        | "resultPayloadJson"
        | "lastRunAt"
      >
    >,
  ) => Promise<void>;
  deleteCell: (cellId: string) => Promise<void>;
  deleteCellEntry: (cellId: string, entryId: string) => Promise<void>;
  refreshUpdatedAt: () => Promise<void>;
  reload: () => Promise<void>;
};

export type NotebookSession = NotebookSessionState & NotebookSessionActions;

export function useNotebookSession(notebookId: string | null): NotebookSession {
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notebook, setNotebook] = useState<WorkspaceAnalysisNotebook | null>(
    null,
  );
  const [cells, setCells] = useState<WorkspaceAnalysisCell[]>([]);
  const [cellEntriesByCellId, setCellEntriesByCellId] = useState<
    Map<string, WorkspaceAnalysisCellEntry[]>
  >(new Map());

  const load = useCallback(async () => {
    if (!notebookId) {
      setNotebook(null);
      setCells([]);
      setCellEntriesByCellId(new Map());
      setError(null);
      setIsLoading(false);
      setHasLoaded(true);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await ensureAnalysisNotebook(notebookId);
      const snapshot = await getAnalysisNotebookSnapshot(notebookId);
      setNotebook(snapshot.notebook);
      setCells(snapshot.cells);
      setCellEntriesByCellId(snapshot.cellEntriesByCellId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notebook.");
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [notebookId]);

  useEffect(() => {
    setHasLoaded(false);
    void load();
  }, [load]);

  const updateTitle = useCallback(
    async (title: string | null) => {
      if (!notebookId) {
        return;
      }
      const now = Date.now();
      await updateAnalysisNotebookTitle(notebookId, title, now);
      setNotebook((prev) =>
        prev ? { ...prev, title: title?.trim() || null, updatedAt: now } : prev,
      );
    },
    [notebookId],
  );

  const addCell = useCallback(
    async (
      input:
        | string
        | {
            promptText?: string;
            kind?: WorkspaceAnalysisCellKind;
            aiEnabled?: boolean;
            sqlEnabled?: boolean;
          } = "",
    ): Promise<WorkspaceAnalysisCell> => {
      if (!notebookId) {
        throw new Error("No notebook id");
      }
      const promptText =
        typeof input === "string" ? input : (input.promptText ?? "");
      const kind = typeof input === "string" ? "ai" : (input.kind ?? "ai");
      const aiEnabled =
        typeof input === "string" ? true : (input.aiEnabled ?? kind !== "sql");
      const sqlEnabled =
        typeof input === "string"
          ? false
          : (input.sqlEnabled ?? kind === "sql");
      const now = Date.now();
      const newCell: WorkspaceAnalysisCell = {
        id: nanoid(),
        notebookId,
        position: cells.length,
        kind,
        aiEnabled,
        sqlEnabled,
        promptText,
        sqlDraft: null,
        selectedDbIdentifier: null,
        selectedCatalogContext: null,
        status: "idle",
        resultPayloadJson: null,
        createdAt: now,
        updatedAt: now,
        lastRunAt: null,
      };
      await upsertAnalysisCell(newCell);
      await touchAnalysisNotebookUpdatedAt(notebookId, now);
      setCells((prev) => {
        if (prev.some((cell) => cell.id === newCell.id)) {
          return prev;
        }
        return [...prev, newCell];
      });
      setNotebook((prev) => (prev ? { ...prev, updatedAt: now } : prev));
      return newCell;
    },
    [notebookId, cells.length],
  );

  const appendCellEntry = useCallback(
    async ({
      cellId,
      role,
      partsJson,
      createdAt = Date.now(),
      id = nanoid(),
    }: {
      cellId: string;
      role: WorkspaceAnalysisCellEntry["role"];
      partsJson: string;
      createdAt?: number;
      id?: string;
    }): Promise<WorkspaceAnalysisCellEntry> => {
      if (!notebookId) {
        throw new Error("No notebook id");
      }

      const existingEntries = cellEntriesByCellId.get(cellId) ?? [];
      const nextEntry: WorkspaceAnalysisCellEntry = {
        id,
        notebookId,
        cellId,
        order: existingEntries.length,
        role,
        partsJson,
        createdAt,
      };

      await putAnalysisCellEntries([nextEntry]);

      setCellEntriesByCellId((prev) => {
        const next = new Map(prev);
        const existing = next.get(cellId) ?? [];
        if (existing.some((entry) => entry.id === nextEntry.id)) {
          next.set(
            cellId,
            existing.map((entry) =>
              entry.id === nextEntry.id ? nextEntry : entry,
            ),
          );
          return next;
        }
        next.set(cellId, [...existing, nextEntry]);
        return next;
      });

      return nextEntry;
    },
    [cellEntriesByCellId, notebookId],
  );

  const updateCell = useCallback(
    async (
      cellId: string,
      patch: Partial<
        Pick<
          WorkspaceAnalysisCell,
          | "promptText"
          | "kind"
          | "aiEnabled"
          | "sqlEnabled"
          | "sqlDraft"
          | "selectedDbIdentifier"
          | "selectedCatalogContext"
          | "status"
          | "resultPayloadJson"
          | "lastRunAt"
        >
      >,
    ) => {
      const now = Date.now();
      let updatedCell: WorkspaceAnalysisCell | undefined;
      setCells((prev) =>
        prev.map((cell) => {
          if (cell.id !== cellId) {
            return cell;
          }
          const mergedCell = mergeAnalysisCellPatch({
            cell,
            patch,
            updatedAt: now,
          });
          if (!mergedCell) {
            return cell;
          }
          updatedCell = mergedCell;
          return mergedCell;
        }),
      );
      if (updatedCell) {
        await upsertAnalysisCell(updatedCell);
      }
    },
    [],
  );

  const deleteCell = useCallback(
    async (cellId: string) => {
      if (!notebookId) {
        return;
      }
      await deleteAnalysisCell(cellId);
      setCells((prev) => prev.filter((cell) => cell.id !== cellId));
      setCellEntriesByCellId((prev) => {
        const next = new Map(prev);
        next.delete(cellId);
        return next;
      });
    },
    [notebookId],
  );

  const deleteCellEntry = useCallback(
    async (cellId: string, entryId: string) => {
      if (!notebookId) {
        return;
      }

      await deleteAnalysisCellEntry(entryId);
      setCellEntriesByCellId((prev) => {
        const next = new Map(prev);
        const existing = next.get(cellId) ?? [];
        const filtered = existing.filter((entry) => entry.id !== entryId);
        if (filtered.length > 0) {
          next.set(cellId, filtered);
        } else {
          next.delete(cellId);
        }
        return next;
      });
    },
    [notebookId],
  );

  const refreshUpdatedAt = useCallback(async () => {
    if (!notebookId) {
      return;
    }
    const now = Date.now();
    await touchAnalysisNotebookUpdatedAt(notebookId, now);
    setNotebook((prev) => (prev ? { ...prev, updatedAt: now } : prev));
  }, [notebookId]);

  return {
    isLoading,
    hasLoaded,
    error,
    notebook,
    cells,
    cellEntriesByCellId,
    updateTitle,
    addCell,
    appendCellEntry,
    updateCell,
    deleteCell,
    deleteCellEntry,
    refreshUpdatedAt,
    reload: load,
  };
}
