import { useMemo, useState } from "react";
import Image from "@/vite/next-image";
import { ConnectDataDialog } from "@/components/connect-data-dialog";
import { DuckdbShellDialog } from "@/components/duckdb-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import { useDuckdbHttpTables } from "@/hooks/use-duckdb-http-tables";
import { useUploadedFiles } from "@/hooks/use-uploaded-files";
import type { ConnectedTable } from "@/lib/connected-tables";
import { removeConnectedTable } from "@/lib/connected-tables";
import { resolveSqlBackend } from "@/lib/sql/sql-runtime";
import { formatFileSize, removeUploadedFile } from "@/lib/uploaded-files";
import { useTheme } from "@/lib/theme-provider";

const DEFERRED_MESSAGE =
  "Uploads, semantic/materialized-table flows, and guided connect flows are deferred in browser mode.";

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
  const isDarkMode = theme === "dark";
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [isShellDialogOpen, setIsShellDialogOpen] = useState(false);
  const effectiveSqlBackend = resolveSqlBackend({ backendPreference: "auto" });

  const tablesBySchema = useMemo(() => {
    const grouped = new Map<string, { name: string; type: string }[]>();
    for (const table of duckdbTables) {
      const existing = grouped.get(table.schema);
      if (existing) {
        existing.push({ name: table.name, type: table.type });
      } else {
        grouped.set(table.schema, [{ name: table.name, type: table.type }]);
      }
    }

    return Array.from(grouped.entries())
      .map(([schema, entries]) => ({
        schema,
        tables: [...entries].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.schema.localeCompare(b.schema));
  }, [duckdbTables]);

  const groupedConnectedSources = useMemo(() => {
    const grouped = new Map<string, ConnectedTable[]>();
    for (const table of tables) {
      const key = table.connectionId ?? table.databasePath ?? table.attachAs ?? "source";
      const existing = grouped.get(key);
      if (existing) {
        existing.push(table);
      } else {
        grouped.set(key, [table]);
      }
    }

    return Array.from(grouped.entries()).map(([key, entries]) => ({ key, entries }));
  }, [tables]);

  const getDatabaseLogo = (dbType: string): string | null => {
    if (dbType === "duckdb") {
      return isDarkMode ? "/DuckDB_icon-darkmode.svg" : "/DuckDB_icon-lightmode.svg";
    }
    if (dbType === "postgres") {
      return "/Postgresql_elephant.png";
    }
    if (dbType === "mysql") {
      return isDarkMode ? "/mysql-icon-dark.svg" : "/mysql-icon-light.svg";
    }
    if (dbType === "motherduck") {
      return "/sources/motherduck.png";
    }
    return null;
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-6 overflow-y-auto px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Data Sources
          </span>
          <h1 className="text-3xl font-semibold text-foreground">Connected Data</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Browser mode stores workspace metadata locally and queries DuckDB through the extension bridge.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setIsShellDialogOpen(true)}>
            Open SQL Shell
          </Button>
          <Button type="button" variant="outline" onClick={() => setIsConnectDialogOpen(true)}>
            Connect Data Source
          </Button>
          <Button type="button" variant="outline" disabled title={DEFERRED_MESSAGE}>
            Upload Data (Deferred)
          </Button>
        </div>
      </header>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="pt-6 text-sm text-amber-700 dark:text-amber-300">
          {DEFERRED_MESSAGE}
        </CardContent>
      </Card>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Duckdb connection</h2>
        {effectiveSqlBackend === "duckdb-wasm" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">DuckDB WASM</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Queries are running against the browser-local DuckDB WASM database.
              </p>
            </CardContent>
          </Card>
        ) : isDuckdbHttpConfigured ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Bridge {duckdbHttpConnectionInfo ? `${duckdbHttpConnectionInfo.host}:${duckdbHttpConnectionInfo.port}` : "configured"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isDuckdbTablesLoading ? (
                <p className="text-sm text-muted-foreground">Loading tables...</p>
              ) : duckdbTablesError ? (
                <p className="text-sm text-destructive">Failed to load tables: {duckdbTablesError}</p>
              ) : tablesBySchema.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tables found.</p>
              ) : (
                <div className="grid gap-3">
                  {tablesBySchema.map((group) => (
                    <div key={group.schema} className="rounded-lg border p-3">
                      <p className="text-xs uppercase text-muted-foreground">Schema</p>
                      <p className="mb-2 text-sm font-semibold">{group.schema}</p>
                      <div className="grid gap-1">
                        {group.tables.map((table) => (
                          <div key={`${group.schema}.${table.name}`} className="flex items-center justify-between text-sm">
                            <span>{table.name}</span>
                            <span className="text-xs text-muted-foreground">{table.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Bridge runtime is selected, but bridge metadata is unavailable until `/api/duckdb/config` is configured.
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Connected Sources</h2>
        {groupedConnectedSources.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No locally connected sources yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {groupedConnectedSources.map((group) => {
              const first = group.entries[0];
              const logo = getDatabaseLogo(first.type ?? "");
              return (
                <Card key={group.key}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      {logo ? <Image src={logo} alt={first.type ?? "source"} width={20} height={20} /> : null}
                      <span>{first.databaseName ?? first.databasePath ?? "Source"}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {group.entries.map((entry) => (
                      <div
                        key={`${entry.type}-${entry.databasePath}-${entry.schema ?? ""}-${entry.table ?? ""}`}
                        className="rounded-md border p-3"
                      >
                        <p className="text-xs text-muted-foreground">{entry.type}</p>
                        <p className="text-sm font-medium">{entry.schema || entry.table || entry.attachAs || "(unspecified)"}</p>
                        {entry.tables && entry.tables.length > 0 ? (
                          <p className="text-xs text-muted-foreground">Tables: {entry.tables.join(", ")}</p>
                        ) : null}
                        {entry.description ? (
                          <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>
                        ) : null}
                        <div className="mt-2 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (confirm("Remove this connected source entry?")) {
                                await removeConnectedTable(entry);
                              }
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Uploaded Files</h2>
        <p className="text-sm text-muted-foreground">
          Existing uploaded file entries are visible here, but uploads and new file connections are deferred in browser mode.
        </p>
        {uploadedFiles.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">No uploaded files recorded.</CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {uploadedFiles.map((file) => (
              <Card key={file.fileId}>
                <CardContent className="pt-6">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{file.originalName}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)} • {file.type}</p>
                    <p className="text-xs text-muted-foreground">{new Date(file.uploadedAt).toLocaleString()}</p>
                  </div>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Remove \"${file.originalName}\" from this list?`)) {
                        removeUploadedFile(file.fileId);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      <ConnectDataDialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen} />
      <DuckdbShellDialog open={isShellDialogOpen} onOpenChange={setIsShellDialogOpen} />
    </div>
  );
}
