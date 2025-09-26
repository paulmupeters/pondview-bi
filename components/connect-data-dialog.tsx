"use client";

import {
  CheckCircleIcon,
  LinkIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appendConnectedTable } from "@/lib/connected-tables";
import { cn } from "@/lib/utils";

type DatabaseType = "duckdb" | "postgres" | "mysql" | null;

const DATABASE_OPTIONS: Array<{
  label: string;
  value: Exclude<DatabaseType, null>;
  disabled?: boolean;
  description?: string;
}> = [
  {
    label: "Postgres",
    value: "postgres",
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
    label: "DuckDB",
    value: "duckdb",
  },
];

const DUCKDB_QUERY_RESPONSE = {
  code: 0,
  stdout:
    '[{"table_schema":"hn","table_name":"hacker_news","table_type":"BASE TABLE"},\n' +
    '{"table_schema":"kaggle","table_name":"movies","table_type":"BASE TABLE"},\n' +
    '{"table_schema":"main","table_name":"database_snapshots","table_type":"VIEW"},\n' +
    '{"table_schema":"main","table_name":"databases","table_type":"VIEW"},\n' +
    '{"table_schema":"main","table_name":"owned_shares","table_type":"VIEW"},\n' +
    '{"table_schema":"main","table_name":"query_history","table_type":"VIEW"},\n' +
    '{"table_schema":"main","table_name":"shared_with_me","table_type":"VIEW"},\n' +
    '{"table_schema":"main","table_name":"storage_info","table_type":"VIEW"},\n' +
    '{"table_schema":"main","table_name":"storage_info_history","table_type":"VIEW"},\n' +
    '{"table_schema":"main","table_name":"unicorns","table_type":"BASE TABLE"},\n' +
    '{"table_schema":"nyc","table_name":"rideshare","table_type":"BASE TABLE"},\n' +
    '{"table_schema":"nyc","table_name":"service_requests","table_type":"BASE TABLE"},\n' +
    '{"table_schema":"nyc","table_name":"taxi","table_type":"BASE TABLE"},\n' +
    '{"table_schema":"stackoverflow_survey","table_name":"survey_results","table_type":"BASE TABLE"},\n' +
    '{"table_schema":"stackoverflow_survey","table_name":"survey_schemas","table_type":"BASE TABLE"},\n' +
    '{"table_schema":"who","table_name":"ambient_air_quality","table_type":"BASE TABLE"}]\n',
  stderr: "",
};

type DuckDBTable = {
  table_schema: string;
  table_name: string;
  table_type: string;
};

const duckdbTables: string[] = JSON.parse(DUCKDB_QUERY_RESPONSE.stdout).map(
  (entry: DuckDBTable) => `${entry.table_schema}.${entry.table_name}`,
);

type ConnectDataDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ConnectDataDialog({
  open,
  onOpenChange,
}: ConnectDataDialogProps) {
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseType>(null);
  const [databasePath, setDatabasePath] = useState("");
  const [connectedTables, setConnectedTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [tableDescription, setTableDescription] = useState("");
  const [hasConnected, setHasConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setSelectedDatabase(null);
    setDatabasePath("");
    setConnectedTables([]);
    setSelectedTable("");
    setTableDescription("");
    setHasConnected(false);
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  const handleConnectClick = useCallback(() => {
    if (selectedDatabase !== "duckdb") {
      setErrorMessage("Only DuckDB connections are supported right now.");
      return;
    }

    if (!databasePath.trim()) {
      setErrorMessage("Enter a DuckDB file path before connecting.");
      return;
    }

    setHasConnected(true);
    setErrorMessage(null);
    setConnectedTables(duckdbTables);
  }, [databasePath, selectedDatabase]);

  const handleAddTable = useCallback(() => {
    if (!selectedDatabase || !selectedTable.trim() || !databasePath.trim()) {
      return;
    }

    try {
      const newEntry = {
        type: selectedDatabase,
        databasePath: databasePath.trim(),
        table: selectedTable,
        description: tableDescription.trim(),
      };

      appendConnectedTable(newEntry);

      onOpenChange(false);
    } catch (error) {
      console.error("Failed to write to localStorage", error);
      setErrorMessage("Failed to store table selection. Please try again.");
    }
  }, [
    databasePath,
    onOpenChange,
    selectedDatabase,
    selectedTable,
    tableDescription,
  ]);

  const isAddDisabled = useMemo(() => {
    return (
      !selectedDatabase ||
      !selectedTable.trim() ||
      !databasePath.trim() ||
      !tableDescription.trim()
    );
  }, [databasePath, selectedDatabase, selectedTable, tableDescription]);

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
            {connectedTables.length === 0 && (
              <section className="space-y-3">
                <header className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Database Type
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Postgres and MySQL are not available yet.
                  </p>
                </header>
                <div className="grid gap-2 sm:grid-cols-3">
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
                          if (option.value !== "duckdb") {
                            setConnectedTables([]);
                            setHasConnected(false);
                          }
                        }}
                        disabled={option.disabled}
                        className={cn(
                          "flex h-full flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition",
                          option.disabled
                            ? "cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground"
                            : "hover:border-primary hover:bg-primary/5",
                          isActive && !option.disabled
                            ? "border-primary bg-primary/10"
                            : "border-border",
                        )}
                      >
                        <span className="text-sm font-medium">
                          {option.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {option.disabled
                            ? (option.description ?? "Unavailable")
                            : "Connect with a local DuckDB file"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {selectedDatabase === "duckdb" && (
              <section className="space-y-3">
                <header className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    DuckDB Database Path
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Provide the path to your `.duckdb` file.
                  </p>
                </header>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    placeholder="/path/to/database.duckdb"
                    value={databasePath}
                    onChange={(event) => setDatabasePath(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="sm:w-fit"
                    onClick={handleConnectClick}
                  >
                    <LinkIcon className="size-4" />
                    Connect
                  </Button>
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

            {connectedTables.length > 0 && (
              <section className="space-y-3">
                <header className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Tables</p>
                  <p className="text-xs text-muted-foreground">
                    Choose a table to add from the connected DuckDB database.
                  </p>
                </header>
                <div className="max-h-56 overflow-y-auto pr-2">
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {connectedTables.map((table) => {
                      const isSelected = selectedTable === table;
                      return (
                        <button
                          key={table}
                          type="button"
                          onClick={() => setSelectedTable(table)}
                          className={cn(
                            "rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
                            isSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary hover:bg-primary/5",
                          )}
                        >
                          {table}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {connectedTables.length > 0 && (
              <section className="space-y-3">
                <header className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Table Description
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Describe the table so your collaborators understand its
                    contents.
                  </p>
                </header>
                <textarea
                  className="min-h-[90px] w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  value={tableDescription}
                  onChange={(event) => setTableDescription(event.target.value)}
                  placeholder="e.g. Daily unicorn company valuations with regional breakdown."
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
              Add Table
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
