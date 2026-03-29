import { useEffect, useMemo, useState } from "react";
import { ConnectDataDialog } from "@/components/connect-data-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import { useDuckdbHttpTables } from "@/hooks/use-duckdb-http-tables";
import { runBridgeQuery } from "@/lib/bridge/pondview-bridge";
import type { ConnectedTable } from "@/lib/connected-tables";
import { removeConnectedTable } from "@/lib/connected-tables";
import { buildDetachStatement } from "@/lib/duckdb/duckdb-attachments";
import {
  refreshDuckDbHttpHealth,
  runDuckDbHttpQuery,
} from "@/lib/duckdb/duckdb-http-browser";
import {
  clearJoinDefsInStorage,
  readJoinDefsRawFromStorage,
  saveJoinDefsRawToStorage,
} from "@/lib/joins/browser-storage";
import { isHiddenRuntimeSchema } from "@/lib/sql/runtime-table-schemas";
import {
  useBridgeRuntimeState,
  useDuckDbHttpConfig,
  useDuckDbHttpHealthStatus,
  useResolvedSqlBackend,
  useSelectedSqlBackend,
} from "@/lib/sql/use-sql-backend";
import { useTheme } from "@/lib/theme-provider";

import Image from "@/vite/next-image";

function isHiddenMetadataTableReference(value: string | undefined): boolean {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return false;
  }

  const [schemaCandidate] = trimmedValue.split(".");
  return isHiddenRuntimeSchema(schemaCandidate ?? "");
}

function isVisibleConnectedEntry(entry: ConnectedTable): boolean {
  if (entry.schema && isHiddenRuntimeSchema(entry.schema)) {
    return false;
  }

  if (entry.table && isHiddenMetadataTableReference(entry.table)) {
    return false;
  }

  if (
    entry.tables?.some((tableName) => isHiddenMetadataTableReference(tableName))
  ) {
    return false;
  }

  return true;
}

export default function ViewDataPage() {
  const tables = useConnectedTables();

  const bridgeRuntimeState = useBridgeRuntimeState();
  const duckDbHttpHealthStatus = useDuckDbHttpHealthStatus();
  const duckDbHttpConfig = useDuckDbHttpConfig();
  const selectedSqlBackend = useSelectedSqlBackend();
  const effectiveSqlBackend = useResolvedSqlBackend();
  const {
    tables: duckdbTables,
    isLoading: isDuckdbTablesLoading,
    error: duckdbTablesError,
    isConfigured: isDuckdbHttpConfigured,
    connectionInfo: duckdbHttpConnectionInfo,
  } = useDuckdbHttpTables(effectiveSqlBackend);

  const { theme } = useTheme();
  const isDarkMode = theme === "dark";
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [joinDefsRaw, setJoinDefsRaw] = useState("[]");
  const [joinDefsError, setJoinDefsError] = useState<string | null>(null);
  const [joinDefsSuccess, setJoinDefsSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!duckDbHttpConfig) {
      return;
    }

    void refreshDuckDbHttpHealth();
    const intervalId = window.setInterval(() => {
      void refreshDuckDbHttpHealth();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [duckDbHttpConfig]);

  useEffect(() => {
    setJoinDefsRaw(readJoinDefsRawFromStorage());
  }, []);

  const handleSaveJoinDefs = () => {
    try {
      const joinDefs = saveJoinDefsRawToStorage(joinDefsRaw);
      setJoinDefsRaw(readJoinDefsRawFromStorage());
      setJoinDefsError(null);
      setJoinDefsSuccess(
        `Saved ${joinDefs.length} join definition${joinDefs.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setJoinDefsSuccess(null);
      setJoinDefsError(
        error instanceof Error
          ? error.message
          : "Invalid join definitions JSON.",
      );
    }
  };

  const handleClearJoinDefs = () => {
    clearJoinDefsInStorage();
    setJoinDefsRaw("[]");
    setJoinDefsError(null);
    setJoinDefsSuccess("Cleared join definitions.");
  };

  const tablesBySchema = useMemo(() => {
    const grouped = new Map<string, { name: string; type: string }[]>();
    for (const table of duckdbTables) {
      const schema = table.schema.trim();
      const catalog = table.catalog?.trim();
      if (isHiddenRuntimeSchema(schema)) {
        continue;
      }
      if (catalog && isHiddenRuntimeSchema(catalog)) {
        continue;
      }

      const existing = grouped.get(schema);
      if (existing) {
        existing.push({ name: table.name, type: table.type });
      } else {
        grouped.set(schema, [{ name: table.name, type: table.type }]);
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
    for (const table of tables.filter(isVisibleConnectedEntry)) {
      const key =
        table.connectionId ?? table.databasePath ?? table.attachAs ?? "source";
      const existing = grouped.get(key);
      if (existing) {
        existing.push(table);
      } else {
        grouped.set(key, [table]);
      }
    }

    return Array.from(grouped.entries()).map(([key, entries]) => ({
      key,
      entries,
    }));
  }, [tables]);

  const getDatabaseLogo = (dbType: string): string | null => {
    if (dbType === "duckdb") {
      return isDarkMode
        ? "/DuckDB_icon-darkmode.svg"
        : "/DuckDB_icon-lightmode.svg";
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

  const remoteRuntimeLabel =
    effectiveSqlBackend === "bridge" ? "Bridge" : "DuckDB over HTTP";
  const selectedRuntimeLabel =
    selectedSqlBackend === "bridge" ? "Bridge" : "DuckDB over HTTP";
  const bridgeConnectionLabel = bridgeRuntimeState.config
    ? `${bridgeRuntimeState.config.host}:${bridgeRuntimeState.config.port}`
    : "configured";
  const isBridgeSelectedButNotReady =
    selectedSqlBackend === "bridge" && effectiveSqlBackend !== "bridge";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-2xl mx-auto">
          <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Data Sources
                </span>
                <h1 className="text-3xl font-semibold text-foreground">
                  Connected Data
                </h1>
                <p className="max-w-3xl text-sm text-muted-foreground">
                  Browser mode stores workspace metadata locally and runs SQL
                  through the selected DuckDB runtime.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsConnectDialogOpen(true)}
                >
                  Connect Data Source
                </Button>
              </div>
            </header>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">
                Duckdb connection
              </h2>
              {isBridgeSelectedButNotReady ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      Bridge {bridgeConnectionLabel}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {bridgeRuntimeState.isDiscoverable
                        ? "Bridge is selected, but Pondview still needs your session secret before queries can run through the active DuckDB instance."
                        : "Bridge is selected, but the Pondview bridge is currently unavailable."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Health: {bridgeRuntimeState.healthStatus}
                      {bridgeRuntimeState.config
                        ? ` • Auth: ${bridgeRuntimeState.config.requiresAuth ? (bridgeRuntimeState.hasSessionSecret ? "session secret set" : "required") : "not required"}`
                        : ""}
                    </p>
                  </CardContent>
                </Card>
              ) : effectiveSqlBackend === "duckdb-wasm" ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">DuckDB WASM</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Queries are running against the browser-local DuckDB WASM
                      database.
                    </p>
                  </CardContent>
                </Card>
              ) : isDuckdbHttpConfigured ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {remoteRuntimeLabel}{" "}
                      {duckdbHttpConnectionInfo
                        ? `${duckdbHttpConnectionInfo.host}:${duckdbHttpConnectionInfo.port}`
                        : "configured"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {isDuckdbTablesLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Loading tables...
                      </p>
                    ) : duckdbTablesError ? (
                      <p className="text-sm text-destructive">
                        Failed to load tables: {duckdbTablesError}
                      </p>
                    ) : tablesBySchema.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No tables found.
                      </p>
                    ) : (
                      <div className="grid gap-3">
                        {tablesBySchema.map((group) => (
                          <div
                            key={group.schema}
                            className="rounded-lg border p-3"
                          >
                            <p className="text-xs uppercase text-muted-foreground">
                              Schema
                            </p>
                            <p className="mb-2 text-sm font-semibold">
                              {group.schema}
                            </p>
                            <div className="grid gap-1">
                              {group.tables.map((table) => (
                                <div
                                  key={`${group.schema}.${table.name}`}
                                  className="flex items-center justify-between text-sm"
                                >
                                  <span>{table.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {table.type}
                                  </span>
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
                    {selectedRuntimeLabel} is selected, but remote metadata is
                    unavailable. Health:{" "}
                    {selectedSqlBackend === "bridge"
                      ? bridgeRuntimeState.healthStatus
                      : duckDbHttpHealthStatus}
                    .
                  </CardContent>
                </Card>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">
                Dashboard Join Definitions
              </h2>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Cross-table dashboard joins
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Configure cross-table dashboard filtering joins. Values must
                    be a JSON array with leftTable , leftColumn , rightTable ,{" "}
                    rightColumn , and optional type .
                  </p>

                  <Textarea
                    value={joinDefsRaw}
                    onChange={(event) => {
                      setJoinDefsRaw(event.target.value);
                      setJoinDefsError(null);
                      setJoinDefsSuccess(null);
                    }}
                    className="min-h-55 font-mono text-xs"
                    spellCheck={false}
                    placeholder="[]"
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSaveJoinDefs}>
                      Save Join Definitions
                    </Button>
                    <Button variant="outline" onClick={handleClearJoinDefs}>
                      Clear
                    </Button>
                  </div>

                  {joinDefsError && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {joinDefsError}
                    </p>
                  )}
                  {joinDefsSuccess && (
                    <p className="text-sm text-green-600 dark:text-green-400">
                      {joinDefsSuccess}
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">
                External Connected Sources
              </h2>
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
                            {logo ? (
                              <Image
                                src={logo}
                                alt={first.type ?? "source"}
                                width={20}
                                height={20}
                              />
                            ) : null}
                            <span>
                              {first.databaseName ??
                                first.databasePath ??
                                "Source"}
                            </span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {group.entries.map((entry) => (
                            <div
                              key={`${entry.type}-${entry.databasePath}-${entry.schema ?? ""}-${entry.table ?? ""}`}
                              className="rounded-md border p-3"
                            >
                              <p className="text-xs text-muted-foreground">
                                {entry.type}
                              </p>
                              <p className="text-sm font-medium">
                                {entry.schema ||
                                  entry.table ||
                                  entry.attachAs ||
                                  "(unspecified)"}
                              </p>
                              {entry.tables && entry.tables.length > 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  Tables: {entry.tables.join(", ")}
                                </p>
                              ) : null}
                              {entry.description ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {entry.description}
                                </p>
                              ) : null}
                              <div className="mt-2 flex justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    if (
                                      confirm(
                                        "Remove this connected source entry?",
                                      )
                                    ) {
                                      // Best-effort remote detach before removing local metadata
                                      if (
                                        entry.attachAs &&
                                        effectiveSqlBackend !== "duckdb-wasm"
                                      ) {
                                        try {
                                          const detachSql =
                                            buildDetachStatement(
                                              entry.attachAs,
                                              { ifExists: true },
                                            );
                                          if (
                                            effectiveSqlBackend === "bridge"
                                          ) {
                                            await runBridgeQuery(detachSql);
                                          } else if (
                                            effectiveSqlBackend ===
                                            "duckdb-http"
                                          ) {
                                            await runDuckDbHttpQuery(detachSql);
                                          }
                                        } catch {
                                          // Best-effort only; removal proceeds regardless
                                        }
                                      }
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
          </div>
        </div>
      </div>

      <ConnectDataDialog
        open={isConnectDialogOpen}
        onOpenChange={setIsConnectDialogOpen}
        effectiveSqlBackend={effectiveSqlBackend}
      />
    </div>
  );
}
