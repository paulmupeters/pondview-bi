import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Database } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { useConnectedTables } from "@/hooks/use-connected-tables";
import { useDuckdbHttpTables } from "@/hooks/use-duckdb-http-tables";
import { useWasmTables } from "@/hooks/use-wasm-tables";
import type { ConnectedTable } from "@/lib/connected-tables";
import { resolveAttachmentAlias } from "@/lib/duckdb/duckdb-attachments";
import {
  buildExplorerInsertPayload,
  buildExplorerTableReference,
  type ExplorerInsertPayload,
  isDefaultExplorerSchema,
} from "@/lib/duckdb/table-reference";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  isWasmLocalIdentifier,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import { cn } from "@/lib/utils";
import type { SavedSqlQuery } from "@/lib/workspace/saved-sql-queries-repo";
import { Separator } from "./ui/separator";

type ExplorerTableGroup = {
  catalog: string;
  schema: string;
  tables: string[];
};

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

interface ConnectedDataPanelProps {
  selectedDb?: string;
  onSelect: (dbIdentifier: string) => void;
  className?: string;
  onInsertTable?: (payload: ExplorerInsertPayload) => void;
  mode?: "popover" | "sidebar";
  collapsed?: boolean;
  collapsedBehavior?: "inline" | "overlay";
  onToggleCollapse?: () => void;
  refreshToken?: number;
  sqlBackend?: SqlBackend;
  storedSqlQueries?: SavedSqlQuery[];
  onSelectStoredSqlQuery?: (queryId: string) => void;
  onDeleteStoredSqlQuery?: (queryId: string) => void;
  onRenameStoredSqlQuery?: (queryId: string) => void;
  showStoredSqlQueries?: boolean;
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
  refreshToken,
  sqlBackend = "duckdb-wasm",
  storedSqlQueries = [],
  onSelectStoredSqlQuery,
  onDeleteStoredSqlQuery,
  onRenameStoredSqlQuery,
  showStoredSqlQueries = false,
}: ConnectedDataPanelProps) {
  const connectedTables = useConnectedTables();
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
  } = useDuckdbHttpTables(sqlBackend, refreshToken);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (refreshToken === undefined) {
      return;
    }
    void refreshWasmTables();
  }, [refreshToken, refreshWasmTables]);

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
    () => groupExplorerTables(wasmTables),
    [groupExplorerTables, wasmTables],
  );

  const groupedRemoteTables = useMemo(
    () => groupExplorerTables(remoteTables),
    [groupExplorerTables, remoteTables],
  );

  const isRemoteBackend =
    sqlBackend === "bridge" || sqlBackend === "duckdb-http";
  const remoteLabel =
    sqlBackend === "bridge"
      ? remoteConnectionInfo
        ? `Bridge (${remoteConnectionInfo.host})`
        : "Bridge"
      : remoteConnectionInfo
        ? `DuckDB HTTP (${remoteConnectionInfo.host}:${remoteConnectionInfo.port})`
        : "DuckDB HTTP";

  const getDbIdentifier = (entry: (typeof connectedTables)[0]): string => {
    // Prefer connectionId (new) over databasePath (legacy) for identification
    // databasePath may be absent when credentials are stored server-side
    return entry.connectionId ?? entry.databasePath ?? entry.attachAs ?? "";
  };

  const getDbKey = (entry: (typeof connectedTables)[0]): string => {
    const dbId =
      entry.connectionId ?? entry.databasePath ?? entry.attachAs ?? "";
    return `${entry.type}-${dbId}-${entry.schema || entry.table || ""}`;
  };

  const handleInsertTable = (
    entry: (typeof connectedTables)[0],
    tableName: string,
  ) => {
    const dbIdentifier = getDbIdentifier(entry);
    const catalog = getConnectedEntryCatalog(entry);
    const payload = buildExplorerInsertPayload({
      catalog,
      schema: entry.schema,
      table: tableName,
      source: "connected-entry",
      dbIdentifier,
    });
    onSelect(dbIdentifier);
    onInsertTable?.(payload);
    if (mode === "popover") {
      setIsOpen(false);
    }
  };

  const handleSelect = (dbIdentifier: string) => {
    onSelect(dbIdentifier);
    if (mode === "popover") {
      setIsOpen(false);
    }
  };

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
    groups.map((group, groupIdx) => (
      <div
        key={`${group.catalog || "default"}.${group.schema}`}
        className="space-y-1"
      >
        {group.catalog && (
          <p className="text-[10px] uppercase tracking-wide text-foreground/70">
            {group.catalog}
            {options.currentCatalog &&
            group.catalog.toLowerCase() === options.currentCatalog.toLowerCase()
              ? " · current"
              : ""}
          </p>
        )}
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
          const displayReference = buildExplorerTableReference({
            catalog: group.catalog,
            schema: group.schema,
            table: tableName,
            includeCatalog: Boolean(group.catalog),
            includeDefaultSchema: true,
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
              <span className="truncate">{tableName}</span>
            </button>
          );
        })}
      </div>
    ));

  const renderStoredSqlQueries = () => {
    if (!showStoredSqlQueries) {
      return null;
    }

    return (
      <div className="flex max-h-56 flex-col gap-2 p-2">
        <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-[#5C6658]">
          Stored SQL Queries
        </p>
        <div className="min-h-0 overflow-y-auto">
          {storedSqlQueries.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              No stored queries yet.
            </p>
          ) : (
            <div className="space-y-1">
              {storedSqlQueries.map((query) => (
                <div
                  key={query.id}
                  className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-sidebar-accent/40"
                >
                  <button
                    type="button"
                    className="flex-1 truncate text-left text-xs font-mono text-sidebar-foreground"
                    onClick={() => onSelectStoredSqlQuery?.(query.id)}
                    title={query.name}
                  >
                    {query.name}
                  </button>
                  {onDeleteStoredSqlQuery || onRenameStoredSqlQuery ? (
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {onRenameStoredSqlQuery ? (
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          aria-label={`Rename stored query ${query.name}`}
                          onClick={() => onRenameStoredSqlQuery(query.id)}
                        >
                          <PencilSquareIcon className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {onDeleteStoredSqlQuery ? (
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          aria-label={`Delete stored query ${query.name}`}
                          onClick={() => onDeleteStoredSqlQuery(query.id)}
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

  const renderDatabaseList = () => {
    const hasConnectedTables = connectedTables.length > 0;
    const hasWasmTables = groupedWasmTables.length > 0;
    const isWasmSelected = !selectedDb || isWasmLocalIdentifier(selectedDb);

    return (
      <div className="flex flex-col gap-2">
        {/* Remote backend section (bridge / duckdb-http) */}
        {isRemoteBackend && (
          <div className="space-y-1">
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 bg-card border border-sidebar-border shadow-sm rounded text-sm text-card-foreground font-mono transition-colors",
                mode === "sidebar" && "hover:bg-sidebar-accent/50",
              )}
            >
              <Database className="h-4 w-4 shrink-0 text-emerald-500" />
              <span className="truncate">{remoteLabel}</span>
            </div>
            <div className="pl-8 text-xs text-slate-500 space-y-2 mt-2 font-mono">
              {isLoadingRemoteTables ? (
                <p className="text-xs text-muted-foreground">
                  Loading tables...
                </p>
              ) : remoteTablesError ? (
                <p className="text-xs text-destructive">{remoteTablesError}</p>
              ) : groupedRemoteTables.length > 0 ? (
                renderExplorerTableGroups(groupedRemoteTables, {
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
                <p className="text-xs text-muted-foreground">
                  No tables found.
                </p>
              )}
            </div>
          </div>
        )}

        {isRemoteBackend && <Separator />}

        <div className="space-y-1">
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2 bg-card border border-sidebar-border shadow-sm rounded text-sm text-card-foreground font-mono transition-colors",
              isWasmSelected &&
                "ring-1 ring-sidebar-ring ring-offset-1 bg-card",
              mode === "sidebar" && "hover:bg-sidebar-accent/50",
            )}
          >
            <button
              type="button"
              className="flex items-center gap-2 flex-1 text-left cursor-pointer"
              onClick={handleSelectWasm}
            >
              <Database className="h-4 w-4 shrink-0 text-[#A8BCA1]" />
              <span className="truncate">DuckDB WASM (local)</span>
            </button>
          </div>
          <div className="pl-8 text-xs text-slate-500 space-y-2 mt-2 font-mono">
            {isLoadingWasmTables ? (
              <p className="text-xs text-muted-foreground">Loading tables...</p>
            ) : wasmTablesError ? (
              <p className="text-xs text-destructive">
                Failed to load local tables.
              </p>
            ) : hasWasmTables ? (
              renderExplorerTableGroups(groupedWasmTables, {
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
              <p className="text-xs text-muted-foreground">
                No local tables yet.
              </p>
            )}
          </div>
        </div>

        {/* Connected Tables Section */}
        {hasConnectedTables && <Separator />}
        {hasConnectedTables &&
          connectedTables.map((entry) => {
            const dbKey = getDbKey(entry);
            const dbIdentifier = getDbIdentifier(entry);
            const dbDisplayName = getConnectedEntryDisplayName(entry);
            const catalog = getConnectedEntryCatalog(entry);
            // Check both databasePath and attachAs for backward compatibility
            const isSelected =
              selectedDb === dbIdentifier || selectedDb === entry.attachAs;
            const hasTables =
              (entry.tables && entry.tables.length > 0) || entry.table;

            return (
              <div key={dbKey} className="space-y-1">
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 bg-card border border-sidebar-border shadow-sm rounded text-sm text-card-foreground font-mono transition-colors",
                    isSelected &&
                      "ring-1 ring-sidebar-ring ring-offset-1 bg-card",
                    mode === "sidebar" && "hover:bg-sidebar-accent/50",
                  )}
                >
                  <button
                    type="button"
                    className="flex items-center gap-2 flex-1 text-left cursor-pointer"
                    onClick={() => handleSelect(dbIdentifier)}
                  >
                    <Database className="h-4 w-4 shrink-0 text-[#A8BCA1]" />
                    <span className="truncate">{dbDisplayName}</span>
                  </button>
                </div>
                {hasTables && (
                  <div className="pl-8 text-xs text-slate-500 space-y-2 mt-2 font-mono">
                    {entry.tables && entry.tables.length > 0
                      ? entry.tables.map((tableName, idx) => {
                          const colors = [
                            "bg-blue-400",
                            "bg-purple-400",
                            "bg-amber-400",
                          ];
                          const color = colors[idx % colors.length];
                          return (
                            <button
                              key={tableName}
                              type="button"
                              className="hover:text-sidebar-foreground cursor-pointer transition-colors flex items-center gap-2 w-full text-left"
                              onClick={() =>
                                handleInsertTable(entry, tableName)
                              }
                              title={buildExplorerTableReference({
                                catalog,
                                schema: entry.schema,
                                table: tableName,
                                includeCatalog: entry.type !== "duckdb",
                                includeDefaultSchema: true,
                              })}
                            >
                              <span
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  color,
                                )}
                              ></span>
                              <span className="truncate">{tableName}</span>
                            </button>
                          );
                        })
                      : entry.table && (
                          <button
                            type="button"
                            className="hover:text-sidebar-foreground cursor-pointer transition-colors flex items-center gap-2 w-full text-left"
                            onClick={() =>
                              handleInsertTable(entry, entry.table as string)
                            }
                            title={buildExplorerTableReference({
                              catalog,
                              schema: entry.schema,
                              table: entry.table as string,
                              includeCatalog: entry.type !== "duckdb",
                              includeDefaultSchema: true,
                            })}
                          >
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                            <span className="truncate">{entry.table}</span>
                          </button>
                        )}
                  </div>
                )}
              </div>
            );
          })}
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
              "absolute left-0 top-4 z-20 -translate-x-1/2 transition-all duration-200 ease-out",
              className,
              "bg-transparent",
            )}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full! border-border dark:bg-accent/80 bg-accent shadow-lg ring-1 ring-black/5 dark:ring-white/10 gap-1"
              onClick={onToggleCollapse}
              aria-label="Expand explorer"
            >
              <Database className="size-4 shrink-0" />
              <ChevronRightIcon className="size-2.5 shrink-0" />
            </Button>
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 gap-0.5"
            onClick={onToggleCollapse}
            aria-label="Expand explorer"
          >
            <Database className="h-4 w-4" />
            <ChevronRightIcon className="h-2 w-2 shrink-0" />
          </Button>
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
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 p-4">
          <span className="text-xs font-bold tracking-widest text-[#5C6658] uppercase">
            Explorer
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onToggleCollapse}
            aria-label="Collapse explorer"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
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
  if (connectedTables.length === 0 && wasmTables.length === 0) {
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
            <p>Connected databases</p>
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
          <p>Connected databases</p>
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
