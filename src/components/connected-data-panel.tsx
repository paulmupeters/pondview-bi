import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
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
import { useMaterializedTables } from "@/hooks/use-materialized-tables";
import { useWasmTables } from "@/hooks/use-wasm-tables";
import {
  isMaterializedTableIdentifier,
  MATERIALIZED_SCHEMA,
} from "@/lib/duckdb/materialized-tables";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  isWasmLocalIdentifier,
} from "@/lib/sql/sql-runtime";
import { cn } from "@/lib/utils";
import { Separator } from "./ui/separator";

interface ConnectedDataPanelProps {
  selectedDb?: string;
  onSelect: (dbIdentifier: string) => void;
  className?: string;
  onInsertTable?: (tableName: string) => void;
  mode?: "popover" | "sidebar";
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  refreshToken?: number;
}

export function ConnectedDataPanel({
  selectedDb,
  onSelect,
  className,
  onInsertTable,
  mode = "popover",
  collapsed = false,
  onToggleCollapse,
  refreshToken,
}: ConnectedDataPanelProps) {
  const connectedTables = useConnectedTables();
  const { tables: materializedTables } = useMaterializedTables();
  const {
    tables: wasmTables,
    isLoading: isLoadingWasmTables,
    error: wasmTablesError,
    refresh: refreshWasmTables,
  } = useWasmTables();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (refreshToken === undefined) {
      return;
    }
    void refreshWasmTables();
  }, [refreshToken, refreshWasmTables]);

  const groupedWasmTables = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const table of wasmTables) {
      const schema = table.schema || "main";
      const existing = grouped.get(schema);
      if (existing) {
        existing.push(table.name);
      } else {
        grouped.set(schema, [table.name]);
      }
    }

    return Array.from(grouped.entries())
      .map(([schema, tables]) => ({
        schema,
        tables: Array.from(new Set(tables)).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.schema.localeCompare(b.schema));
  }, [wasmTables]);

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

  const getDbDisplayName = (entry: (typeof connectedTables)[0]): string => {
    const parts: string[] = [];
    if (entry.schema) parts.push(entry.schema);
    if (entry.table) parts.push(entry.table);
    if (parts.length === 0) {
      parts.push(
        entry.attachAs ?? entry.connectionId ?? entry.databasePath ?? "unknown",
      );
    }
    return `${parts.join(".")} (${entry.type})`;
  };

  const handleInsertTable = (
    entry: (typeof connectedTables)[0],
    tableName: string,
  ) => {
    const schemaPrefix = entry.schema;
    const qualifiedName = schemaPrefix
      ? `${schemaPrefix}.${tableName}`
      : tableName;
    onInsertTable?.(qualifiedName);
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

  const handleInsertMaterializedTable = (tableName: string) => {
    const qualifiedName = `${MATERIALIZED_SCHEMA}.${tableName}`;
    onInsertTable?.(qualifiedName);
    if (mode === "popover") {
      setIsOpen(false);
    }
  };

  const handleSelectMaterialized = () => {
    // Select the materialized schema - use a generic identifier
    // The actual table selection happens via onInsertTable
    const identifier = `materialized:${MATERIALIZED_SCHEMA}`;
    onSelect(identifier);
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

  const handleInsertWasmTable = (schema: string, tableName: string) => {
    const qualifiedName =
      schema.toLowerCase() === "main" ? tableName : `${schema}.${tableName}`;
    onInsertTable?.(qualifiedName);
    if (mode === "popover") {
      setIsOpen(false);
    }
  };

  const renderDatabaseList = () => {
    const hasConnectedTables = connectedTables.length > 0;
    const hasMaterializedTables = materializedTables.length > 0;
    const hasWasmTables = groupedWasmTables.length > 0;
    const isWasmSelected = !selectedDb || isWasmLocalIdentifier(selectedDb);

    return (
      <div className="flex flex-col gap-2">
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
              groupedWasmTables.map((group, groupIdx) => (
                <div key={group.schema} className="space-y-1">
                  {group.schema.toLowerCase() !== "main" && (
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {group.schema}
                    </p>
                  )}
                  {group.tables.map((tableName, tableIdx) => {
                    const colors = [
                      "bg-blue-400",
                      "bg-purple-400",
                      "bg-amber-400",
                    ];
                    const color = colors[(groupIdx + tableIdx) % colors.length];
                    return (
                      <button
                        key={`${group.schema}.${tableName}`}
                        type="button"
                        className="hover:text-sidebar-foreground cursor-pointer transition-colors flex items-center gap-2 w-full text-left"
                        onClick={() =>
                          handleInsertWasmTable(group.schema, tableName)
                        }
                      >
                        <span
                          className={cn("w-1.5 h-1.5 rounded-full", color)}
                        ></span>
                        <span className="truncate">{tableName}</span>
                      </button>
                    );
                  })}
                </div>
              ))
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
            const dbDisplayName = getDbDisplayName(entry);
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
        {/* Materialized Tables Section */}
        {hasMaterializedTables && (
          <>
            <Separator />
            <div className="space-y-1 mt-2">
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 bg-card border border-sidebar-border shadow-sm rounded text-sm text-card-foreground font-mono transition-colors",
                  selectedDb &&
                    isMaterializedTableIdentifier(selectedDb) &&
                    "ring-1 ring-sidebar-ring ring-offset-1 bg-card",
                  mode === "sidebar" && "hover:bg-sidebar-accent/50",
                )}
              >
                <button
                  type="button"
                  className="flex items-center gap-2 flex-1 text-left cursor-pointer"
                  onClick={handleSelectMaterialized}
                >
                  <Database className="h-4 w-4 shrink-0 text-sidebar-primary" />
                  <span className="truncate">
                    Materialized ({materializedTables.length})
                  </span>
                </button>
              </div>

              <div className="pl-8 text-xs text-slate-500 space-y-2 mt-2 font-mono">
                {materializedTables.map((tableName, idx) => {
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
                      onClick={() => handleInsertMaterializedTable(tableName)}
                    >
                      <span
                        className={cn("w-1.5 h-1.5 rounded-full", color)}
                      ></span>
                      <span className="truncate">{tableName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // Sidebar mode: render directly without hover card
  if (mode === "sidebar") {
    if (collapsed) {
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
        <div className="flex-1 overflow-y-auto min-h-0 p-2">
          {renderDatabaseList()}
        </div>
      </div>
    );
  }

  // Popover mode: existing hover card behavior
  if (
    connectedTables.length === 0 &&
    materializedTables.length === 0 &&
    wasmTables.length === 0
  ) {
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
      </PromptInputHoverCardContent>
    </PromptInputHoverCard>
  );
}
