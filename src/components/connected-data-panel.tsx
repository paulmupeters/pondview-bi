import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Database, PanelLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PromptInputHoverCard,
  PromptInputHoverCardContent,
  PromptInputHoverCardTrigger,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDuckdbHttpTables } from "@/hooks/use-duckdb-http-tables";
import { useWasmTables } from "@/hooks/use-wasm-tables";
import { runBridgeQuery } from "@/lib/bridge/pondview-bridge";
import type { ConnectedTable } from "@/lib/connected-tables";
import {
  buildAttachmentPlan,
  buildDetachStatement,
  quoteIdentifier,
  resolveAttachmentAlias,
} from "@/lib/duckdb/duckdb-attachments";
import { runDuckDbHttpQuery } from "@/lib/duckdb/duckdb-http-browser";
import {
  buildExplorerInsertPayload,
  buildExplorerTableReference,
  type ExplorerInsertPayload,
  isDefaultExplorerSchema,
} from "@/lib/duckdb/table-reference";
import { isHiddenRuntimeSchema } from "@/lib/sql/runtime-table-schemas";
import { ensureSampleDataForEmptyRuntime } from "@/lib/sql/sample-data";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  isWasmLocalIdentifier,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import { cn } from "@/lib/utils";
import type { SavedSqlQuery } from "@/lib/workspace/saved-sql-queries-repo";
import type { DraftSqlQuery } from "@/lib/workspace/sql-editor-drafts-repo";
import { Separator } from "./ui/separator";

type ExplorerTableGroup = {
  catalog: string;
  schema: string;
  tables: string[];
};

function getExplorerToggleLabel(isCollapsed: boolean): string {
  return isCollapsed ? "Show explorer" : "Hide explorer";
}

export function getConnectedEntryCatalog(
  entry: ConnectedTable,
): string | undefined {
  if (entry.type === "duckdb") {
    return undefined;
  }

  return resolveAttachmentAlias({
    alias: entry.attachAs || "source",
    identifier: entry.databasePath ?? entry.connectionId,
  });
}

export function getConnectedEntryDisplayName(entry: ConnectedTable): string {
  const parts: string[] = [];
  const catalog = getConnectedEntryCatalog(entry);

  if (catalog) {
    parts.push(catalog);
  } else if (entry.attachAs) {
    parts.push(entry.attachAs);
  }

  if (entry.schema && !isDefaultExplorerSchema(entry.schema)) {
    parts.push(entry.schema);
  }
  if (entry.table) {
    parts.push(entry.table);
  }
  if (parts.length === 0) {
    parts.push(
      entry.databaseName ??
        entry.attachAs ??
        entry.connectionId ??
        entry.databasePath ??
        "unknown",
    );
  }

  return `${parts.join(".")} (${entry.type})`;
}

function isHiddenMetadataTableReference(value: string): boolean {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return false;
  }

  const [schemaCandidate] = trimmedValue.split(".");
  return isHiddenRuntimeSchema(schemaCandidate ?? "");
}

export function getVisibleConnectedEntryTables(
  entry: ConnectedTable,
): string[] {
  const selectedTables =
    entry.tables?.filter(
      (tableName) => !isHiddenMetadataTableReference(tableName),
    ) ?? [];

  if (selectedTables.length > 0) {
    return selectedTables;
  }

  if (entry.table && !isHiddenMetadataTableReference(entry.table)) {
    return [entry.table];
  }

  return [];
}

export function shouldShowConnectedEntry(
  entry: ConnectedTable,
  visibleRemoteCatalogs: Set<string>,
): boolean {
  if (entry.schema && isHiddenRuntimeSchema(entry.schema)) {
    return false;
  }

  if (getVisibleConnectedEntryTables(entry).length === 0) {
    return false;
  }

  const catalog = getConnectedEntryCatalog(entry)?.trim().toLowerCase();
  if (!catalog) {
    return true;
  }

  return !visibleRemoteCatalogs.has(catalog);
}

export type ConnectedEntryStatus = "ready" | "disconnected";

function createExplorerRemoteSqlRunner(
  sqlBackend: SqlBackend,
): (sql: string) => Promise<Record<string, unknown>[]> {
  if (sqlBackend === "bridge") {
    return async (sql: string) => {
      const result = await runBridgeQuery(sql);
      return result.rows;
    };
  }

  if (sqlBackend === "duckdb-http") {
    return async (sql: string) => {
      const result = await runDuckDbHttpQuery(sql);
      return result.rows;
    };
  }

  throw new Error(`Remote SQL is unavailable for backend ${sqlBackend}.`);
}

export async function validateConnectedEntry(
  entry: ConnectedTable,
  options: {
    sqlBackend: SqlBackend;
    runRemoteSql?: (sql: string) => Promise<Record<string, unknown>[]>;
  },
): Promise<{ status: ConnectedEntryStatus }> {
  if (entry.type === "duckdb") {
    return { status: "ready" };
  }

  if (options.sqlBackend === "duckdb-wasm") {
    return { status: "disconnected" };
  }

  const identifier = entry.databasePath ?? entry.connectionId;
  if (!identifier) {
    return { status: "disconnected" };
  }

  const runRemoteSql =
    options.runRemoteSql ?? createExplorerRemoteSqlRunner(options.sqlBackend);
  let plan: ReturnType<typeof buildAttachmentPlan> | null = null;

  try {
    plan = buildAttachmentPlan({
      type: entry.type,
      identifier,
      connectionId: entry.connectionId,
      alias: entry.attachAs,
      readOnly: entry.readOnly,
      duckdbExtension: entry.duckdbExtension,
    });

    for (const statement of plan.statements) {
      await runRemoteSql(statement);
    }
    await runRemoteSql(
      `SELECT 1 FROM ${quoteIdentifier(plan.alias)}.information_schema.tables LIMIT 1;`,
    );
    return { status: "ready" };
  } catch {
    return { status: "disconnected" };
  } finally {
    if (plan) {
      try {
        await runRemoteSql(
          buildDetachStatement(plan.alias, { ifExists: true }),
        );
      } catch {
        // Best-effort cleanup after validation.
      }
    }
  }
}

export type SampleDataState = {
  isLoading: boolean;
  error: string | null;
};

export function resolveActiveRuntimeExplorer(params: {
  sqlBackend: SqlBackend;
  groupedRemoteTables: ExplorerTableGroup[];
  groupedWasmTables: ExplorerTableGroup[];
}): {
  target: "remote" | "wasm";
  groups: ExplorerTableGroup[];
} {
  if (params.sqlBackend === "duckdb-wasm") {
    return {
      target: "wasm",
      groups: params.groupedWasmTables,
    };
  }

  return {
    target: "remote",
    groups: params.groupedRemoteTables,
  };
}

export function getExplorerTableDisplayLabel({
  catalog,
  schema,
  table,
}: {
  catalog?: string;
  schema?: string;
  table: string;
}): string {
  return buildExplorerTableReference({
    catalog,
    schema,
    table,
    includeCatalog: Boolean(catalog?.trim()),
  });
}

export function getSampleDataActionState({
  hasTables,
  isLoading,
  error,
}: {
  hasTables: boolean;
  isLoading: boolean;
  error: string | null;
}): SampleDataState | null {
  if (hasTables) {
    return null;
  }

  return {
    isLoading,
    error,
  };
}

interface ConnectedDataPanelProps {
  selectedDb?: string;
  onSelect: (dbIdentifier: string) => void;
  className?: string;
  onInsertTable?: (payload: ExplorerInsertPayload) => void;
  mode?: "popover" | "sidebar";
  collapsed?: boolean;
  collapsedBehavior?: "inline" | "overlay";
  onToggleCollapse?: () => void;
  showCollapseToggle?: boolean;
  refreshToken?: number;
  sqlBackend?: SqlBackend;
  draftSqlQueries?: DraftSqlQuery[];
  onSelectDraftSqlQuery?: (draftId: string) => void;
  onDeleteDraftSqlQuery?: (draftId: string) => void;
  onRenameDraftSqlQuery?: (draftId: string) => void;
  storedSqlQueries?: SavedSqlQuery[];
  onSelectStoredSqlQuery?: (queryId: string) => void;
  onDeleteStoredSqlQuery?: (queryId: string) => void;
  onRenameStoredSqlQuery?: (queryId: string) => void;
  showStoredSqlQueries?: boolean;
  toggleShortcutLabel?: string;
}

export function ConnectedDataPanel({
  selectedDb,
  onSelect,
  className,
  onInsertTable,
  mode = "popover",
  collapsed = false,
  collapsedBehavior = "inline",
  onToggleCollapse,
  showCollapseToggle = false,
  refreshToken,
  sqlBackend = "duckdb-wasm",
  draftSqlQueries = [],
  onSelectDraftSqlQuery,
  onDeleteDraftSqlQuery,
  onRenameDraftSqlQuery,
  storedSqlQueries = [],
  onSelectStoredSqlQuery,
  onDeleteStoredSqlQuery,
  onRenameStoredSqlQuery,
  showStoredSqlQueries = false,
  toggleShortcutLabel,
}: ConnectedDataPanelProps) {
  const {
    tables: wasmTables,
    currentCatalog: wasmCurrentCatalog,
    isLoading: isLoadingWasmTables,
    error: wasmTablesError,
    refresh: refreshWasmTables,
  } = useWasmTables();
  const {
    tables: remoteTables,
    currentCatalog: remoteCurrentCatalog,
    isLoading: isLoadingRemoteTables,
    error: remoteTablesError,
    connectionInfo: remoteConnectionInfo,
    refresh: refreshRemoteTables,
  } = useDuckdbHttpTables(sqlBackend, refreshToken);
  const [isOpen, setIsOpen] = useState(false);
  const [sampleDataLoadingTarget, setSampleDataLoadingTarget] = useState<
    "remote" | "wasm" | null
  >(null);
  const [sampleDataErrors, setSampleDataErrors] = useState<{
    remote: string | null;
    wasm: string | null;
  }>({
    remote: null,
    wasm: null,
  });
  const canToggleCollapse = showCollapseToggle && Boolean(onToggleCollapse);

  useEffect(() => {
    if (refreshToken === undefined) {
      return;
    }
    void refreshWasmTables();
  }, [refreshToken, refreshWasmTables]);

  const handleAddSampleData = useCallback(
    async (target: "remote" | "wasm") => {
      const backendPreference =
        target === "remote" ? sqlBackend : "duckdb-wasm";

      setSampleDataLoadingTarget(target);
      setSampleDataErrors((previous) => ({
        ...previous,
        [target]: null,
      }));

      try {
        await ensureSampleDataForEmptyRuntime({ backendPreference });
        if (target === "remote") {
          await refreshRemoteTables();
        } else {
          await refreshWasmTables();
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to add sample data.";
        setSampleDataErrors((previous) => ({
          ...previous,
          [target]: message,
        }));
      } finally {
        setSampleDataLoadingTarget((current) =>
          current === target ? null : current,
        );
      }
    },
    [refreshRemoteTables, refreshWasmTables, sqlBackend],
  );

  const groupExplorerTables = useMemo(
    () =>
      (
        tables: Array<{
          catalog?: string;
          schema: string;
          name: string;
        }>,
      ): ExplorerTableGroup[] => {
        const grouped = new Map<string, string[]>();

        for (const table of tables) {
          const catalog = table.catalog?.trim() || "";
          const schema = table.schema?.trim() || "main";
          const key = `${catalog}::${schema}`;
          const existing = grouped.get(key);
          if (existing) {
            existing.push(table.name);
          } else {
            grouped.set(key, [table.name]);
          }
        }

        return Array.from(grouped.entries())
          .map(([key, tablesForGroup]) => {
            const [catalog, schema] = key.split("::");
            return {
              catalog,
              schema,
              tables: Array.from(new Set(tablesForGroup)).sort((a, b) =>
                a.localeCompare(b),
              ),
            };
          })
          .sort(
            (a, b) =>
              a.catalog.localeCompare(b.catalog) ||
              a.schema.localeCompare(b.schema),
          );
      },
    [],
  );

  const groupedWasmTables = useMemo(
    () =>
      groupExplorerTables(wasmTables).filter(
        (group) => !isHiddenRuntimeSchema(group.schema),
      ),
    [groupExplorerTables, wasmTables],
  );

  const groupedRemoteTables = useMemo(
    () =>
      groupExplorerTables(remoteTables).filter(
        (group) => !isHiddenRuntimeSchema(group.schema),
      ),
    [groupExplorerTables, remoteTables],
  );

  const remoteLabel =
    sqlBackend === "bridge"
      ? remoteConnectionInfo
        ? `Bridge (${remoteConnectionInfo.host})`
        : "Bridge"
      : remoteConnectionInfo
        ? `DuckDB HTTP (${remoteConnectionInfo.host}:${remoteConnectionInfo.port})`
        : "DuckDB HTTP";
  const activeRuntimeExplorer = useMemo(
    () =>
      resolveActiveRuntimeExplorer({
        sqlBackend,
        groupedRemoteTables,
        groupedWasmTables,
      }),
    [groupedRemoteTables, groupedWasmTables, sqlBackend],
  );

  const databaseRowClass =
    "flex items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 text-[13px] text-card-foreground font-mono transition-colors";
  const databaseRowInteractiveClass =
    mode === "sidebar" ? "hover:border-sidebar-border/70" : "";

  const handleSelectWasm = () => {
    onSelect(DEFAULT_WASM_DB_IDENTIFIER);
    if (mode === "popover") {
      setIsOpen(false);
    }
  };

  const renderExplorerTableGroups = (
    groups: ExplorerTableGroup[],
    options: {
      currentCatalog?: string | null;
      palette: string[];
      onTableClick: (
        group: ExplorerTableGroup,
        payload: ExplorerInsertPayload,
      ) => void;
    },
  ) =>
    groups
      .filter(
        (group) =>
          !isHiddenRuntimeSchema(group.schema) &&
          !isHiddenRuntimeSchema(group.catalog),
      )
      .map((group, groupIdx) => (
        <div
          key={`${group.catalog || "default"}.${group.schema}`}
          className="space-y-0"
        >
          {!isDefaultExplorerSchema(group.schema) && (
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {group.schema}
            </p>
          )}
          {group.tables.map((tableName, tableIdx) => {
            const color =
              options.palette[(groupIdx + tableIdx) % options.palette.length];
            const payload = buildExplorerInsertPayload({
              catalog: group.catalog,
              currentCatalog: options.currentCatalog,
              schema: group.schema,
              table: tableName,
              source: "runtime",
            });
            const displayReference = getExplorerTableDisplayLabel({
              catalog: group.catalog,
              schema: group.schema,
              table: tableName,
            });

            return (
              <button
                key={`${group.catalog}.${group.schema}.${tableName}`}
                type="button"
                className="hover:text-sidebar-foreground cursor-pointer transition-colors flex items-center gap-2 w-full text-left"
                onClick={() => options.onTableClick(group, payload)}
                title={displayReference}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", color)} />
                <span className="truncate">{displayReference}</span>
              </button>
            );
          })}
        </div>
      ));

  const renderQuerySection = (params: {
    title: string;
    emptyMessage: string;
    queries: Array<{ id: string; name: string }>;
    onSelect?: (id: string) => void;
    onRename?: (id: string) => void;
    onDelete?: (id: string) => void;
  }) => {
    const { emptyMessage, onDelete, onRename, onSelect, queries, title } =
      params;

    return (
      <div className="flex max-h-56 flex-col gap-2 p-2">
        <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-[#5C6658]">
          {title}
        </p>
        <div className="min-h-0 overflow-y-auto">
          {queries.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            <div className="space-y-1">
              {queries.map((query) => (
                <div
                  key={query.id}
                  className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-sidebar-accent/40"
                >
                  <button
                    type="button"
                    className="flex-1 truncate text-left text-xs font-mono text-sidebar-foreground"
                    onClick={() => onSelect?.(query.id)}
                    title={query.name}
                  >
                    {query.name}
                  </button>
                  {onDelete || onRename ? (
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {onRename ? (
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          aria-label={`Rename ${title.toLowerCase()} ${query.name}`}
                          onClick={() => onRename(query.id)}
                        >
                          <PencilSquareIcon className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          aria-label={`Delete ${title.toLowerCase()} ${query.name}`}
                          onClick={() => onDelete(query.id)}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStoredSqlQueries = () => {
    if (!showStoredSqlQueries) {
      return null;
    }

    return (
      <>
        {renderQuerySection({
          title: "Draft Queries",
          emptyMessage: "No draft queries yet.",
          queries: draftSqlQueries,
          onSelect: onSelectDraftSqlQuery,
          onRename: onRenameDraftSqlQuery,
          onDelete: onDeleteDraftSqlQuery,
        })}
        <Separator />
        {renderQuerySection({
          title: "Saved Queries",
          emptyMessage: "No saved queries yet.",
          queries: storedSqlQueries,
          onSelect: onSelectStoredSqlQuery,
          onRename: onRenameStoredSqlQuery,
          onDelete: onDeleteStoredSqlQuery,
        })}
      </>
    );
  };

  const renderSampleDataAction = (
    target: "remote" | "wasm",
    emptyMessage: string,
  ) => {
    const state = getSampleDataActionState({
      hasTables: false,
      isLoading: sampleDataLoadingTarget === target,
      error: sampleDataErrors[target],
    });

    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={state?.isLoading}
          onClick={() => void handleAddSampleData(target)}
        >
          {state?.isLoading ? "Adding sample data..." : "Add sample data"}
        </Button>
        {state?.error ? (
          <p className="text-xs text-destructive">{state.error}</p>
        ) : null}
      </div>
    );
  };

  const renderDatabaseList = () => {
    const activeGroups = activeRuntimeExplorer.groups;
    const hasRuntimeTables = activeGroups.length > 0;
    const isWasmSelected = !selectedDb || isWasmLocalIdentifier(selectedDb);

    return (
      <div className="flex flex-col gap-2">
        {activeRuntimeExplorer.target === "remote" ? (
          <div className="space-y-1">
            <div
              className={cn(
                databaseRowClass,
                "text-muted-foreground",
                databaseRowInteractiveClass,
              )}
            >
              <Database className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span className="truncate">{remoteLabel}</span>
            </div>
            <div className="pl-8 text-xs text-slate-500 space-y-2 mt-2 font-mono">
              {isLoadingRemoteTables ? (
                <p className="text-xs text-muted-foreground">
                  Loading tables...
                </p>
              ) : remoteTablesError ? (
                <p className="text-xs text-destructive">{remoteTablesError}</p>
              ) : hasRuntimeTables ? (
                renderExplorerTableGroups(activeGroups, {
                  currentCatalog: remoteCurrentCatalog,
                  palette: ["bg-emerald-400", "bg-teal-400", "bg-cyan-400"],
                  onTableClick: (_group, payload) => {
                    onInsertTable?.(payload);
                    if (mode === "popover") {
                      setIsOpen(false);
                    }
                  },
                })
              ) : (
                renderSampleDataAction("remote", "No tables found.")
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div
              className={cn(
                databaseRowClass,
                isWasmSelected &&
                  "border-sidebar-ring ring-1 ring-sidebar-ring/40",
                databaseRowInteractiveClass,
              )}
            >
              <button
                type="button"
                className="flex items-center gap-2 flex-1 text-left cursor-pointer"
                onClick={handleSelectWasm}
              >
                <Database className="h-3.5 w-3.5 shrink-0 text-[#A8BCA1]" />
                <span className="truncate">DuckDB WASM (local)</span>
              </button>
            </div>
            <div className="pl-8 text-xs text-slate-500 space-y-2 mt-2 font-mono">
              {isLoadingWasmTables ? (
                <p className="text-xs text-muted-foreground">
                  Loading tables...
                </p>
              ) : wasmTablesError ? (
                <p className="text-xs text-destructive">
                  Failed to load local tables.
                </p>
              ) : hasRuntimeTables ? (
                renderExplorerTableGroups(activeGroups, {
                  currentCatalog: wasmCurrentCatalog,
                  palette: ["bg-blue-400", "bg-purple-400", "bg-amber-400"],
                  onTableClick: (_group, payload) => {
                    onInsertTable?.(payload);
                    if (mode === "popover") {
                      setIsOpen(false);
                    }
                  },
                })
              ) : (
                renderSampleDataAction("wasm", "No local tables yet.")
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Sidebar mode: render directly without hover card
  if (mode === "sidebar") {
    if (collapsed) {
      if (collapsedBehavior === "overlay") {
        return (
          <div
            className={cn(
              "absolute left-4 top-4 z-20 transition-all duration-200 ease-out",
              className,
              "bg-transparent",
            )}
          >
            {canToggleCollapse ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="rounded-lg bg-background/90 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80"
                    onClick={onToggleCollapse}
                    aria-label={getExplorerToggleLabel(true)}
                  >
                    <PanelLeft />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {getExplorerToggleLabel(true)}
                  {toggleShortcutLabel ? (
                    <kbd className="ml-1 rounded border border-border/40 bg-background/20 px-1 py-0.5 font-mono text-[10px]">
                      {toggleShortcutLabel}
                    </kbd>
                  ) : null}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        );
      }

      return (
        <div
          className={cn(
            "flex h-full w-11 flex-col items-center border-r border-border bg-background p-2 transition-all duration-200 ease-out",
            className,
          )}
        >
          {canToggleCollapse ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground mt-2"
                  onClick={onToggleCollapse}
                  aria-label={getExplorerToggleLabel(true)}
                >
                  <PanelLeft />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {getExplorerToggleLabel(true)}
                {toggleShortcutLabel ? (
                  <kbd className="ml-1 rounded border border-border/40 bg-background/20 px-1 py-0.5 font-mono text-[10px]">
                    {toggleShortcutLabel}
                  </kbd>
                ) : null}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      );
    }

    return (
      <div
        className={cn(
          "flex h-full w-64 flex-col border-r border-border transition-all duration-200 ease-out",
          className,
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-4">
          <span className="text-xs font-bold tracking-widest text-[#5C6658] uppercase">
            Explorer
          </span>
          {canToggleCollapse ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  onClick={onToggleCollapse}
                  aria-label={getExplorerToggleLabel(false)}
                >
                  <PanelLeft />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {getExplorerToggleLabel(false)}
                {toggleShortcutLabel ? (
                  <kbd className="ml-1 rounded border border-border/40 bg-background/20 px-1 py-0.5 font-mono text-[10px]">
                    {toggleShortcutLabel}
                  </kbd>
                ) : null}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {renderDatabaseList()}
          </div>
          {showStoredSqlQueries ? (
            <div className="border-t border-border">
              {renderStoredSqlQueries()}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // Popover mode: existing hover card behavior
  if (activeRuntimeExplorer.groups.length === 0) {
    return (
      <PromptInputHoverCard open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PromptInputHoverCardTrigger asChild>
              <Button variant="ghost" className={cn("h-10", className)}>
                <Database className="h-4 w-4 shrink-0" />
              </Button>
            </PromptInputHoverCardTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Queryable tables</p>
          </TooltipContent>
        </Tooltip>
        <PromptInputHoverCardContent className="w-72">
          {renderDatabaseList()}
          {showStoredSqlQueries && <Separator />}
          {renderStoredSqlQueries()}
        </PromptInputHoverCardContent>
      </PromptInputHoverCard>
    );
  }

  return (
    <PromptInputHoverCard open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PromptInputHoverCardTrigger asChild>
            <Button variant="outline" className={cn("h-10", className)}>
              <Database className="h-4 w-4 shrink-0" />
            </Button>
          </PromptInputHoverCardTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Queryable tables</p>
        </TooltipContent>
      </Tooltip>
      <PromptInputHoverCardContent className="w-72 max-h-[400px] overflow-y-auto">
        {renderDatabaseList()}
        {showStoredSqlQueries && <Separator />}
        {renderStoredSqlQueries()}
      </PromptInputHoverCardContent>
    </PromptInputHoverCard>
  );
}
