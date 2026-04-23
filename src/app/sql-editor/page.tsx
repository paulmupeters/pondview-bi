import { Plus, X } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { DuckdbRepl } from "@/components/duckdb-shell/repl";
import type { SqlConsoleApi } from "@/components/sql-console";
import type { VisualizationEntry } from "@/components/visualization-entry";
import { VisualizationPanel } from "@/components/visualization-panel";
import type { ConnectedTable } from "@/lib/connected-tables";
import { buildDashboardSourceDescriptor } from "@/lib/dashboard/source-descriptor";
import type { ExplorerInsertPayload } from "@/lib/duckdb/table-reference";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import { useResolvedSqlBackend } from "@/lib/sql/use-sql-backend";
import type { CardConfig, Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  deleteSavedSqlQuery,
  deriveSavedSqlQueryName,
  listSavedSqlQueries,
  renameSavedSqlQuery,
  type SavedSqlQuery,
  saveSqlQuery,
} from "@/lib/workspace/saved-sql-queries-repo";

const VISUALIZATION_ID = "sql-editor-repl";
const SQL_EDITOR_RESULTS_HEIGHT_STORAGE_KEY = "sql-editor-results-height";
const DEFAULT_EDITOR_HEIGHT = 50;
const MIN_EDITOR_HEIGHT = 25;
const MAX_EDITOR_HEIGHT = 75;

type SqlResultPayload = {
  sql: string;
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
  durationMs: number;
  backend?: SqlBackend;
  dbIdentifier?: string;
  catalogContext?: string | null;
};

type SqlQueryTab = {
  id: string;
  name: string;
  sql: string;
  result: SqlResultPayload | null;
  manualChartConfig: Config | null;
  manualCardConfig: CardConfig | null;
  manualVisualType: "table" | "chart" | "card" | null;
};

function createEmptyTab(index: number): SqlQueryTab {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: `Query ${index}`,
    sql: "",
    result: null,
    manualChartConfig: null,
    manualCardConfig: null,
    manualVisualType: null,
  };
}

export function getInitialSqlEditorDb(
  selectedDb: string | undefined,
  _connectedTables: ConnectedTable[],
): string | undefined {
  return selectedDb;
}

export default function SqlEditorPage() {
  const effectiveSqlBackend = useResolvedSqlBackend();

  const [selectedDb, setSelectedDb] = useState<string | undefined>();
  const [selectedCatalogContext, setSelectedCatalogContext] = useState<
    string | null
  >(null);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);
  const [sqlConsoleApi, setSqlConsoleApi] = useState<SqlConsoleApi | null>(
    null,
  );
  const [explorerRefreshToken, setExplorerRefreshToken] = useState(0);
  const [storedSqlQueries, setStoredSqlQueries] = useState<SavedSqlQuery[]>([]);
  const [isSavingStoredSqlQuery, setIsSavingStoredSqlQuery] = useState(false);
  const [editorHeight, setEditorHeight] = useState<number>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_EDITOR_HEIGHT;
    }
    const saved = window.localStorage.getItem(
      SQL_EDITOR_RESULTS_HEIGHT_STORAGE_KEY,
    );
    const parsed = saved ? parseFloat(saved) : DEFAULT_EDITOR_HEIGHT;
    return Number.isFinite(parsed) ? parsed : DEFAULT_EDITOR_HEIGHT;
  });
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const [queryTabs, setQueryTabs] = useState<SqlQueryTab[]>(() => [
    createEmptyTab(1),
  ]);
  const [activeQueryTabId, setActiveQueryTabId] = useState<string>(
    () => queryTabs[0]?.id ?? "",
  );
  const nextQueryTabIndexRef = useRef(2);
  const editorResultsContainerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const resizePointerIdRef = useRef<number | null>(null);
  const resizeStartYRef = useRef(0);
  const resizeStartEditorHeightRef = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        SQL_EDITOR_RESULTS_HEIGHT_STORAGE_KEY,
        editorHeight.toString(),
      );
    }
  }, [editorHeight]);

  // Load saved SQL queries on mount
  useEffect(() => {
    let cancelled = false;
    const loadSavedQueries = async () => {
      try {
        const rows = await listSavedSqlQueries();
        if (!cancelled) {
          setStoredSqlQueries(rows);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load saved SQL queries:", error);
        }
      }
    };
    void loadSavedQueries();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeTab = useMemo(
    () => queryTabs.find((tab) => tab.id === activeQueryTabId) ?? null,
    [activeQueryTabId, queryTabs],
  );
  const sqlResult = activeTab?.result ?? null;
  const manualChartConfig = activeTab?.manualChartConfig ?? null;
  const manualCardConfig = activeTab?.manualCardConfig ?? null;
  const manualVisualType = activeTab?.manualVisualType ?? null;

  const patchActiveTab = useCallback(
    (patch: Partial<SqlQueryTab>) => {
      setQueryTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeQueryTabId ? { ...tab, ...patch } : tab,
        ),
      );
    },
    [activeQueryTabId],
  );

  const handleVisualizationConfigChange = useCallback(
    (config: { chartConfig?: Config; cardConfig?: CardConfig }) => {
      const patch: Partial<SqlQueryTab> = {};
      if ("chartConfig" in config) {
        patch.manualChartConfig = config.chartConfig ?? null;
      }
      if ("cardConfig" in config) {
        patch.manualCardConfig = config.cardConfig ?? null;
      }
      patchActiveTab(patch);
    },
    [patchActiveTab],
  );

  const handleVisualizationTypeChange = useCallback(
    (visualType: "table" | "chart" | "card") => {
      patchActiveTab({ manualVisualType: visualType });
    },
    [patchActiveTab],
  );

  const visualizations = useMemo<VisualizationEntry[]>(() => {
    if (!sqlResult) {
      return [];
    }

    const isCardMode =
      sqlResult.rows.length === 1 && sqlResult.columns.length === 1;
    const visualType =
      manualVisualType ??
      (isCardMode ? "card" : manualChartConfig ? "chart" : "table");

    return [
      {
        id: VISUALIZATION_ID,
        data: {
          stage: "complete",
          progress: 1,
          query: sqlResult.sql,
          dbIdentifier: sqlResult.dbIdentifier,
          catalogContext: sqlResult.catalogContext ?? selectedCatalogContext,
          sqlBackend: sqlResult.backend,
          sourceDescriptor: sqlResult.backend
            ? buildDashboardSourceDescriptor({
                runtimeBackend: sqlResult.backend,
                dbIdentifier: sqlResult.dbIdentifier,
                catalogContext:
                  sqlResult.catalogContext ?? selectedCatalogContext ?? null,
              })
            : null,
          executionTime: sqlResult.durationMs,
          rowCount: sqlResult.rows.length,
          columns: sqlResult.columns,
          rows: sqlResult.rows as Result[],
          visualType,
          chartConfig: manualChartConfig ?? undefined,
          cardConfig: manualCardConfig ?? undefined,
          summary: {
            totalRows: sqlResult.rows.length,
            executionTimeMs: sqlResult.durationMs,
            insights: [],
          },
        },
        stage: "complete",
        progress: 1,
        canAddToChat: false,
        onConfigChange: handleVisualizationConfigChange,
        onVisualTypeChange: handleVisualizationTypeChange,
        source: "manual-repl",
      },
    ];
  }, [
    handleVisualizationConfigChange,
    handleVisualizationTypeChange,
    manualCardConfig,
    manualChartConfig,
    manualVisualType,
    selectedCatalogContext,
    sqlResult,
  ]);

  const activeVisualizationId =
    visualizations.length > 0 ? VISUALIZATION_ID : null;

  const handleSelectQueryTab = useCallback(
    (tabId: string) => {
      if (tabId === activeQueryTabId) return;
      const target = queryTabs.find((tab) => tab.id === tabId);
      if (!target) return;
      const currentSql = sqlConsoleApi?.getQuery() ?? "";
      setQueryTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeQueryTabId ? { ...tab, sql: currentSql } : tab,
        ),
      );
      setActiveQueryTabId(tabId);
      if (sqlConsoleApi) {
        sqlConsoleApi.setQuery(target.sql);
        sqlConsoleApi.focus();
      }
    },
    [activeQueryTabId, queryTabs, sqlConsoleApi],
  );

  const handleAddQueryTab = useCallback(() => {
    const nextIndex = nextQueryTabIndexRef.current;
    nextQueryTabIndexRef.current = nextIndex + 1;
    const newTab = createEmptyTab(nextIndex);
    const currentSql = sqlConsoleApi?.getQuery() ?? "";
    setQueryTabs((prev) => [
      ...prev.map((tab) =>
        tab.id === activeQueryTabId ? { ...tab, sql: currentSql } : tab,
      ),
      newTab,
    ]);
    setActiveQueryTabId(newTab.id);
    if (sqlConsoleApi) {
      sqlConsoleApi.setQuery("");
      sqlConsoleApi.focus();
    }
  }, [activeQueryTabId, sqlConsoleApi]);

  const handleCloseQueryTab = useCallback(
    (tabId: string) => {
      setQueryTabs((prev) => {
        if (prev.length <= 1) {
          const nextIndex = nextQueryTabIndexRef.current;
          nextQueryTabIndexRef.current = nextIndex + 1;
          const replacement = createEmptyTab(nextIndex);
          setActiveQueryTabId(replacement.id);
          if (sqlConsoleApi) {
            sqlConsoleApi.setQuery("");
          }
          return [replacement];
        }

        const closingIndex = prev.findIndex((tab) => tab.id === tabId);
        if (closingIndex === -1) return prev;
        const remaining = prev.filter((tab) => tab.id !== tabId);

        if (tabId === activeQueryTabId) {
          const neighbor =
            remaining[closingIndex] ??
            remaining[closingIndex - 1] ??
            remaining[0];
          if (neighbor) {
            setActiveQueryTabId(neighbor.id);
            if (sqlConsoleApi) {
              sqlConsoleApi.setQuery(neighbor.sql);
            }
          }
        }
        return remaining;
      });
    },
    [activeQueryTabId, sqlConsoleApi],
  );

  const handleRenameQueryTab = useCallback((tabId: string) => {
    if (typeof window === "undefined") return;
    setQueryTabs((prev) => {
      const target = prev.find((tab) => tab.id === tabId);
      if (!target) return prev;
      const requested = window.prompt("Rename tab:", target.name);
      if (requested === null) return prev;
      const normalized = requested.trim();
      if (!normalized) return prev;
      return prev.map((tab) =>
        tab.id === tabId ? { ...tab, name: normalized } : tab,
      );
    });
  }, []);

  const handleInsertTableIntoSql = useCallback(
    (payload: ExplorerInsertPayload) => {
      if (!sqlConsoleApi) return;
      const current = sqlConsoleApi.getQuery() ?? "";
      const lastChar = current.length > 0 ? current[current.length - 1] : "";
      const needsSpace = current.length > 0 && !/\s/.test(lastChar);
      sqlConsoleApi.insertText(`${needsSpace ? " " : ""}${payload.reference}`);
      sqlConsoleApi.focus();
      if (payload.dbIdentifier) {
        setSelectedDb(payload.dbIdentifier);
      }
      setSelectedCatalogContext(payload.catalogContext ?? null);
    },
    [sqlConsoleApi],
  );

  const handleResultChange = useCallback(
    (result: SqlResultPayload | null) => {
      setQueryTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== activeQueryTabId) return tab;
          const prevSql = tab.result?.sql ?? null;
          const newSql = result?.sql ?? null;
          if (newSql === prevSql) {
            return { ...tab, result };
          }
          return {
            ...tab,
            result,
            manualChartConfig: null,
            manualCardConfig: null,
            manualVisualType: result
              ? result.rows.length === 1 && result.columns.length === 1
                ? "card"
                : "table"
              : null,
          };
        }),
      );
      if (result) {
        setExplorerRefreshToken((prev) => prev + 1);
      }
    },
    [activeQueryTabId],
  );

  const handleSaveStoredSqlQuery = useCallback(
    async (sqlOverride?: string) => {
      if (isSavingStoredSqlQuery) return;

      const sql = (sqlOverride ?? sqlConsoleApi?.getQuery() ?? "").trim();
      if (!sql) return;

      const suggestedName = deriveSavedSqlQueryName(sql);
      const requestedName =
        typeof window !== "undefined"
          ? window.prompt("Name this SQL query:", suggestedName)
          : suggestedName;
      if (requestedName === null) return;

      const normalizedName = requestedName.trim();
      if (!normalizedName) return;

      const duplicateByName = storedSqlQueries.find(
        (entry) =>
          entry.name.trim().toLowerCase() === normalizedName.toLowerCase(),
      );
      if (duplicateByName && typeof window !== "undefined") {
        const shouldReplace = window.confirm(
          `A saved query named "${normalizedName}" already exists. Replace it?`,
        );
        if (!shouldReplace) return;
      }

      setIsSavingStoredSqlQuery(true);
      try {
        const rows = await saveSqlQuery({ sql, name: normalizedName });
        setStoredSqlQueries(rows);
      } catch (error) {
        console.error("Failed to save SQL query:", error);
      } finally {
        setIsSavingStoredSqlQuery(false);
      }
    },
    [isSavingStoredSqlQuery, sqlConsoleApi, storedSqlQueries],
  );

  const handleSelectStoredSqlQuery = useCallback(
    (queryId: string) => {
      const selected = storedSqlQueries.find((entry) => entry.id === queryId);
      if (!selected || !sqlConsoleApi) return;
      sqlConsoleApi.setQuery(selected.sql);
      sqlConsoleApi.focus();
      setQueryTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeQueryTabId
            ? { ...tab, sql: selected.sql, name: selected.name || tab.name }
            : tab,
        ),
      );
    },
    [activeQueryTabId, sqlConsoleApi, storedSqlQueries],
  );

  const handleDeleteStoredSqlQuery = useCallback(async (queryId: string) => {
    try {
      const rows = await deleteSavedSqlQuery(queryId);
      setStoredSqlQueries(rows);
    } catch (error) {
      console.error("Failed to delete saved SQL query:", error);
    }
  }, []);

  const handleRenameStoredSqlQuery = useCallback(
    async (queryId: string) => {
      const existing = storedSqlQueries.find((entry) => entry.id === queryId);
      if (!existing) return;

      const requestedName =
        typeof window !== "undefined"
          ? window.prompt("Rename saved SQL query:", existing.name)
          : existing.name;
      if (requestedName === null) return;

      const normalizedName = requestedName.trim();
      if (!normalizedName) return;

      const duplicateByName = storedSqlQueries.find(
        (entry) =>
          entry.id !== queryId &&
          entry.name.trim().toLowerCase() === normalizedName.toLowerCase(),
      );
      if (duplicateByName && typeof window !== "undefined") {
        const shouldReplace = window.confirm(
          `A saved query named "${normalizedName}" already exists. Replace it?`,
        );
        if (!shouldReplace) return;
      }

      try {
        const rows = await renameSavedSqlQuery(queryId, normalizedName);
        setStoredSqlQueries(rows);
      } catch (error) {
        console.error("Failed to rename saved SQL query:", error);
      }
    },
    [storedSqlQueries],
  );

  const queryTabsStrip = (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto",
        isExplorerCollapsed && "pl-11",
      )}
    >
      {queryTabs.map((tab) => {
        const isActive = tab.id === activeQueryTabId;
        return (
          <div
            key={tab.id}
            className={cn(
              "group flex h-[26px] shrink-0 items-center gap-1 rounded border px-2 text-xs transition-colors",
              isActive
                ? "border-border bg-background text-foreground shadow-sm"
                : "border-transparent bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <button
              type="button"
              className="max-w-[160px] truncate font-medium"
              onClick={() => handleSelectQueryTab(tab.id)}
              onDoubleClick={() => handleRenameQueryTab(tab.id)}
              title={tab.name}
            >
              {tab.name}
            </button>
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-border hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                handleCloseQueryTab(tab.id);
              }}
              aria-label={`Close ${tab.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={handleAddQueryTab}
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded border border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="New query tab"
        title="New query tab"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const rightPanelContent = (
    <div className="relative h-full w-full overflow-hidden bg-card">
      <div className="border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
          <p className="truncate font-mono text-xs font-medium tracking-wide text-muted-foreground">
            Query Results
          </p>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[45px] flex flex-col">
        <VisualizationPanel
          visualizations={visualizations}
          selectedVisualizationId={activeVisualizationId}
        />
      </div>
    </div>
  );

  const handlePanelResizeStart = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!editorResultsContainerRef.current) {
        return;
      }

      const containerHeight =
        editorResultsContainerRef.current.getBoundingClientRect().height;
      resizeStartYRef.current = event.clientY;
      resizeStartEditorHeightRef.current =
        (editorHeight / 100) * containerHeight;
      resizePointerIdRef.current = event.pointerId;
      setIsResizingPanels(true);
      resizeHandleRef.current?.setPointerCapture(event.pointerId);
    },
    [editorHeight],
  );

  const handlePanelResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 10 : 5;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setEditorHeight((prev) => Math.max(MIN_EDITOR_HEIGHT, prev - step));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setEditorHeight((prev) => Math.min(MAX_EDITOR_HEIGHT, prev + step));
      } else if (event.key === "Home") {
        event.preventDefault();
        setEditorHeight(MIN_EDITOR_HEIGHT);
      } else if (event.key === "End") {
        event.preventDefault();
        setEditorHeight(MAX_EDITOR_HEIGHT);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isResizingPanels) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!editorResultsContainerRef.current) {
        return;
      }

      const containerHeight =
        editorResultsContainerRef.current.getBoundingClientRect().height;
      const deltaY = event.clientY - resizeStartYRef.current;
      const nextEditorHeight = resizeStartEditorHeightRef.current + deltaY;
      const nextEditorHeightPercent =
        (nextEditorHeight / containerHeight) * 100;

      setEditorHeight(
        Math.max(
          MIN_EDITOR_HEIGHT,
          Math.min(MAX_EDITOR_HEIGHT, nextEditorHeightPercent),
        ),
      );
    };

    const handlePointerUp = () => {
      setIsResizingPanels(false);
      if (resizeHandleRef.current && resizePointerIdRef.current !== null) {
        resizeHandleRef.current.releasePointerCapture(
          resizePointerIdRef.current,
        );
      }
      resizePointerIdRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingPanels]);

  return (
    <div className="relative flex h-screen flex-col">
      <div className="relative flex flex-1 min-h-0 w-full flex-col">
        <div className="flex-1 overflow-hidden bg-card">
          <div className={cn("flex h-full", isResizingPanels && "select-none")}>
            <div className="relative flex flex-1 min-h-0 overflow-hidden">
              <ConnectedDataPanel
                selectedDb={selectedDb}
                onSelect={(db) => {
                  setSelectedDb(db);
                  setSelectedCatalogContext(null);
                }}
                mode="sidebar"
                onInsertTable={handleInsertTableIntoSql}
                refreshToken={explorerRefreshToken}
                collapsed={isExplorerCollapsed}
                collapsedBehavior="overlay"
                onToggleCollapse={() => setIsExplorerCollapsed((prev) => !prev)}
                showCollapseToggle
                className="shrink-0 bg-background"
                sqlBackend={effectiveSqlBackend}
                storedSqlQueries={storedSqlQueries}
                onSelectStoredSqlQuery={handleSelectStoredSqlQuery}
                onDeleteStoredSqlQuery={(queryId) => {
                  void handleDeleteStoredSqlQuery(queryId);
                }}
                onRenameStoredSqlQuery={(queryId) => {
                  void handleRenameStoredSqlQuery(queryId);
                }}
                showStoredSqlQueries
              />
              <div
                ref={editorResultsContainerRef}
                className="relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <div
                  className={cn(
                    "min-h-0 min-w-0",
                    sqlResult ? "border-b border-border" : "flex-1",
                  )}
                  style={sqlResult ? { height: `${editorHeight}%` } : undefined}
                >
                  <DuckdbRepl
                    className="h-full w-full border-0"
                    layoutVariant="page"
                    selectedDbIdentifier={selectedDb}
                    catalogContext={selectedCatalogContext}
                    onConsoleApiChangeAction={setSqlConsoleApi}
                    inlineResults={false}
                    onResultChangeAction={handleResultChange}
                    showRunControls={false}
                    showExplorer={false}
                    showCopySnippetButton
                    showClearButton
                    showSaveQueryButton
                    onSaveQueryAction={handleSaveStoredSqlQuery}
                    isSavingQuery={isSavingStoredSqlQuery}
                    chartConfig={manualChartConfig}
                    editorMinHeight="100%"
                    editorMaxHeight="100%"
                    toolbarLeftSlot={queryTabsStrip}
                  />
                </div>
                {sqlResult ? (
                  <>
                    <div
                      ref={resizeHandleRef}
                      onPointerDown={handlePanelResizeStart}
                      onKeyDown={handlePanelResizeKeyDown}
                      className={cn(
                        "group/resize z-10 flex h-2 shrink-0 cursor-row-resize items-center justify-center bg-card transition-colors hover:bg-border/40",
                        isResizingPanels && "bg-border/60",
                      )}
                      aria-label="Resize SQL editor and results panels"
                      aria-valuemax={MAX_EDITOR_HEIGHT}
                      aria-valuemin={MIN_EDITOR_HEIGHT}
                      aria-valuenow={Math.round(editorHeight)}
                      role="separator"
                      aria-orientation="horizontal"
                      tabIndex={0}
                    >
                      <div
                        className={cn(
                          "h-0.5 w-10 rounded-full bg-border/60 transition-all group-hover/resize:w-16 group-hover/resize:bg-primary/40",
                          isResizingPanels && "w-16 bg-primary/50",
                        )}
                      />
                    </div>
                    <div className="min-h-0 flex-1">{rightPanelContent}</div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
