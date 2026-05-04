import { FileJson, Plug, RefreshCw, Table2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectDataDialog } from "@/components/connect-data-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDuckdbHttpTables } from "@/hooks/use-duckdb-http-tables";
import { useWasmTables } from "@/hooks/use-wasm-tables";
import { refreshDuckDbHttpHealth } from "@/lib/duckdb/duckdb-http-browser";
import {
  clearJoinDefsInStorage,
  readJoinDefsRawFromStorage,
  saveJoinDefsRawToStorage,
} from "@/lib/joins/browser-storage";
import { isHiddenRuntimeSchema } from "@/lib/sql/runtime-table-schemas";
import {
  useBridgeRuntimeState,
  useDuckDbHttpConfig,
  useDuckDbHttpHealthStatus,
  useResolvedSqlBackend,
  useSelectedSqlBackend,
} from "@/lib/sql/use-sql-backend";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type TableEntry = { name: string; type: string };
type SchemaGroup = { schema: string; tables: TableEntry[] };

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
  groups: SchemaGroup[];
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
            key={group.schema}
            className="overflow-hidden rounded-lg border border-border bg-card"
            style={{
              transition: gridVisible
                ? `opacity 500ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms, transform 500ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms`
                : "none",
              opacity: gridVisible ? 1 : 0,
              transform: gridVisible ? "translateY(0)" : "translateY(8px)",
            }}
          >
            {/* Schema header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/70">
                  Schema
                </span>
                <span className="font-mono text-sm font-semibold text-foreground">
                  {group.schema}
                </span>
              </div>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {group.tables.length}
              </span>
            </div>
            {/* Table rows */}
            <div className="divide-y divide-border">
              {group.tables.map((table) => (
                <div
                  key={`${group.schema}.${table.name}`}
                  className="flex items-center justify-between px-4 py-2 transition-colors hover:bg-accent/[0.04]"
                >
                  <span className="text-sm font-medium text-card-foreground">
                    {table.name}
                  </span>
                  <span className="inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                    {table.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({
  kind,
  label,
}: {
  kind: "active" | "warning" | "inactive";
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn("h-2 w-2 shrink-0 rounded-full", {
          "bg-primary": kind === "active",
          "bg-amber-500": kind === "warning",
          "bg-muted-foreground/40": kind === "inactive",
        })}
      />
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function ViewDataPage() {
  /* ── Backend state ── */
  const bridgeRuntimeState = useBridgeRuntimeState();
  const duckDbHttpHealthStatus = useDuckDbHttpHealthStatus();
  const duckDbHttpConfig = useDuckDbHttpConfig();
  const selectedSqlBackend = useSelectedSqlBackend();
  const effectiveSqlBackend = useResolvedSqlBackend();

  /* ── Refresh token ── */
  const [runtimeRefreshToken, setRuntimeRefreshToken] = useState(0);

  /* ── Table loaders ── */
  const {
    tables: duckdbTables,
    isLoading: isDuckdbTablesLoading,
    error: duckdbTablesError,
    isConfigured: isDuckdbHttpConfigured,
    connectionInfo: duckdbHttpConnectionInfo,
  } = useDuckdbHttpTables(effectiveSqlBackend, runtimeRefreshToken);

  const {
    tables: wasmTables,
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

  /* ── Join definitions ── */
  const [joinDefsRaw, setJoinDefsRaw] = useState("[]");
  const [joinDefsError, setJoinDefsError] = useState<string | null>(null);
  const [joinDefsSuccess, setJoinDefsSuccess] = useState<string | null>(null);

  /* ── Animation ── */
  const [gridVisible, setGridVisible] = useState(false);

  /* ── Effects ── */
  useEffect(() => {
    if (!duckDbHttpConfig || selectedSqlBackend !== "duckdb-http") {
      return;
    }
    void refreshDuckDbHttpHealth();
    const intervalId = window.setInterval(() => {
      void refreshDuckDbHttpHealth();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [duckDbHttpConfig, selectedSqlBackend]);

  useEffect(() => {
    setJoinDefsRaw(readJoinDefsRawFromStorage());
  }, []);

  /* ── Derived data ── */
  const tablesBySchema = useMemo(() => {
    const grouped = new Map<string, TableEntry[]>();
    const sourceTables =
      effectiveSqlBackend === "duckdb-wasm" ? wasmTables : duckdbTables;

    for (const table of sourceTables) {
      const schema = table.schema.trim();
      const catalog = table.catalog?.trim();
      if (isHiddenRuntimeSchema(schema)) {
        continue;
      }
      if (catalog && isHiddenRuntimeSchema(catalog)) {
        continue;
      }

      const existing = grouped.get(schema);
      if (existing) {
        existing.push({ name: table.name, type: table.type });
      } else {
        grouped.set(schema, [{ name: table.name, type: table.type }]);
      }
    }

    return Array.from(grouped.entries())
      .map(([schema, entries]) => ({
        schema,
        tables: [...entries].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.schema.localeCompare(b.schema));
  }, [duckdbTables, effectiveSqlBackend, wasmTables]);

  useEffect(() => {
    if (!isTablesLoading && tablesBySchema.length > 0) {
      const id = requestAnimationFrame(() => setGridVisible(true));
      return () => cancelAnimationFrame(id);
    }
    if (isTablesLoading) setGridVisible(false);
  }, [isTablesLoading, tablesBySchema.length]);

  /* ── Labels ── */
  const remoteRuntimeLabel =
    effectiveSqlBackend === "bridge" ? "Bridge" : "DuckDB over HTTP";
  const selectedRuntimeLabel =
    selectedSqlBackend === "bridge" ? "Bridge" : "DuckDB over HTTP";
  const bridgeConnectionLabel = bridgeRuntimeState.config
    ? `${bridgeRuntimeState.config.host}:${bridgeRuntimeState.config.port}`
    : "configured";
  const isBridgeSelectedButNotReady =
    selectedSqlBackend === "bridge" && effectiveSqlBackend !== "bridge";

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

  /* ── Status card content ── */
  const statusAccent = isBridgeSelectedButNotReady
    ? "border-l-amber-500"
    : effectiveSqlBackend === "duckdb-wasm" ||
        (effectiveSqlBackend === "duckdb-http" && isDuckdbHttpConfigured)
      ? "border-l-primary"
      : "border-l-muted-foreground/30";

  const statusKind: "active" | "warning" | "inactive" =
    isBridgeSelectedButNotReady
      ? "warning"
      : effectiveSqlBackend === "duckdb-wasm" ||
          (effectiveSqlBackend === "duckdb-http" && isDuckdbHttpConfigured)
        ? "active"
        : "inactive";

  const statusLabel = isBridgeSelectedButNotReady
    ? `Bridge • ${bridgeConnectionLabel}`
    : effectiveSqlBackend === "duckdb-wasm"
      ? "DuckDB WASM"
      : effectiveSqlBackend === "duckdb-http" && isDuckdbHttpConfigured
        ? `${remoteRuntimeLabel} • ${duckdbHttpConnectionInfo ? `${duckdbHttpConnectionInfo.host}:${duckdbHttpConnectionInfo.port}` : "configured"}`
        : `${selectedRuntimeLabel} • Unavailable`;

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
            {/* Connection Status */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                  Active Runtime
                </p>
              </div>

              <div
                className={cn(
                  "rounded-lg border border-border bg-card p-5 text-left border-l-[3px]",
                  statusAccent,
                )}
              >
                <StatusBadge kind={statusKind} label={statusLabel} />

                <div className="mt-4 space-y-3">
                  {isBridgeSelectedButNotReady ? (
                    <>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {bridgeRuntimeState.isDiscoverable
                          ? "Bridge is selected, but Pondview still needs your session secret before queries can run through the active DuckDB instance."
                          : "Bridge is selected, but the Pondview bridge is currently unavailable."}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Health: {bridgeRuntimeState.healthStatus}
                        {bridgeRuntimeState.config
                          ? ` · Auth: ${bridgeRuntimeState.config.requiresAuth ? (bridgeRuntimeState.hasSessionSecret ? "session secret set" : "required") : "not required"}`
                          : ""}
                      </p>
                    </>
                  ) : effectiveSqlBackend === "duckdb-wasm" ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Queries are running against the browser-local DuckDB WASM
                      database.
                    </p>
                  ) : effectiveSqlBackend === "duckdb-http" &&
                    isDuckdbHttpConfigured ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Remote DuckDB instance connected. Tables are listed in the
                      catalog below.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {selectedRuntimeLabel} is selected, but remote metadata
                        is unavailable.
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Health:{" "}
                        {selectedSqlBackend === "bridge"
                          ? bridgeRuntimeState.healthStatus
                          : duckDbHttpHealthStatus}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* Data Catalog */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                    Data Catalog
                  </p>
                  {tablesBySchema.length > 0 && !isTablesLoading && (
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {tablesBySchema.reduce(
                        (acc, g) => acc + g.tables.length,
                        0,
                      )}{" "}
                      table
                      {tablesBySchema.reduce(
                        (acc, g) => acc + g.tables.length,
                        0,
                      ) !== 1
                        ? "s"
                        : ""}{" "}
                      across {tablesBySchema.length} schema
                      {tablesBySchema.length !== 1 ? "s" : ""}
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
                  groups={tablesBySchema}
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
