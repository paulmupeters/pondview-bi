"use client";

import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Database, Table } from "lucide-react";
import { useState } from "react";
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
import {
  isMaterializedTableIdentifier,
  MATERIALIZED_SCHEMA,
} from "@/lib/duckdb/materialized-tables";
import { cn } from "@/lib/utils";

interface ConnectedDataPanelProps {
  selectedDb?: string;
  onSelect: (dbIdentifier: string) => void;
  className?: string;
  onInsertTable?: (tableName: string) => void;
  mode?: "popover" | "sidebar";
}

export function ConnectedDataPanel({
  selectedDb,
  onSelect,
  className,
  onInsertTable,
  mode = "popover",
}: ConnectedDataPanelProps) {
  const connectedTables = useConnectedTables();
  const { tables: materializedTables } = useMaterializedTables();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [isMaterializedExpanded, setIsMaterializedExpanded] = useState(false);

  const toggleDb = (dbKey: string) => {
    setExpandedDbs((prev) => {
      const next = new Set(prev);
      if (next.has(dbKey)) {
        next.delete(dbKey);
      } else {
        next.add(dbKey);
      }
      return next;
    });
  };

  const getDbIdentifier = (entry: (typeof connectedTables)[0]): string => {
    // Use databasePath as the identifier for queries, not attachAs
    // attachAs is only for display and SQL table references
    return entry.databasePath;
  };

  const getDbKey = (entry: (typeof connectedTables)[0]): string => {
    return `${entry.type}-${entry.databasePath}-${entry.schema || entry.table || ""}`;
  };

  const getDbDisplayName = (entry: (typeof connectedTables)[0]): string => {
    const parts: string[] = [];
    if (entry.schema) parts.push(entry.schema);
    if (entry.table) parts.push(entry.table);
    if (parts.length === 0) {
      parts.push(entry.databasePath);
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

  const renderDatabaseList = () => {
    const hasConnectedTables = connectedTables.length > 0;
    const hasMaterializedTables = materializedTables.length > 0;

    if (!hasConnectedTables && !hasMaterializedTables) {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          No connected databases. Connect a database to get started.
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        {/* Connected Tables Section */}
        {hasConnectedTables &&
          connectedTables.map((entry) => {
            const dbKey = getDbKey(entry);
            const dbIdentifier = getDbIdentifier(entry);
            const dbDisplayName = getDbDisplayName(entry);
        // Check both databasePath and attachAs for backward compatibility
            const isSelected =
              selectedDb === dbIdentifier || selectedDb === entry.attachAs;
            const isExpanded = expandedDbs.has(dbKey);
            const hasTables =
              (entry.tables && entry.tables.length > 0) || entry.table;

            return (
              <div
                key={dbKey}
                className="border-b border-border last:border-b-0"
              >
                <div className="flex items-center">
                  {hasTables ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => toggleDb(dbKey)}
                    >
                      {isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                      )}
                    </Button>
                  ) : (
                    <div className="w-8" />
                  )}
                  <Button
                    variant="ghost"
                    className={cn(
                      "flex-1 justify-start gap-2 h-8 rounded-none hover:bg-muted hover:text-muted-foreground",
                      isSelected && "bg-muted text-muted-foreground",
                    )}
                    onClick={() => handleSelect(dbIdentifier)}
                  >
                    <Database className="h-4 w-4 shrink-0" />
                    <span className="text-xs truncate">{dbDisplayName}</span>
                  </Button>
                </div>
                {hasTables && isExpanded && (
                  <div className="pl-8 pb-1">
                    {entry.tables && entry.tables.length > 0
                      ? entry.tables.map((tableName) => (
                        <button
                          key={tableName}
                          type="button"
                          className="px-2 py-1 w-full text-left text-xs text-muted-foreground flex items-center gap-2 hover:bg-muted hover:text-muted-foreground cursor-pointer"
                          onClick={() => handleInsertTable(entry, tableName)}
                        >
                          <Table className="h-3 w-3 shrink-0" />
                          <span className="truncate">{tableName}</span>
                        </button>
                      ))
                      : entry.table && (
                        <button
                          type="button"
                          className="px-2 py-1 w-full text-left text-xs text-muted-foreground flex items-center gap-2 hover:bg-muted hover:text-muted-foreground cursor-pointer"
                          onClick={() =>
                            handleInsertTable(entry, entry.table as string)
                          }
                        >
                          <Table className="h-3 w-3 shrink-0" />
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
          <div className="border-b border-border">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-muted hover:text-muted-foreground"
                onClick={() =>
                  setIsMaterializedExpanded(!isMaterializedExpanded)
                }
              >
                {isMaterializedExpanded ? (
                  <ChevronDownIcon className="h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  "flex-1 justify-start gap-2 h-8 rounded-none hover:bg-muted hover:text-muted-foreground",
                  selectedDb &&
                  isMaterializedTableIdentifier(selectedDb) &&
                  "bg-muted text-muted-foreground",
                )}
                onClick={handleSelectMaterialized}
              >
                <Database className="h-4 w-4 shrink-0" />
                <span className="text-xs truncate">
                  Materialized ({materializedTables.length})
                </span>
              </Button>
            </div>
            {isMaterializedExpanded && (
              <div className="pl-8 pb-1">
                {materializedTables.map((tableName) => (
                  <button
                    key={tableName}
                    type="button"
                    className="px-2 py-1 w-full text-left text-xs text-muted-foreground flex items-center gap-2 hover:bg-muted hover:text-muted-foreground cursor-pointer"
                    onClick={() => handleInsertMaterializedTable(tableName)}
                  >
                    <Table className="h-3 w-3 shrink-0" />
                    <span className="truncate">{tableName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    );
  };

  // Sidebar mode: render directly without hover card
  if (mode === "sidebar") {
    return (
      <div
        className={cn(
          "bg-card flex flex-col h-full",
          className,
        )}
      >
        <div className="p-2 border-b border-border text-xs text-muted-foreground font-bold tracking-widest uppercase">Explorer</div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {renderDatabaseList()}
        </div>
      </div>
    );
  }

  // Popover mode: existing hover card behavior
  if (connectedTables.length === 0) {
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
