"use client";

import { useState } from "react";
import { ConnectDataDialog } from "@/components/connect-data-dialog";
import DataModelEditor from "@/components/data-model-editor";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import type { ConnectedTable } from "@/lib/connected-tables";

export default function ViewDataPage() {
  const tables = useConnectedTables();
  const hasTables = tables.length > 0;
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    new Set(),
  );
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [prefillDbType, setPrefillDbType] = useState<
    "duckdb" | "postgres" | "mysql" | null
  >(null);
  const [prefillDbPath, setPrefillDbPath] = useState("");
  const connectedDatabasePaths = Array.from(
    new Set(tables.map((t) => t.databasePath)),
  ).map((dbPath) => {
    return {
      dbPath,
      type: tables.find((t) => t.databasePath === dbPath)?.type,
    };
  });

  const toggleExpanded = (entryKey: string) => {
    setExpandedEntries((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(entryKey)) {
        newSet.delete(entryKey);
      } else {
        newSet.add(entryKey);
      }
      return newSet;
    });
  };

  const getEntryKey = (table: ConnectedTable) => {
    return `${table.type}-${table.databasePath}-${table.schema ?? table.table ?? "unknown"}`;
  };

  const hasMultipleTables = (table: ConnectedTable) => {
    return (
      table.tables && Array.isArray(table.tables) && table.tables.length > 0
    );
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-8 overflow-y-auto px-6 py-10">
      <header className="flex flex-row items-center justify-between space-y-3">
        <div className="">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Data Sources
          </span>
          <h1 className="text-3xl font-semibold text-foreground">
            Connected Data
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Review the schemas or tables you have connected locally. These
            entries are stored in your browser&apos;s local storage and only
            visible to you.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setPrefillDbType(null);
            setPrefillDbPath("");
            setIsConnectDialogOpen(true);
          }}
        >
          Connect Data Source
        </Button>
      </header>
      <Separator />

      <Tabs defaultValue="sources" className="flex-1">
        <TabsList>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="model">Data Model</TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="mt-4">
          {!hasTables ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-border/60 bg-muted/30 p-10 text-center">
              <div className="space-y-2">
                <h2 className="text-lg font-medium text-foreground">
                  No connected data yet
                </h2>
                <p className="text-sm text-muted-foreground">
                  Connect to a DuckDB database and add schemas using the
                  sidebar&apos;s Connect Data action.
                </p>
              </div>
              <Button asChild>
                <button
                  type="button"
                  onClick={() => setIsConnectDialogOpen(true)}
                >
                  Connect Data Source
                </button>
              </Button>
            </div>
          ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 my-8">
                  <h3 className="text-sm font-semibold text-foreground">
                    Connected Databases
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {connectedDatabasePaths.map((db) => (
                      <Button
                        key={db.dbPath}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 bg-card/60 p-4 rounded-xl h-24 border border-border group flex-col justify-center"
                        onClick={() => {
                          const t =
                            db.type === "duckdb" ||
                              db.type === "postgres" ||
                              db.type === "mysql"
                              ? db.type
                              : null;
                          setPrefillDbType(t);
                          setPrefillDbPath(db.dbPath);
                          setIsConnectDialogOpen(true);
                        }}
                      >
                        <span className="text-xs font-medium text-muted-foreground group-hover:hidden">
                          {db.dbPath}
                        </span>
                        {/* type */}
                        <span className="text-xs font-semibold text-muted-foreground group-hover:hidden">
                          {db.type}
                        </span>
                        {/* connect */}
                        <span className="text-xs font-medium text-muted-foreground hidden group-hover:block group-hover:bg-accent w-full">
                          Add Tables
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-foreground my-8">
                    Tables
                  </h3>
                  <ul className="grid gap-4 md:grid-cols-2">
                    {tables.map((table) => {
                      const entryKey = getEntryKey(table);
                      const isExpanded = expandedEntries.has(entryKey);
                      const hasMultiple = hasMultipleTables(table);

                      return (
                        <li
                          key={entryKey}
                          className="group flex h-full flex-col justify-between rounded-2xl border border-border bg-card/60 p-5 shadow-sm transition hover:border-primary hover:shadow-md"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                {table.type.toUpperCase()}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {table.databasePath}
                              </span>
                            </div>
                            <h3 className="text-lg font-semibold text-foreground">
                              {table.schema ?? table.table ?? "Unknown"}
                            </h3>
                            {table.description ? (
                              <p className="text-sm text-muted-foreground line-clamp-3">
                                {table.description}
                              </p>
                            ) : (
                              <p className="text-sm italic text-muted-foreground/80">
                                No description provided.
                              </p>
                            )}

                            {hasMultiple && isExpanded && (
                              <div className="mt-3 space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">
                                  Tables:
                                </p>
                                <ul className="space-y-1">
                                  {table.tables?.map((tableName) => (
                                    <li
                                      key={tableName}
                                      className="text-xs text-muted-foreground"
                                    >
                                      • {tableName}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 flex items-center justify-between">
                            {hasMultiple && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleExpanded(entryKey)}
                                className="text-xs"
                              >
                                {isExpanded
                                  ? "Hide Tables"
                                  : `Show Tables (${table.tables?.length})`}
                              </Button>
                            )}
                            <Button variant="outline" size="sm">
                              Copy Connection Info
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
          )}
        </TabsContent>

        <TabsContent value="model" className="mt-4">
          <DataModelEditor />
        </TabsContent>
      </Tabs>

      <ConnectDataDialog
        open={isConnectDialogOpen}
        onOpenChange={setIsConnectDialogOpen}
        initialSelectedDatabase={prefillDbType}
        initialDatabasePath={prefillDbPath}
      />
    </div>
  );
}
