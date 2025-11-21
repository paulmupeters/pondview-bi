"use client";

import {
  CheckCircleIcon,
  LinkIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSchemas, getTablesForSchema } from "@/actions/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appendConnectedTable } from "@/lib/connected-tables";
import { DuckdbWasmClient } from "@/lib/duckdb/duckdb-wasm-client";
import { useTheme } from "@/lib/theme-provider";
import { cn } from "@/lib/utils";


type DatabaseType =
  | "duckdb"
  | "motherduck"
  | "postgres"
  | "mysql"
  | "snowflake"
  | "databricks"
  | "supabase"
  | "ducklake"
  | "iceberg"
  | "delta_lake"
  | "google_sheets"
  | "sharepoint"
  | "aws"
  | "web"
  | null;

const DATABASE_OPTIONS: Array<{
  label: string;
  value: Exclude<DatabaseType, null>;
  disabled?: boolean;
  description?: string;
}> = [
  {
    label: "Postgres",
    value: "postgres",
      description: "Connect with a Postgres database",
    },
    {
      label: "MotherDuck",
      value: "motherduck",
      description: "Connect with a MotherDuck database",
    },
    {
      label: "Snowflake",
      value: "snowflake",
      disabled: true,
      description: "Coming soon",
    },
    {
      label: "Databricks",
      value: "databricks",
      disabled: true,
      description: "Coming soon",
    },
    {
      label: "Supabase",
      value: "supabase",
      disabled: true,
      description: "Coming soon",
    },
    {
      label: "DuckLake",
      value: "ducklake",
      disabled: true,
      description: "Coming soon",
    },
    {
      label: "Apache Iceberg",
      value: "iceberg",
      disabled: true,
      description: "Coming soon",
    },
    {
      label: "Delta Lake",
      value: "delta_lake",
      disabled: true,
      description: "Coming soon",
    },
    {
      label: "Google Sheets",
      value: "google_sheets",
      disabled: true,
      description: "Coming soon",
    },
    {
      label: "SharePoint",
      value: "sharepoint",
      disabled: true,
      description: "Coming soon",
    },
    {
      label: "AWS",
      value: "aws",
      disabled: true,
      description: "Coming soon",
  },
  {
    label: "MySQL",
    value: "mysql",
    disabled: true,
    description: "Coming soon",
    },
    {
      label: "Web",
      value: "web",
      disabled: true,
      description: "Coming soon",
    },
];

const resolveDuckdbExtension = (dbType: DatabaseType): string | undefined => {
  switch (dbType) {
    case "motherduck":
      return "motherduck";
    case "postgres":
      return "postgres";
    case "mysql":
      return "mysql";
    default:
      return undefined;
  }
};

// Removed unused DuckDB preview constants

type ConnectDataDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Optional initial values to prefill the form when opening
  initialSelectedDatabase?: DatabaseType;
  initialDatabasePath?: string;
};

export function ConnectDataDialog({
  open,
  onOpenChange,
  initialSelectedDatabase,
  initialDatabasePath,
}: ConnectDataDialogProps) {
  const { theme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseType>(null);
  const [chacheInDuckdbWasm, setChacheInDuckdbWasm] = useState(false);
  const [databasePath, setDatabasePath] = useState("");
  const [motherduckToken, setMotherduckToken] = useState("");
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<string>("");
  const [schemaTablesPreview, setSchemaTablesPreview] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [tableDescription, setTableDescription] = useState("");
  const [hasConnected, setHasConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setSelectedDatabase(null);
    setDatabasePath("");
    setMotherduckToken("");
    setSchemas([]);
    setSelectedSchema("");
    setSchemaTablesPreview([]);
    setTableDescription("");
    setHasConnected(false);
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  // Prefill values when opening the dialog
  useEffect(() => {
    if (open) {
      if (initialSelectedDatabase) {
        // Convert "duckdb" to "motherduck" for backward compatibility
        const dbType = initialSelectedDatabase === "duckdb" ? "motherduck" : initialSelectedDatabase;
        setSelectedDatabase(dbType);
      }
      if (initialDatabasePath) {
        setDatabasePath(initialDatabasePath);
      }
    }
  }, [open, initialSelectedDatabase, initialDatabasePath]);

  // Theme detection for logo selection
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

  const getDatabaseLogo = (dbType: string): string | null => {
    switch (dbType) {
      case "motherduck":
        return "/sources/motherduck.png";
      case "postgres":
        return "/Postgresql_elephant.png";
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

  const handleConnectClick = useCallback(async () => {
    if (!databasePath.trim()) {
      setErrorMessage("Enter a database identifier before connecting.");
      return;
    }

    try {
      setIsLoadingSchemas(true);
      setErrorMessage(null);

      // Build database path - prepend "md:" for MotherDuck and add token if provided
      let dbPath = databasePath.trim();
      if (selectedDatabase === "motherduck") {
        dbPath = `md:${dbPath}`;
        if (motherduckToken.trim()) {
          const encodedToken = encodeURIComponent(motherduckToken.trim());
          dbPath = `${dbPath}?motherduck_token=${encodedToken}`;
        }
      }

      const fetchedSchemas = await getSchemas(dbPath);
      setSchemas(fetchedSchemas);
      setHasConnected(true);
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e ?? "");
      setErrorMessage(msg || "Failed to connect or fetch schemas.");
    } finally {
      setIsLoadingSchemas(false);
    }
  }, [databasePath, motherduckToken, selectedDatabase]);

  const handleSchemaSelect = useCallback(async (schema: string) => {
    setSelectedSchema(schema);
    setSelectedTables(new Set());
    try {
      setIsLoadingTables(true);
      // Build database path - prepend "md:" for MotherDuck and add token if provided
      let dbPath = databasePath.trim();
      if (selectedDatabase === "motherduck") {
        dbPath = `md:${dbPath}`;
        if (motherduckToken.trim()) {
          const encodedToken = encodeURIComponent(motherduckToken.trim());
          dbPath = `${dbPath}?motherduck_token=${encodedToken}`;
        }
      }
      console.log("Calling getTablesForSchema with:", { dbPath, schema });
      const tables = await getTablesForSchema(dbPath, schema, 20);
      console.log("getTablesForSchema returned:", tables);
      setSchemaTablesPreview(tables);
    } catch (e: unknown) {
      console.error("Error in handleSchemaSelect:", e);
      setSchemaTablesPreview([]);
      const msg = e instanceof Error ? e.message : String(e ?? "");
      setErrorMessage(`Failed to load tables: ${msg}`);
    } finally {
      setIsLoadingTables(false);
    }
  }, [databasePath, motherduckToken, selectedDatabase]);

  const handleAddTable = useCallback(async () => {
    if (!selectedDatabase || !selectedSchema.trim() || !databasePath.trim()) {
      console.log("handleAddTable: disabled");
      return;
    }
    try {
      // Build database path - prepend "md:" for MotherDuck and add token if provided
      let dbPath = databasePath.trim();
      if (selectedDatabase === "motherduck") {
        dbPath = `md:${dbPath}`;
        if (motherduckToken.trim()) {
          const encodedToken = encodeURIComponent(motherduckToken.trim());
          dbPath = `${dbPath}?motherduck_token=${encodedToken}`;
        }
      }
      // Ingest selected tables into local DuckDB-Wasm database (row-major JSON)
      if (selectedTables.size > 0 && chacheInDuckdbWasm) {
        const client = new DuckdbWasmClient();
        setChacheInDuckdbWasm(true)
        for (const t of selectedTables) {
          console.log("handleAddTable: fetching rows for ", selectedSchema, t);
          const url = new URL("/api/tables", window.location.origin);
          url.searchParams.set("id", dbPath);
          url.searchParams.set("schema", selectedSchema);
          url.searchParams.set("table", t);
          const res = await fetch(url.toString());
          if (!res.ok) {
            throw new Error(`Failed to fetch rows for ${selectedSchema}.${t}`);
          }
          const { rows } = (await res.json()) as { rows: unknown[] };
          // Insert into schema.table format (e.g., main.unicorns)
          console.log("handleAddTable: inserting rows for ", selectedSchema, t);
          await client.insertJSONRows(selectedSchema, t, rows);
        }
      }

      const aliasBase =
        selectedSchema.trim() ||
        selectedDatabase ||
        "source";
      const attachAs = aliasBase
        .trim()
        .replace(/[^A-Za-z0-9_]/g, "_")
        .replace(/^_+/g, "")
        .replace(/_+/g, "_");
      const sanitizedAlias =
        attachAs && !/^[0-9]/.test(attachAs)
          ? attachAs
          : attachAs
            ? `_${attachAs}`
            : "source";
      const connectionType = selectedDatabase ?? "motherduck";
      const duckdbExtension = resolveDuckdbExtension(connectionType);
      const newEntry = {
        type: connectionType,
        databasePath: dbPath,
        schema: selectedSchema,
        tables: Array.from(selectedTables),
        description: tableDescription.trim(),
        attachAs: sanitizedAlias || "source",
        readOnly: connectionType !== "motherduck",
        duckdbExtension,
      };
      await appendConnectedTable(newEntry);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to write to localStorage", error);
      setErrorMessage("Failed to store table selection. Please try again.");
    }
  }, [
    databasePath,
    motherduckToken,
    onOpenChange,
    selectedDatabase,
    selectedSchema,
    selectedTables,
    tableDescription,
    chacheInDuckdbWasm,
  ]);

  const isAddDisabled = useMemo(() => {
    return (
      !selectedDatabase ||
      !selectedSchema.trim() ||
      !databasePath.trim() ||
      !tableDescription.trim()
    );
  }, [databasePath, selectedDatabase, selectedSchema, tableDescription]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 fixed left-1/2 top-1/2 z-50 w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card shadow-2xl focus:outline-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-foreground">
                Connect Data Source
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Choose a database, connect, and describe the table you want to
                use.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="size-8 rounded-full text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                aria-label="Close"
              >
                <XMarkIcon className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-6 px-6 py-5">
            {schemas.length === 0 && (
              <section className="space-y-3">
                <header className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Database Type
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Select a data source to connect. Some options are coming soon.
                  </p>
                </header>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                  {DATABASE_OPTIONS.map((option) => {
                    const isActive = selectedDatabase === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          if (option.disabled) return;
                          setSelectedDatabase(option.value);
                          setErrorMessage(null);
                          setSchemas([]);
                          setSchemaTablesPreview([]);
                          setHasConnected(false);
                        }}
                        disabled={option.disabled}
                        className={cn(
                          "flex h-full flex-col items-start gap-2 rounded-xl border px-4 py-3 text-left transition",
                          option.disabled
                            ? "cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground"
                            : "hover:border-primary hover:bg-primary/5",
                          isActive && !option.disabled
                            ? "border-primary bg-primary/10"
                            : "border-border",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {(() => {
                            const logoPath = getDatabaseLogo(option.value);
                            return logoPath ? (
                              <Image
                                src={logoPath}
                                alt={option.label}
                                width={20}
                                height={20}
                                className="shrink-0"
                              />
                            ) : null;
                          })()}
                          <span className="text-sm font-medium">
                            {option.label}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {option.disabled
                            ? (option.description ?? "Unavailable")
                            : (option.description ??
                              "Connect with a local DuckDB file")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {selectedDatabase && (
              <section className="space-y-3">
                <header className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {selectedDatabase === "motherduck"
                      ? "MotherDuck Database"
                      : selectedDatabase === "postgres"
                        ? "Postgres Connection URL"
                        : "Connection"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedDatabase === "motherduck"
                      ? "Provide the name of your MotherDuck database (e.g., my_db)."
                      : selectedDatabase === "postgres"
                        ? "Provide a Postgres connection URL (postgres://...) or pg:ALIAS."
                        : null}
                  </p>
                </header>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Input
                      placeholder={
                        selectedDatabase === "motherduck"
                          ? "my_db"
                          : selectedDatabase === "postgres"
                            ? "postgres://user:pass@host:5432/db?sslmode=require or pg:DEFAULT"
                            : ""
                      }
                      value={databasePath}
                      onChange={(event) => setDatabasePath(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="sm:w-fit"
                      onClick={handleConnectClick}
                    >
                      {isLoadingSchemas ? (
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                          Connecting...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <LinkIcon className="size-4" />
                          Connect
                        </span>
                      )}
                    </Button>
                  </div>
                  {selectedDatabase === "motherduck" && (
                    <div>
                      <Input
                        type="password"
                        placeholder="MotherDuck token (optional, uses .env.local if not provided)"
                        value={motherduckToken}
                        onChange={(event) => setMotherduckToken(event.target.value)}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter your MotherDuck token to connect to a different account
                      </p>
                    </div>
                  )}
                </div>

                {hasConnected && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-xs text-primary">
                    <div className="flex items-center gap-2">
                      <CheckCircleIcon className="size-4" />
                      <span>
                        Connected to {selectedDatabase?.toUpperCase()}. Select a
                        table to continue.
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => resetState()}
                    >
                      Change database
                    </Button>
                  </div>
                )}
              </section>
            )}

            {schemas.length > 0 && (
              <section className="space-y-3">
                <header className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Schemas</p>
                  <p className="text-xs text-muted-foreground">
                    Choose a schema to add from the connected database.
                  </p>
                </header>
                <div className="max-h-56 overflow-y-auto pr-2">
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {schemas.map((schema) => {
                      const isSelected = selectedSchema === schema;
                      return (
                        <button
                          key={schema}
                          type="button"
                          onClick={() => handleSchemaSelect(schema)}
                          className={cn(
                            "rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
                            isSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary hover:bg-primary/5",
                          )}
                        >
                          {schema}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {selectedSchema && (
              <section className="space-y-3">
                <header className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Tables in "{selectedSchema}"
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Preview of up to 20 tables in the selected schema.
                  </p>
                </header>
                <div className="max-h-40 overflow-y-auto pr-2">
                  {isLoadingTables ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      Loading tables...
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {schemaTablesPreview.length === 0 ? (
                        <span className="text-xs text-muted-foreground col-span-full">
                          No tables found or failed to load.
                        </span>
                      ) : (
                        schemaTablesPreview.map((t) => {
                          const isChecked = selectedTables.has(t);
                          return (
                            <label
                              key={t}
                              className={cn(
                                "rounded-xl border px-4 py-2 text-left text-xs flex items-center gap-2 cursor-pointer",
                                isChecked
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border hover:border-primary hover:bg-primary/5 text-muted-foreground",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  setSelectedTables((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(t);
                                    else next.delete(t);
                                    return next;
                                  });
                                }}
                              />
                              <span className="truncate">{t}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {schemas.length > 0 && (
              <section className="space-y-3">
                <header className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Schema Description
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Describe the schema so your collaborators understand its
                    contents.
                  </p>
                </header>
                <textarea
                  className="min-h-[90px] w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  value={tableDescription}
                  onChange={(event) => setTableDescription(event.target.value)}
                  placeholder="e.g. Business intelligence curated tables for analytics."
                />
              </section>
            )}

            {errorMessage && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                {errorMessage}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
            <Dialog.Close asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              onClick={handleAddTable}
              disabled={isAddDisabled}
            >
              Add Schema
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
