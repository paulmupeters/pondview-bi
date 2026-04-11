import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { DashboardBuilderPanel } from "@/components/dashboard-builder-panel";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  getAnalysisPostBootstrapHref,
  resolveAnalysisBootstrapIntent,
} from "@/features/analysis/analysis-bootstrap";
import { buildNotebookExplorerInsertPatch } from "@/features/analysis/analysis-explorer";
import {
  analysisReducer,
  createInitialAnalysisState,
  toAnalysisCellState,
} from "@/features/analysis/analysis-reducer";
import { AnalysisToolbar } from "@/features/analysis/components/AnalysisToolbar";
import { CellList } from "@/features/analysis/components/CellList";
import {
  DASHBOARD_BUILDER_DIALOG_BODY_CLASS,
  DASHBOARD_BUILDER_DIALOG_CONTENT_CLASS,
} from "@/features/analysis/dashboard-builder-dialog-layout";
import { buildDashboardBuilderMessages } from "@/features/analysis/dashboard-builder-messages";
import type { NotebookSession } from "@/hooks/use-notebook-session";
import type { ExplorerInsertPayload } from "@/lib/duckdb/table-reference";
import { DEFAULT_WASM_DB_IDENTIFIER } from "@/lib/sql/sql-runtime";
import { useResolvedSqlBackend } from "@/lib/sql/use-sql-backend";
import { useRouter, useSearchParams } from "@/vite/next-navigation";

type AnalysisWorkspaceProps = {
  notebookId: string;
  notebookSession: NotebookSession;
};

export function AnalysisWorkspace({
  notebookId,
  notebookSession,
}: AnalysisWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(
    analysisReducer,
    notebookId,
    createInitialAnalysisState,
  );
  const effectiveSqlBackend = useResolvedSqlBackend();
  const [isMutating, setIsMutating] = useState(false);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);
  const [selectedExplorerDb, setSelectedExplorerDb] = useState<
    string | undefined
  >(DEFAULT_WASM_DB_IDENTIFIER);
  const [isDashboardPanelOpen, setIsDashboardPanelOpen] = useState(false);
  const [pendingBootstrap, setPendingBootstrap] = useState<
    | {
        kind: "ai";
        cellId: string;
        prompt: string;
      }
    | {
        kind: "sql";
        cellId: string;
        sql: string;
        autorun: boolean;
      }
    | null
  >(null);
  const appliedBootstrapKeyRef = useRef<string | null>(null);
  const bootstrapIntent = useMemo(
    () => resolveAnalysisBootstrapIntent(searchParams),
    [searchParams],
  );

  useEffect(() => {
    if (!bootstrapIntent) {
      appliedBootstrapKeyRef.current = null;
    }
  }, [bootstrapIntent]);

  useEffect(() => {
    if (effectiveSqlBackend === "duckdb-wasm") {
      if (!selectedExplorerDb) {
        setSelectedExplorerDb(DEFAULT_WASM_DB_IDENTIFIER);
      }
      return;
    }

    if (selectedExplorerDb === DEFAULT_WASM_DB_IDENTIFIER) {
      setSelectedExplorerDb(undefined);
    }
  }, [effectiveSqlBackend, selectedExplorerDb]);

  useEffect(() => {
    const selectedCell = state.cells.find(
      (cell) => cell.id === state.selectedCellId,
    );
    if (!selectedCell?.selectedDbIdentifier) {
      return;
    }

    setSelectedExplorerDb(selectedCell.selectedDbIdentifier);
  }, [state.cells, state.selectedCellId]);

  useEffect(() => {
    if (!notebookSession.hasLoaded) {
      return;
    }

    if (notebookSession.error) {
      dispatch({ type: "workspaceFailed" });
      return;
    }

    dispatch({
      type: "workspaceLoaded",
      cells: notebookSession.cells.map(toAnalysisCellState),
    });
  }, [notebookSession.cells, notebookSession.error, notebookSession.hasLoaded]);

  useEffect(() => {
    if (
      !notebookSession.hasLoaded ||
      notebookSession.error ||
      !bootstrapIntent
    ) {
      return;
    }

    const bootstrapKey = searchParams.toString();
    if (appliedBootstrapKeyRef.current === bootstrapKey) {
      return;
    }
    appliedBootstrapKeyRef.current = bootstrapKey;

    let isCancelled = false;

    void (async () => {
      const selectedCell =
        (state.selectedCellId
          ? notebookSession.cells.find(
              (cell) => cell.id === state.selectedCellId,
            )
          : null) ?? null;
      let targetCell = selectedCell ?? notebookSession.cells.at(-1) ?? null;

      if (!targetCell) {
        targetCell = await notebookSession.addCell({
          kind: bootstrapIntent.mode === "manual" ? "sql" : "ai",
          aiEnabled: bootstrapIntent.mode === "ai",
          sqlEnabled: bootstrapIntent.mode === "manual",
        });
        if (isCancelled) {
          return;
        }
        dispatch({
          type: "cellAdded",
          cell: toAnalysisCellState(targetCell),
        });
      } else {
        dispatch({ type: "cellSelected", cellId: targetCell.id });
      }

      const nextPatch: Parameters<typeof notebookSession.updateCell>[1] = {};
      if (bootstrapIntent.mode === "manual") {
        if (!targetCell.sqlEnabled) {
          nextPatch.sqlEnabled = true;
        }
        if (
          bootstrapIntent.sql &&
          targetCell.sqlDraft !== bootstrapIntent.sql
        ) {
          nextPatch.sqlDraft = bootstrapIntent.sql;
        }
      } else if (!targetCell.aiEnabled) {
        nextPatch.aiEnabled = true;
      }

      if (Object.keys(nextPatch).length > 0) {
        await notebookSession.updateCell(targetCell.id, nextPatch);
        if (isCancelled) {
          return;
        }
      }

      if (bootstrapIntent.prompt) {
        setPendingBootstrap({
          kind: "ai",
          cellId: targetCell.id,
          prompt: bootstrapIntent.prompt,
        });
      } else if (bootstrapIntent.sql) {
        setPendingBootstrap({
          kind: "sql",
          cellId: targetCell.id,
          sql: bootstrapIntent.sql,
          autorun: bootstrapIntent.autorun,
        });
      }

      router.replace(getAnalysisPostBootstrapHref(notebookId));
    })();

    return () => {
      isCancelled = true;
    };
  }, [
    bootstrapIntent,
    notebookId,
    notebookSession,
    router,
    searchParams,
    state.selectedCellId,
  ]);

  function handleBootstrapConsumed(cellId: string) {
    setPendingBootstrap((current) =>
      current?.cellId === cellId ? null : current,
    );
  }

  async function handleAddCell(panes: {
    aiEnabled: boolean;
    sqlEnabled: boolean;
  }) {
    setIsMutating(true);
    try {
      const createdCell = await notebookSession.addCell({
        kind: panes.sqlEnabled && !panes.aiEnabled ? "sql" : "ai",
        aiEnabled: panes.aiEnabled,
        sqlEnabled: panes.sqlEnabled,
      });
      dispatch({
        type: "cellAdded",
        cell: toAnalysisCellState(createdCell),
      });
    } finally {
      setIsMutating(false);
    }
  }

  async function handleDeleteCell(cellId: string) {
    setIsMutating(true);
    try {
      await notebookSession.deleteCell(cellId);
      dispatch({ type: "cellDeleted", cellId });
    } finally {
      setIsMutating(false);
    }
  }

  async function handleToggleAiPane(cellId: string, enabled: boolean) {
    setIsMutating(true);
    try {
      await notebookSession.updateCell(cellId, { aiEnabled: enabled });
      dispatch({ type: "cellAiPaneToggled", cellId, enabled });
    } finally {
      setIsMutating(false);
    }
  }

  async function handleToggleSqlPane(cellId: string, enabled: boolean) {
    setIsMutating(true);
    try {
      await notebookSession.updateCell(cellId, { sqlEnabled: enabled });
      dispatch({ type: "cellSqlPaneToggled", cellId, enabled });
    } finally {
      setIsMutating(false);
    }
  }

  async function handleInsertExplorerTable(payload: ExplorerInsertPayload) {
    if (payload.dbIdentifier) {
      setSelectedExplorerDb(payload.dbIdentifier);
    }

    const nextPatch = buildNotebookExplorerInsertPatch({
      cells: state.cells,
      selectedCellId: state.selectedCellId,
      reference: payload.reference,
      dbIdentifier: payload.dbIdentifier ?? selectedExplorerDb,
      catalogContext: payload.catalogContext,
    });

    if (!nextPatch) {
      return;
    }

    setIsMutating(true);
    try {
      await notebookSession.updateCell(nextPatch.cellId, nextPatch.patch);
    } finally {
      setIsMutating(false);
    }
  }

  const allCellMessages = useMemo(() => {
    return buildDashboardBuilderMessages({
      cells: notebookSession.cells,
      cellEntriesByCellId: notebookSession.cellEntriesByCellId,
    });
  }, [notebookSession.cellEntriesByCellId, notebookSession.cells]);

  const firstCellWithDb = notebookSession.cells.find(
    (cell) => cell.selectedDbIdentifier,
  );

  if (notebookSession.isLoading && !notebookSession.hasLoaded) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading notebook...
      </div>
    );
  }

  if (state.hydration === "error") {
    return (
      <div className="p-6 text-sm text-destructive">
        {notebookSession.error ?? "Failed to load notebook."}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <ConnectedDataPanel
        selectedDb={selectedExplorerDb}
        onSelect={(dbIdentifier) => setSelectedExplorerDb(dbIdentifier)}
        mode="sidebar"
        onInsertTable={(payload) => void handleInsertExplorerTable(payload)}
        collapsed={isExplorerCollapsed}
        collapsedBehavior="overlay"
        onToggleCollapse={() => setIsExplorerCollapsed((previous) => !previous)}
        className="shrink-0 bg-background"
        sqlBackend={effectiveSqlBackend}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AnalysisToolbar
          onAddCell={(mode) =>
            void handleAddCell({
              aiEnabled: mode === "ai",
              sqlEnabled: mode === "manual",
            })
          }
          isBusy={isMutating}
          title={notebookSession.notebook?.title ?? null}
          onTitleChange={(newTitle) =>
            void notebookSession.updateTitle(newTitle)
          }
          onCreateDashboard={() => setIsDashboardPanelOpen(true)}
          isExplorerCollapsed={isExplorerCollapsed}
          onToggleExplorer={() =>
            setIsExplorerCollapsed((previous) => !previous)
          }
          lastSavedAt={notebookSession.notebook?.updatedAt ?? null}
        />
        <Dialog
          open={isDashboardPanelOpen}
          onOpenChange={setIsDashboardPanelOpen}
        >
          <DialogContent className={DASHBOARD_BUILDER_DIALOG_CONTENT_CLASS}>
            <div className={DASHBOARD_BUILDER_DIALOG_BODY_CLASS}>
              <DashboardBuilderPanel
                open={isDashboardPanelOpen}
                onOpenChange={setIsDashboardPanelOpen}
                messages={allCellMessages}
                selectedDbIdentifier={
                  firstCellWithDb?.selectedDbIdentifier ?? undefined
                }
              />
            </div>
          </DialogContent>
        </Dialog>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <CellList
            cells={state.cells}
            selectedCellId={state.selectedCellId}
            pendingBootstrap={pendingBootstrap}
            notebookSession={notebookSession}
            onSelectCell={(cellId) =>
              dispatch({ type: "cellSelected", cellId })
            }
            onBootstrapConsumed={handleBootstrapConsumed}
            onDeleteCell={(cellId) => void handleDeleteCell(cellId)}
            onToggleAiPane={(cellId, enabled) =>
              void handleToggleAiPane(cellId, enabled)
            }
            onToggleSqlPane={(cellId, enabled) =>
              void handleToggleSqlPane(cellId, enabled)
            }
            onAddCell={(mode) =>
              void handleAddCell({
                aiEnabled: mode === "ai",
                sqlEnabled: mode === "manual",
              })
            }
            isBusy={isMutating}
          />
        </div>
      </div>
    </div>
  );
}
