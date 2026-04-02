import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRightPanelResize } from "@/components/chat/hooks/use-right-panel-resize";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { DuckdbRepl } from "@/components/duckdb-shell/repl";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { SqlConsoleApi } from "@/components/sql-console";
import type { VisualizationEntry } from "@/components/visualization-entry";
import { VisualizationPanel } from "@/components/visualization-panel";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import { buildDashboardSourceDescriptor } from "@/lib/dashboard/source-descriptor";
import type { ExplorerInsertPayload } from "@/lib/duckdb/table-reference";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
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

export default function SqlEditorPage() {
  const connectedTables = useConnectedTables();
  const effectiveSqlBackend = useResolvedSqlBackend();

  const [selectedDb, setSelectedDb] = useState<string | undefined>();
  const [selectedCatalogContext, setSelectedCatalogContext] = useState<
    string | null
  >(null);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);
  const [sqlConsoleApi, setSqlConsoleApi] = useState<SqlConsoleApi | null>(null);
  const [sqlResult, setSqlResult] = useState<{
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
    backend?: SqlBackend;
    dbIdentifier?: string;
    catalogContext?: string | null;
  } | null>(null);
  const [explorerRefreshToken, setExplorerRefreshToken] = useState(0);
  const [storedSqlQueries, setStoredSqlQueries] = useState<SavedSqlQuery[]>([]);
  const [isSavingStoredSqlQuery, setIsSavingStoredSqlQuery] = useState(false);
  const [manualChartConfig, setManualChartConfig] = useState<Config | null>(
    null,
  );
  const [manualCardConfig, setManualCardConfig] = useState<CardConfig | null>(
    null,
  );
  const [manualVisualType, setManualVisualType] = useState<
    "table" | "chart" | "card" | null
  >(null);
  const prevSqlRef = useRef<string | null>(null);

  const {
    rightPanelWidth,
    isResizing,
    resizeHandleRef,
    containerRef,
    handleResizeStart,
  } = useRightPanelResize();

  // Auto-select the first connected database
  useEffect(() => {
    if (!selectedDb && connectedTables.length > 0) {
      const first = connectedTables[0];
      const firstIdentifier =
        first?.connectionId ??
        first?.databasePath ??
        first?.attachAs ??
        DEFAULT_WASM_DB_IDENTIFIER;
      setSelectedDb(firstIdentifier);
    }
  }, [connectedTables, selectedDb]);

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

  const handleVisualizationConfigChange = useCallback(
    (config: { chartConfig?: Config; cardConfig?: CardConfig }) => {
      if ("chartConfig" in config) {
        setManualChartConfig(config.chartConfig ?? null);
      }
      if ("cardConfig" in config) {
        setManualCardConfig(config.cardConfig ?? null);
      }
    },
    [],
  );

  const handleVisualizationTypeChange = useCallback(
    (visualType: "table" | "chart" | "card") => {
      setManualVisualType(visualType);
    },
    [],
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
          sourceDescriptor:
            sqlResult.backend
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

  const activeVisualizationId = visualizations.length > 0 ? VISUALIZATION_ID : null;

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
    (
      result: {
        sql: string;
        rows: Record<string, unknown>[];
        columns: { name: string; type?: string }[];
        durationMs: number;
        backend?: SqlBackend;
        dbIdentifier?: string;
        catalogContext?: string | null;
      } | null,
    ) => {
      setSqlResult(result);
      if (result) {
        setExplorerRefreshToken((prev) => prev + 1);
      }

      const newSql = result?.sql ?? null;
      if (newSql !== prevSqlRef.current) {
        setManualChartConfig(null);
        setManualCardConfig(null);
        setManualVisualType(
          result && result.rows.length === 1 && result.columns.length === 1
            ? "card"
            : result
              ? "table"
              : null,
        );
        prevSqlRef.current = newSql;
      }
    },
    [],
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
    },
    [sqlConsoleApi, storedSqlQueries],
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

  return (
    <div className="relative flex h-screen flex-col">
      <div className="relative flex flex-1 min-h-0 w-full flex-col">
        <div className="flex-1 overflow-hidden bg-card">
          <div
            ref={containerRef}
            className={cn("flex h-full", isResizing && "select-none")}
          >
            <div
              className="flex flex-col min-w-0 h-full overflow-hidden"
              style={{ width: `${100 - rightPanelWidth}%` }}
            >
              <div className="flex-1 min-h-0 flex overflow-hidden">
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
                  onToggleCollapse={() =>
                    setIsExplorerCollapsed((prev) => !prev)
                  }
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
                <div className="relative flex-1 min-h-0 min-w-0 flex flex-col">
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
                  />
                </div>
              </div>
            </div>

            <div
              ref={resizeHandleRef}
              onPointerDown={handleResizeStart}
              className={cn(
                "group/resize hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-border/40",
                isResizing && "bg-border/60",
              )}
            >
              <div
                className={cn(
                  "h-8 w-0.5 rounded-full bg-border/60 transition-all group-hover/resize:h-12 group-hover/resize:bg-primary/40",
                  isResizing && "h-12 bg-primary/50",
                )}
              />
            </div>
            <div
              className="hidden lg:flex flex-col min-w-0 h-full border-l border-border"
              style={{ width: `${rightPanelWidth}%` }}
            >
              {rightPanelContent}
            </div>
          </div>
        </div>

        <div className="lg:hidden border-t border-border/50 bg-card">
          <div className="h-[400px]">{rightPanelContent}</div>
        </div>
      </div>
    </div>
  );
}
