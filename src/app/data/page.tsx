import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConnectDataDialog } from "@/components/connect-data-dialog";
import { DuckdbShellDialog } from "@/components/duckdb-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import { useDuckdbHttpTables } from "@/hooks/use-duckdb-http-tables";
import { useMaterializedTableDetails } from "@/hooks/use-materialized-table-details";
import { useUploadedFiles } from "@/hooks/use-uploaded-files";
import type { ConnectedTable } from "@/lib/connected-tables";
import { removeConnectedTable } from "@/lib/connected-tables";
import { useTheme } from "@/lib/theme-provider";
import {
  appendUploadedFile,
  formatFileSize,
  removeUploadedFile,
} from "@/lib/uploaded-files";

export default function ViewDataPage() {
  const tables = useConnectedTables();
  const uploadedFiles = useUploadedFiles();
  const {
    tables: duckdbTables,
    isLoading: isDuckdbTablesLoading,
    error: duckdbTablesError,
    isConfigured: isDuckdbHttpConfigured,
    connectionInfo: duckdbHttpConnectionInfo,
  } = useDuckdbHttpTables();
  const { theme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const hasTables = tables.length > 0;
  const hasUploadedFiles = uploadedFiles.length > 0;
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(
    new Set(),
  );
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [isShellDialogOpen, setIsShellDialogOpen] = useState(false);
  const [showMaterializedTables, setShowMaterializedTables] = useState(false);
  const [expandedMaterializedTables, setExpandedMaterializedTables] = useState<
    Set<string>
  >(new Set());
  const [prefillDbType, setPrefillDbType] = useState<
    "motherduck" | "postgres" | "mysql" | null
  >(null);
  const [prefillDbPath, setPrefillDbPath] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    details: materializedTableDetails,
    isLoading: isMaterializedDetailsLoading,
    error: materializedDetailsError,
    refresh: refreshMaterializedDetails,
  } = useMaterializedTableDetails(showMaterializedTables);

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

        // Use databaseName if available, otherwise fallback to dbPath
        const displayName = data.entries[0]?.databaseName || dbPath;

        return {
          dbPath,
          displayName,
          type: data.type,
          entries: [...data.entries],
          totalTables,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [tables]);

  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(
    new Set(),
  );

  const tablesBySchema = useMemo(() => {
    const grouped = new Map<string, { name: string; type: string }[]>();
    for (const t of duckdbTables) {
      const existing = grouped.get(t.schema);
      if (existing) {
        existing.push({ name: t.name, type: t.type });
      } else {
        grouped.set(t.schema, [{ name: t.name, type: t.type }]);
      }
    }
    return Array.from(grouped.entries())
      .map(([schema, entries]) => ({ schema, tables: entries }))
      .sort((a, b) => a.schema.localeCompare(b.schema));
  }, [duckdbTables]);

  const toggleSchema = (schema: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schema)) {
        next.delete(schema);
      } else {
        next.add(schema);
      }
      return next;
    });
  };

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

  const toggleMaterializedTable = (tableName: string) => {
    setExpandedMaterializedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  };

  const formatRowCount = (rowCount?: number) => {
    if (typeof rowCount !== "number" || Number.isNaN(rowCount)) {
      return "Unknown";
    }
    return rowCount.toLocaleString();
  };

  const getEntryKey = (table: ConnectedTable) => {
    return `${table.type}-${table.databasePath}-${table.schema ?? table.table ?? "unknown"}`;
  };

  const getDatabaseLogo = (dbType: string, dbPath?: string): string | null => {
    // Check if it's a MotherDuck connection
    if (dbPath?.startsWith("md:")) {
      return "/sources/motherduck.png";
    }
    if (dbType === "duckdb") {
      return isDarkMode
        ? "/DuckDB_icon-darkmode.svg"
        : "/DuckDB_icon-lightmode.svg";
    }
    if (dbType === "postgres") {
      return "/Postgresql_elephant.png";
    }
    // Handle other source types
    switch (dbType) {
      case "snowflake":
        return "/sources/snowflake.svg";
      case "databricks":
        return "/sources/Databricks.svg";
      case "supabase":
        return "/sources/supabase.svg";
      case "ducklake":
        return "/sources/DuckLake_Logo-horizontal.svg";
      case "iceberg":
        return "/sources/Apache_Iceberg_Logo.svg";
      case "delta_lake":
        return "/sources/delta_lake.png";
      case "google_sheets":
        return "/sources/Google_Sheets.svg";
      case "sharepoint":
        return "/sources/sharepoint.svg";
      case "aws":
        return isDarkMode ? "/aws_dark.svg" : "/aws_light.svg";
      case "mysql":
        return isDarkMode ? "/mysql-icon-dark.svg" : "/mysql-icon-light.svg";
      case "web":
        return "/globe.svg";
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto flex h-full w-full flex-col gap-8 overflow-y-auto px-6 py-10">
      <header className="flex flex-row items-center justify-between space-y-3 max-w-5xl mx-auto">
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
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              "Upload Data"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsShellDialogOpen(true)}
          >
            Open SQL Shell
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowMaterializedTables((prev) => {
                const next = !prev;
                if (!next) {
                  setExpandedMaterializedTables(new Set());
                }
                return next;
              });
            }}
          >
            {showMaterializedTables
              ? "Hide Materialized Tables"
              : "Show Materialized Tables"}
          </Button>
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
        </div>
      </header>
      <Separator className="max-w-5xl mx-auto" />

      <Tabs defaultValue="sources" className="flex-1 max-w-5xl mx-auto w-full">
        <TabsList>
          <TabsTrigger value="sources">Sources</TabsTrigger>
        </TabsList>

        <TabsContent
          value="sources"
          className="mt-4 space-y-10 max-w-5xl mx-auto"
        >
          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Connected Databases
              </h2>
              <p className="text-sm text-muted-foreground">
                Databases you&apos;ve connected directly from your local
                environment.
              </p>
            </div>
            {!hasTables && !isDuckdbHttpConfigured ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl bg-muted/30 p-10 text-center">
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">
                    No connected data yet
                  </h3>
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
                  {isDuckdbHttpConfigured &&
                    (() => {
                      const isDuckdbHttpExpanded =
                        expandedDatabases.has("__duckdb_http__");
                      return (
                        <Card className="gap-0 rounded-2xl border border-border/60 bg-card/60 py-0 shadow-sm">
                          <button
                            type="button"
                            onClick={() => toggleDatabase("__duckdb_http__")}
                            className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            aria-expanded={isDuckdbHttpExpanded}
                          >
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-3">
                                <Image
                                  src={
                                    isDarkMode
                                      ? "/DuckDB_icon-darkmode.svg"
                                      : "/DuckDB_icon-lightmode.svg"
                                  }
                                  alt="DuckDB"
                                  width={24}
                                  height={24}
                                  className="shrink-0"
                                />
                                <span className="truncate text-sm font-semibold text-foreground">
                                  DuckDB HTTP
                                </span>
                                {isDuckdbTablesLoading ? (
                                  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                ) : duckdbTablesError &&
                                  duckdbTables.length === 0 ? (
                                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                                    Unreachable
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                    Connected
                                  </span>
                                )}
                              </div>
                              {duckdbHttpConnectionInfo && (
                                <code className="text-xs text-muted-foreground">
                                  {duckdbHttpConnectionInfo.host}:
                                  {duckdbHttpConnectionInfo.port}
                                </code>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {isDuckdbTablesLoading
                                  ? "Loading tables..."
                                  : duckdbTablesError &&
                                      duckdbTables.length === 0
                                    ? "Could not reach the DuckDB HTTP server"
                                    : `${duckdbTables.length} ${duckdbTables.length === 1 ? "table" : "tables"} available`}
                              </span>
                            </div>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 transition-transform ${isDuckdbHttpExpanded ? "rotate-180" : ""}`}
                            />
                          </button>
                          {isDuckdbHttpExpanded && (
                            <CardContent className="space-y-4 pb-6 pt-0">
                              {tablesBySchema.length === 0 &&
                                !isDuckdbTablesLoading && (
                                  <p className="text-sm italic text-muted-foreground/80 px-1">
                                    No tables found in this instance.
                                  </p>
                                )}
                              {tablesBySchema.map((group) => {
                                const isSchemaExpanded = expandedSchemas.has(
                                  group.schema,
                                );
                                return (
                                  <div
                                    key={group.schema}
                                    className="rounded-xl border border-border/50 bg-background/60"
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSchema(group.schema);
                                      }}
                                      className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-muted/30"
                                    >
                                      <div>
                                        <p className="text-xs font-medium uppercase text-muted-foreground">
                                          Schema
                                        </p>
                                        <p className="text-sm font-semibold text-foreground">
                                          {group.schema}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">
                                          {group.tables.length}{" "}
                                          {group.tables.length === 1
                                            ? "table"
                                            : "tables"}
                                        </span>
                                        <ChevronDown
                                          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isSchemaExpanded ? "rotate-180" : ""}`}
                                        />
                                      </div>
                                    </button>
                                    {isSchemaExpanded && (
                                      <div className="divide-y divide-border/40 border-t border-border/40 px-4">
                                        {group.tables.map((t) => (
                                          <div
                                            key={`${group.schema}.${t.name}`}
                                            className="flex items-center justify-between gap-3 py-2.5 px-1"
                                          >
                                            <span className="text-sm text-foreground">
                                              {t.name}
                                            </span>
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                                              {t.type === "BASE TABLE"
                                                ? "table"
                                                : t.type.toLowerCase()}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </CardContent>
                          )}
                        </Card>
                      );
                    })()}
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
                                const logoPath = getDatabaseLogo(
                                  database.type,
                                  database.dbPath,
                                );
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
                                {database.displayName}
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
                                  <div className="mt-3 flex justify-end">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={async (event) => {
                                        event.stopPropagation();
                                        if (
                                          confirm(
                                            `Are you sure you want to remove "${displayName}" from your connected tables?`,
                                          )
                                        ) {
                                          await removeConnectedTable(entry);
                                        }
                                      }}
                                    >
                                      Remove
                                    </Button>
                                  </div>
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
                              let type:
                                | "motherduck"
                                | "postgres"
                                | "mysql"
                                | null = null;
                              if (
                                database.type === "duckdb" ||
                                database.type === "motherduck"
                              ) {
                                type = "motherduck";
                              } else if (
                                database.type === "postgres" ||
                                database.type === "mysql"
                              ) {
                                type = database.type;
                              }
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
          </section>

          {showMaterializedTables && (
            <section className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">
                  Materialized Tables Explorer
                </h2>
                <p className="text-sm text-muted-foreground">
                  Inspect materialized tables in the <code>mat</code> schema,
                  including row counts, source metadata, and column definitions.
                </p>
              </div>
              <div className="space-y-4">
                {isMaterializedDetailsLoading ? (
                  <Card className="rounded-2xl border border-border/60 bg-card/60 py-0 shadow-sm">
                    <CardContent className="flex items-center gap-3 p-6">
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      <span className="text-sm text-muted-foreground">
                        Loading materialized table metadata...
                      </span>
                    </CardContent>
                  </Card>
                ) : materializedDetailsError ? (
                  <Card className="rounded-2xl border border-destructive/40 bg-destructive/5 py-0 shadow-sm">
                    <CardContent className="space-y-3 p-6">
                      <p className="text-sm text-destructive">
                        Failed to load materialized table details:{" "}
                        {materializedDetailsError}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void refreshMaterializedDetails()}
                      >
                        Retry
                      </Button>
                    </CardContent>
                  </Card>
                ) : materializedTableDetails.length === 0 ? (
                  <Card className="rounded-2xl border border-border/60 bg-card/60 py-0 shadow-sm">
                    <CardContent className="p-6">
                      <p className="text-sm italic text-muted-foreground">
                        No materialized tables found yet.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {materializedTableDetails.map((table) => {
                      const isExpanded = expandedMaterializedTables.has(
                        table.tableName,
                      );
                      return (
                        <Card
                          key={table.tableName}
                          className="gap-0 rounded-2xl border border-border/60 bg-card/60 py-0 shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              toggleMaterializedTable(table.tableName)
                            }
                            className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            aria-expanded={isExpanded}
                          >
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-foreground">
                                mat.{table.tableName}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                                  {formatRowCount(table.rowCount)} rows
                                </span>
                                <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                                  {table.columnCount}{" "}
                                  {table.columnCount === 1
                                    ? "column"
                                    : "columns"}
                                </span>
                                {table.updatedAt ? (
                                  <span>
                                    Updated{" "}
                                    {new Date(table.updatedAt).toLocaleString()}
                                  </span>
                                ) : (
                                  <span>Updated time unknown</span>
                                )}
                              </div>
                            </div>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            />
                          </button>
                          {isExpanded && (
                            <CardContent className="space-y-4 border-t border-border/40 bg-background/30 px-6 py-5">
                              <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                                <p>
                                  <span className="font-medium text-foreground">
                                    Source:
                                  </span>{" "}
                                  {table.sourceName ?? "Unknown"}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">
                                    Target:
                                  </span>{" "}
                                  {table.targetTable ??
                                    `mat.${table.tableName}`}
                                </p>
                                <p className="md:col-span-2">
                                  <span className="font-medium text-foreground">
                                    Source Hash:
                                  </span>{" "}
                                  <span className="break-all">
                                    {table.sourceHash ?? "Unknown"}
                                  </span>
                                </p>
                              </div>

                              {table.introspectionError ? (
                                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                  Column introspection error:{" "}
                                  {table.introspectionError}
                                </p>
                              ) : null}

                              <div className="rounded-xl border border-border/50 bg-background/70">
                                <div className="border-b border-border/50 px-4 py-2">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Columns
                                  </p>
                                </div>
                                {table.columns.length > 0 ? (
                                  <div className="divide-y divide-border/40">
                                    {table.columns.map((column) => (
                                      <div
                                        key={`${table.tableName}-${column.name}`}
                                        className="flex items-center justify-between gap-3 px-4 py-2.5"
                                      >
                                        <span className="text-sm text-foreground">
                                          {column.name}
                                        </span>
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                                          {column.type || "unknown"}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="px-4 py-3 text-xs italic text-muted-foreground">
                                    No columns available.
                                  </p>
                                )}
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          <Separator />

          <section className="space-y-4 mt-20">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Uploaded Files
              </h2>
              <p className="text-sm text-muted-foreground">
                Files you&apos;ve uploaded and stored locally for quick
                analysis.
              </p>
            </div>
            {!hasUploadedFiles ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl bg-muted/30 p-10 text-center">
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">
                    No uploaded files yet
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Upload CSV, XLSX, or Parquet files using the Upload Data
                    button above.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload Data
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4">
                  {uploadedFiles.map((file) => {
                    const uploadedDate = new Date(file.uploadedAt);
                    return (
                      <Card
                        key={file.fileId}
                        className="gap-0 rounded-2xl bg-card/60 py-0 shadow-sm"
                      >
                        <CardContent className="space-y-4 p-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">
                                  {file.originalName}
                                </span>
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  {file.fileName
                                    .split(".")
                                    .pop()
                                    ?.toUpperCase() || "FILE"}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                                <span>Size: {formatFileSize(file.size)}</span>
                                <span>Type: {file.type}</span>
                                <span>
                                  Uploaded: {uploadedDate.toLocaleDateString()}{" "}
                                  {uploadedDate.toLocaleTimeString()}
                                </span>
                              </div>
                              <div className="mt-2">
                                <p className="text-xs font-medium text-muted-foreground">
                                  File Path:
                                </p>
                                <code className="mt-1 block rounded-md bg-muted px-2 py-1.5 text-xs text-foreground">
                                  {file.filePath}
                                </code>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter className="flex items-center justify-end gap-2 border-t border-border/40 bg-background/40 py-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setPrefillDbType("motherduck");
                              setPrefillDbPath(file.filePath);
                              setIsConnectDialogOpen(true);
                            }}
                          >
                            Connect
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (
                                confirm(
                                  `Are you sure you want to remove "${file.originalName}" from the list?`,
                                )
                              ) {
                                removeUploadedFile(file.fileId);
                              }
                            }}
                          >
                            Remove
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.parquet"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          // Validate file type
          const validExtensions = [".csv", ".xlsx", ".xls", ".parquet"];
          const fileExtension = file.name
            .toLowerCase()
            .substring(file.name.lastIndexOf("."));
          if (!validExtensions.includes(fileExtension)) {
            setUploadError(
              "Invalid file type. Please upload a CSV, XLSX, or Parquet file.",
            );
            return;
          }

          // Validate file size (e.g., max 50MB)
          const maxSize = 50 * 1024 * 1024; // 50MB
          if (file.size > maxSize) {
            setUploadError(
              "File size exceeds 50MB. Please choose a smaller file.",
            );
            return;
          }

          setUploadError(null);
          setUploadSuccess(null);
          setIsUploading(true);

          try {
            const uploadFormData = new FormData();
            uploadFormData.append("file", file);

            const uploadResponse = await fetch("/api/upload", {
              method: "POST",
              body: uploadFormData,
            });

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              throw new Error(errorData.error || "Failed to upload file");
            }

            const uploadData = await uploadResponse.json();

            // Save uploaded file info to localStorage
            appendUploadedFile({
              fileId: uploadData.fileId,
              fileName: uploadData.fileName,
              originalName: file.name,
              filePath: uploadData.filePath,
              size: file.size,
              type: file.type || "application/octet-stream",
              uploadedAt: new Date().toISOString(),
            });

            setUploadSuccess(`File "${file.name}" uploaded successfully!`);

            // Clear success message after 5 seconds
            setTimeout(() => {
              setUploadSuccess(null);
            }, 5000);
          } catch (uploadError) {
            console.error("File upload error:", uploadError);
            setUploadError(
              uploadError instanceof Error
                ? uploadError.message
                : "Failed to upload file. Please try again.",
            );
          } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
          }
        }}
      />

      {uploadError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {uploadError}
        </div>
      )}

      {uploadSuccess && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-xs text-primary">
          {uploadSuccess}
        </div>
      )}

      <ConnectDataDialog
        open={isConnectDialogOpen}
        onOpenChange={setIsConnectDialogOpen}
        initialSelectedDatabase={prefillDbType}
        initialDatabasePath={prefillDbPath}
      />
      <DuckdbShellDialog
        open={isShellDialogOpen}
        onOpenChange={setIsShellDialogOpen}
      />
    </div>
  );
}
