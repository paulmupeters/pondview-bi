import { ChevronDown, FileJson, Plug, RefreshCw, Table2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectDataDialog } from "@/components/connect-data-dialog";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useRemoteRuntimeTables } from "@/hooks/use-remote-runtime-tables";
import { useWasmTables } from "@/hooks/use-wasm-tables";
import { listBridgeSources } from "@/lib/bridge/pondview-bridge";
import {
  CONNECTED_TABLES_STORAGE_KEY,
  CONNECTED_TABLES_UPDATED_EVENT,
  type ConnectedTable,
  readConnectedTablesFromStorage,
} from "@/lib/connected-tables";
import {
  buildDataCatalogGroups,
  type DataCatalogGroup,
  type DataCatalogSourceInput,
} from "@/lib/data/catalog-groups";
import {
  clearJoinDefsInStorage,
  readJoinDefsRawFromStorage,
  saveJoinDefsRawToStorage,
} from "@/lib/joins/browser-storage";
import { useResolvedSqlBackend } from "@/lib/sql/use-sql-backend";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

const SCHEMA_SKELETON_KEYS = [
  "schema-skeleton-1",
  "schema-skeleton-2",
  "schema-skeleton-3",
] as const;
const SCHEMA_ROW_SKELETON_KEYS = [
  "schema-row-skeleton-1",
  "schema-row-skeleton-2",
  "schema-row-skeleton-3",
] as const;

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SchemaSkeleton() {
  return (
    <div className="space-y-3">
      {SCHEMA_SKELETON_KEYS.map((key) => (
        <div
          key={key}
          className="animate-pulse overflow-hidden rounded-lg border border-border"
        >
          <div className="h-9 border-b border-border bg-muted/40" />
          <div className="space-y-px">
            {SCHEMA_ROW_SKELETON_KEYS.map((rowKey) => (
              <div key={`${key}-${rowKey}`} className="h-9 bg-muted/30" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableCatalog({
  groups,
  gridVisible,
}: {
  groups: DataCatalogGroup[];
  gridVisible: boolean;
}) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-primary/30 bg-primary/5">
          <Table2 className="h-6 w-6 text-primary/60" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">
          No tables found
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Connect a data source to populate the catalog.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group, i) => {
        const delayMs = Math.min(i, 10) * 50;

        return (
          <div
            key={`${group.catalog}.${group.schema}`}
            className="overflow-hidden rounded-lg border border-border bg-card"
            style={{
              transition: gridVisible
                ? `opacity 500ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms, transform 500ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms`
                : "none",
              opacity: gridVisible ? 1 : 0,
              transform: gridVisible ? "translateY(0)" : "translateY(8px)",
            }}
          >
            {/* Catalog/schema header */}
            <div className="flex items-center justify-between gap-4 border-b border-border bg-muted/30 px-4 py-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/70">
                    Database
                  </span>
                  <span className="truncate font-mono text-sm font-semibold text-foreground">
                    {group.catalog}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/70">
                    Schema
                  </span>
                  <span className="truncate font-mono text-sm font-semibold text-foreground">
                    {group.schema}
                  </span>
                </div>
                {group.origin && (
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/70">
                      Source
                    </span>
                    <span
                      className="inline-flex max-w-full items-center rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground"
                      title={group.origin.description}
                    >
                      <span className="truncate">{group.origin.label}</span>
                    </span>
                  </div>
                )}
              </div>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                {group.tables.length} table
                {group.tables.length !== 1 ? "s" : ""} ·{" "}
                {group.tables.reduce(
                  (acc, table) => acc + (table.columns?.length ?? 0),
                  0,
                )}{" "}
                columns
              </span>
            </div>
            {/* Table rows */}
            <div className="divide-y divide-border">
              {group.tables.map((table) => (
                <Collapsible
                  key={`${group.catalog}.${group.schema}.${table.name}`}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="group flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/[0.04]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                        <span className="min-w-0 truncate text-sm font-medium text-card-foreground">
                          {table.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {table.columns?.length ?? 0} columns
                        </span>
                        <span className="inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                          {table.type}
                        </span>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {table.columns && table.columns.length > 0 ? (
                      <div className="border-t border-border/60 bg-muted/10 px-10 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {table.columns.map((column) => (
                            <span
                              key={`${group.catalog}.${group.schema}.${table.name}.${column.name}`}
                              className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                            >
                              <span className="truncate text-foreground">
                                {column.name}
                              </span>
                              {column.type && (
                                <span className="shrink-0 uppercase text-muted-foreground/70">
                                  {column.type}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="border-t border-border/60 bg-muted/10 px-10 py-3 font-mono text-[10px] text-muted-foreground">
                        Columns unavailable
                      </p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function ViewDataPage() {
  /* ── Backend state ── */
  const effectiveSqlBackend = useResolvedSqlBackend();

  /* ── Refresh token ── */
  const [runtimeRefreshToken, setRuntimeRefreshToken] = useState(0);

  /* ── Table loaders ── */
  const {
    tables: duckdbTables,
    currentCatalog: duckdbCurrentCatalog,
    isLoading: isDuckdbTablesLoading,
    error: duckdbTablesError,
    connectionInfo: duckdbConnectionInfo,
  } = useRemoteRuntimeTables(effectiveSqlBackend, runtimeRefreshToken);

  const {
    tables: wasmTables,
    currentCatalog: wasmCurrentCatalog,
    isLoading: isWasmTablesLoading,
    error: wasmTablesError,
  } = useWasmTables(runtimeRefreshToken, {
    enabled: effectiveSqlBackend === "duckdb-wasm",
  });

  /* ── Unified table status ── */
  const isTablesLoading =
    effectiveSqlBackend === "duckdb-wasm"
      ? isWasmTablesLoading
      : isDuckdbTablesLoading;
  const tablesError =
    effectiveSqlBackend === "duckdb-wasm" ? wasmTablesError : duckdbTablesError;

  /* ── Dialogs ── */
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [connectedSources, setConnectedSources] = useState<ConnectedTable[]>(
    () => readConnectedTablesFromStorage(),
  );
  const [bridgeSources, setBridgeSources] = useState<DataCatalogSourceInput[]>(
    [],
  );

  /* ── Join definitions ── */
  const [joinDefsRaw, setJoinDefsRaw] = useState("[]");
  const [joinDefsError, setJoinDefsError] = useState<string | null>(null);
  const [joinDefsSuccess, setJoinDefsSuccess] = useState<string | null>(null);

  /* ── Animation ── */
  const [gridVisible, setGridVisible] = useState(false);

  /* ── Effects ── */
  useEffect(() => {
    setJoinDefsRaw(readJoinDefsRawFromStorage());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateConnectedSources = () => {
      setConnectedSources(readConnectedTablesFromStorage());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === CONNECTED_TABLES_STORAGE_KEY) {
        updateConnectedSources();
      }
    };

    window.addEventListener(
      CONNECTED_TABLES_UPDATED_EVENT,
      updateConnectedSources,
    );
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(
        CONNECTED_TABLES_UPDATED_EVENT,
        updateConnectedSources,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runtimeRefreshToken intentionally reloads bridge source metadata
  useEffect(() => {
    if (effectiveSqlBackend !== "bridge") {
      setBridgeSources([]);
      return;
    }

    const controller = new AbortController();
    void listBridgeSources(controller.signal)
      .then((response) => {
        setBridgeSources(
          response.sources.map((source) => ({
            type: source.type,
            alias: source.alias,
            readOnly: source.readonly,
          })),
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.warn("[ViewDataPage] Failed to load bridge sources:", error);
          setBridgeSources([]);
        }
      });

    return () => controller.abort();
  }, [effectiveSqlBackend, runtimeRefreshToken]);

  /* ── Derived data ── */
  const catalogGroups = useMemo(() => {
    const sourceTables =
      effectiveSqlBackend === "duckdb-wasm" ? wasmTables : duckdbTables;

    return buildDataCatalogGroups(sourceTables, {
      sqlBackend: effectiveSqlBackend,
      currentCatalog:
        effectiveSqlBackend === "duckdb-wasm"
          ? wasmCurrentCatalog
          : duckdbCurrentCatalog,
      bridgeDatabaseMode: duckdbConnectionInfo?.database?.mode,
      connectedSources: [...connectedSources, ...bridgeSources],
    });
  }, [
    bridgeSources,
    connectedSources,
    duckdbConnectionInfo?.database?.mode,
    duckdbCurrentCatalog,
    duckdbTables,
    effectiveSqlBackend,
    wasmCurrentCatalog,
    wasmTables,
  ]);

  const catalogTableCount = useMemo(
    () => catalogGroups.reduce((acc, group) => acc + group.tables.length, 0),
    [catalogGroups],
  );

  useEffect(() => {
    if (!isTablesLoading && catalogGroups.length > 0) {
      const id = requestAnimationFrame(() => setGridVisible(true));
      return () => cancelAnimationFrame(id);
    }
    if (isTablesLoading) setGridVisible(false);
  }, [catalogGroups.length, isTablesLoading]);

  /* ── Handlers ── */
  const handleSaveJoinDefs = useCallback(() => {
    try {
      const joinDefs = saveJoinDefsRawToStorage(joinDefsRaw);
      setJoinDefsRaw(readJoinDefsRawFromStorage());
      setJoinDefsError(null);
      setJoinDefsSuccess(
        `Saved ${joinDefs.length} join definition${joinDefs.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setJoinDefsSuccess(null);
      setJoinDefsError(
        error instanceof Error
          ? error.message
          : "Invalid join definitions JSON.",
      );
    }
  }, [joinDefsRaw]);

  const handleClearJoinDefs = useCallback(() => {
    clearJoinDefsInStorage();
    setJoinDefsRaw("[]");
    setJoinDefsError(null);
    setJoinDefsSuccess("Cleared join definitions.");
  }, []);

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex-1 overflow-auto bg-background">
        {/* Atmospheric glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[400px]"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, hsl(var(--primary) / 0.06), transparent)",
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6 py-12 lg:px-8">
          {/* Header */}
          <header className="mb-16 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <h1 className="text-5xl font-black tracking-tighter text-foreground sm:text-6xl">
                Connected Data
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="lg"
                className="gap-2 rounded-full px-5"
                onClick={() => setRuntimeRefreshToken((t) => t + 1)}
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button
                size="lg"
                className="gap-2 rounded-full px-6 shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-primary/35"
                onClick={() => setIsConnectDialogOpen(true)}
              >
                <Plug className="h-4 w-4" />
                Connect Source
              </Button>
            </div>
          </header>

          <div className="space-y-16">
            {/* Data Catalog */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                    Data Catalog
                  </p>
                  {catalogGroups.length > 0 && !isTablesLoading && (
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {catalogTableCount} table
                      {catalogTableCount !== 1 ? "s" : ""} across{" "}
                      {catalogGroups.length} database/schema group
                      {catalogGroups.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              {isTablesLoading ? (
                <SchemaSkeleton />
              ) : tablesError ? (
                <div className="animate-in fade-in zoom-in-95 duration-500">
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-left border-l-4 border-l-destructive">
                    <h3 className="text-sm font-semibold text-destructive">
                      Failed to load tables
                    </h3>
                    <p className="mt-1 text-xs text-destructive/80">
                      {tablesError}
                    </p>
                  </div>
                </div>
              ) : (
                <TableCatalog
                  groups={catalogGroups}
                  gridVisible={gridVisible}
                />
              )}
            </section>

            {/* Join Definitions */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <FileJson className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                  Configuration
                </p>
              </div>

              <div className="overflow-hidden rounded-lg border border-border bg-card border-l-[3px] border-l-muted-foreground/30">
                <div className="border-b border-border bg-muted/30 px-5 py-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Cross-table Dashboard Joins
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Configure how tables relate to each other for dashboard
                    filtering. Provide a JSON array with{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      leftTable
                    </code>
                    ,{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      leftColumn
                    </code>
                    ,{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      rightTable
                    </code>
                    ,{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      rightColumn
                    </code>
                    , and optional{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      type
                    </code>
                    .
                  </p>
                </div>

                <div className="space-y-4 p-5">
                  <Textarea
                    value={joinDefsRaw}
                    onChange={(event) => {
                      setJoinDefsRaw(event.target.value);
                      setJoinDefsError(null);
                      setJoinDefsSuccess(null);
                    }}
                    className="min-h-[14rem] border-input/60 bg-muted/20 font-mono text-xs focus-visible:bg-background"
                    spellCheck={false}
                    placeholder="[]"
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSaveJoinDefs}>
                      Save Join Definitions
                    </Button>
                    <Button variant="outline" onClick={handleClearJoinDefs}>
                      Clear
                    </Button>
                  </div>

                  {joinDefsError && (
                    <div className="rounded border-l-2 border-l-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {joinDefsError}
                    </div>
                  )}
                  {joinDefsSuccess && (
                    <div className="rounded border-l-2 border-l-green-500 bg-green-500/5 px-3 py-2 text-xs text-green-600 dark:text-green-400">
                      {joinDefsSuccess}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <ConnectDataDialog
        open={isConnectDialogOpen}
        onOpenChange={setIsConnectDialogOpen}
        onConnected={() =>
          setRuntimeRefreshToken((currentValue) => currentValue + 1)
        }
        effectiveSqlBackend={effectiveSqlBackend}
      />
    </div>
  );
}
