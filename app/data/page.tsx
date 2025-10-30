"use client";

import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ConnectDataDialog } from "@/components/connect-data-dialog";
import DataModelEditor from "@/components/data-model-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import type { ConnectedTable } from "@/lib/connected-tables";
import { useTheme } from "@/lib/theme-provider";

export default function ViewDataPage() {
  const tables = useConnectedTables();
  const { theme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const hasTables = tables.length > 0;
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(
    new Set(),
  );
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [prefillDbType, setPrefillDbType] = useState<
    "duckdb" | "postgres" | "mysql" | null
  >(null);
  const [prefillDbPath, setPrefillDbPath] = useState("");

  useEffect(() => {
    const updateDarkMode = () => {
      if (theme === "dark") {
        setIsDarkMode(true);
      } else if (theme === "light") {
        setIsDarkMode(false);
      } else {
        // system theme
        setIsDarkMode(
          window.matchMedia("(prefers-color-scheme: dark)").matches,
        );
      }
    };

    updateDarkMode();

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => updateDarkMode();
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);
  const databaseEntries = useMemo(() => {
    const grouped = new Map<
      string,
      { type: string; entries: ConnectedTable[] }
    >();

    for (const table of tables) {
      const existing = grouped.get(table.databasePath);
      if (existing) {
        existing.entries.push(table);
      } else {
        grouped.set(table.databasePath, {
          type: table.type,
          entries: [table],
        });
      }
    }

    return Array.from(grouped.entries())
      .map(([dbPath, data]) => {
        const totalTables = data.entries.reduce((count, entry) => {
          if (
            entry.tables &&
            Array.isArray(entry.tables) &&
            entry.tables.length > 0
          ) {
            return count + entry.tables.length;
          }

          return count + 1;
        }, 0);

        return {
          dbPath,
          type: data.type,
          entries: [...data.entries],
          totalTables,
        };
      })
      .sort((a, b) => a.dbPath.localeCompare(b.dbPath));
  }, [tables]);

  const toggleDatabase = (dbPath: string) => {
    setExpandedDatabases((prev) => {
      const next = new Set(prev);
      if (next.has(dbPath)) {
        next.delete(dbPath);
      } else {
        next.add(dbPath);
      }
      return next;
    });
  };

  const getEntryKey = (table: ConnectedTable) => {
    return `${table.type}-${table.databasePath}-${table.schema ?? table.table ?? "unknown"}`;
  };

  const getDatabaseLogo = (dbType: string): string | null => {
    if (dbType === "duckdb") {
      return isDarkMode
        ? "/DuckDB_icon-darkmode.svg"
        : "/DuckDB_icon-lightmode.svg";
    }
    if (dbType === "postgres") {
      return "/Postgresql_elephant.png";
    }
    return null;
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
          <TabsTrigger value="datasets">Datasets</TabsTrigger>
          <TabsTrigger value="model">Data model</TabsTrigger>
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
            <div className="space-y-6">
              <div className="grid gap-4">
                {databaseEntries.map((database) => {
                  const normalizedType = database.type
                    ? database.type.toUpperCase()
                    : "UNKNOWN";
                  const isExpanded = expandedDatabases.has(database.dbPath);

                  return (
                    <Card
                      key={database.dbPath}
                      className="gap-0 rounded-2xl border border-border/60 bg-card/60 py-0 shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => toggleDatabase(database.dbPath)}
                        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3">
                            {(() => {
                              const logoPath = getDatabaseLogo(database.type);
                              return logoPath ? (
                                <Image
                                  src={logoPath}
                                  alt={normalizedType}
                                  width={24}
                                  height={24}
                                  className="shrink-0"
                                />
                              ) : (
                                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                    {normalizedType}
                                  </span>
                              );
                            })()}
                            <span className="truncate text-sm font-semibold text-foreground">
                              {database.dbPath}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {database.totalTables}{" "}
                            {database.totalTables === 1 ? "table" : "tables"}{" "}
                            saved
                          </span>
                        </div>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </button>
                      {isExpanded && (
                        <CardContent className="space-y-4 pb-6 pt-0">
                          {database.entries.map((entry) => {
                            const entryKey = getEntryKey(entry);
                            const displayName =
                              entry.schema ?? entry.table ?? "Unknown";
                            const hasTableList =
                              Array.isArray(entry.tables) &&
                              entry.tables.length > 0;

                            return (
                              <div
                                key={entryKey}
                                className="rounded-xl border border-border/50 bg-background/60 p-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-medium uppercase text-muted-foreground">
                                      {entry.schema ? "Schema" : "Table"}
                                    </p>
                                    <p className="text-sm font-semibold text-foreground">
                                      {displayName}
                                    </p>
                                  </div>
                                  {hasTableList ? (
                                    <span className="text-xs text-muted-foreground">
                                      {entry.tables?.length}{" "}
                                      {entry.tables?.length === 1
                                        ? "table"
                                        : "tables"}
                                    </span>
                                  ) : null}
                                </div>
                                {entry.description ? (
                                  <p className="mt-2 text-sm text-muted-foreground">
                                    {entry.description}
                                  </p>
                                ) : (
                                  <p className="mt-2 text-sm italic text-muted-foreground/80">
                                    No description provided.
                                  </p>
                                )}
                                {hasTableList ? (
                                  <ul className="mt-3 space-y-1">
                                    {entry.tables?.map((tableName) => (
                                      <li
                                        key={`${entryKey}-${tableName}`}
                                        className="text-xs text-muted-foreground"
                                      >
                                        • {tableName}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            );
                          })}
                        </CardContent>
                      )}
                      <CardFooter className="flex items-center justify-end gap-2 border-t border-border/40 bg-background/40 py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            const type =
                              database.type === "duckdb" ||
                              database.type === "postgres" ||
                              database.type === "mysql"
                                ? database.type
                                : null;
                            setPrefillDbType(type);
                            setPrefillDbPath(database.dbPath);
                            setIsConnectDialogOpen(true);
                          }}
                        >
                          Add Tables
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          Copy Connection Info
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="datasets">
          <div className="container">
            <h2>Datasets for your visuals in your dashboards</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-lg bg-card p-4">
                <h3>Dataset 1</h3>
                <p>Description of dataset 1</p>
                <ul>
                  <li>id: int</li>
                  <li>name: string</li>
                  <li>age: int</li>
                  <li>email: string</li>
                  <li>created_at: datetime</li>
                  <li>updated_at: datetime</li>
                  <li>is_active: boolean</li>
                  <li>is_deleted: boolean</li>
                  <li>is_archived: boolean</li>
                  <li>is_archived: boolean</li>
                </ul>
              </div>

              <div className="border rounded-lg bg-card p-4">
                <h3>Dataset 2</h3>
                <p>Description of dataset 2</p>
                <ul>
                  <li>id: int</li>
                  <li>name: string</li>
                  <li>value: int</li>
                </ul>
              </div>

              <div className="border rounded-lg bg-card p-4">
                <h3>Dataset 3</h3>
                <p>Description of dataset 3</p>
                <ul>
                  <li>id:int</li>
                  <li>country: string</li>
                  <li>value: int</li>
                  <li>created_at: datetime</li>
                  <li>updated_at: datetime</li>
                  <li>is_active: boolean</li>
                  <li>is_deleted: boolean</li>
                  <li>is_archived: boolean</li>
                </ul>
              </div>
            </div>
          </div>
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
