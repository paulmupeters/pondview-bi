import { ClipboardDocumentIcon, PlayIcon } from "@heroicons/react/24/outline";
import { Eraser } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import {
  type AutocompleteQueryFn,
  buildSqlAutocompleteQuery,
  createSqlAutocompleteAction,
  type ExecuteQueryFn,
  parseSqlAutocompleteSuggestion,
  SqlConsole,
  type SqlConsoleApi,
} from "@/components/sql-console";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  cancelBridgeQuery,
  runBridgeQuery,
} from "@/lib/bridge/pondview-bridge";
import {
  type ConnectedTable,
  readConnectedTablesFromStorage,
} from "@/lib/connected-tables";
import { runWithCatalogContext } from "@/lib/duckdb/catalog-context";
import {
  getDuckDbHttpHealthStatus,
  hasDuckDbHttpConfig,
  hasDuckDbHttpSessionAuth,
} from "@/lib/duckdb/duckdb-http-browser";
import {
  buildAttachmentPlan,
  buildDetachStatement,
} from "@/lib/duckdb/duckdb-attachments";
import { runDuckDbHttpQuery } from "@/lib/duckdb/duckdb-http-browser";
import { isMotherDuckIdentifier } from "@/lib/duckdb/motherduck";
import type { ExplorerInsertPayload } from "@/lib/duckdb/table-reference";
import type { SourceConnectionConfig } from "@/lib/sources/source-config";
import { runQuery } from "@/lib/sql/run-query";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  getSqlBackendPreference,
  isWasmLocalIdentifier,
  type SqlBackend,
  type SqlBackendPreference,
} from "@/lib/sql/sql-runtime";
import {
  useResolvedSqlBackend,
  useResolveSqlBackend,
} from "@/lib/sql/use-sql-backend";
import type { Config } from "@/lib/types";
import { cn } from "@/lib/utils";

function createQueryWarning(message: string): Error {
  const error = new Error(message);
  error.name = "QueryWarning";
  return error;
}

function getRemoteRuntimeWarning(params: {
  sourceType: ConnectedTable["type"];
  backendPreference: SqlBackendPreference;
  isDuckDbHttpConfigured: boolean;
  duckDbHttpHealthStatus: "unknown" | "online" | "offline";
}): string {
  const {
    sourceType,
    backendPreference,
    isDuckDbHttpConfigured,
    duckDbHttpHealthStatus,
  } = params;

  const shouldMentionDuckDbHttp =
    backendPreference === "duckdb-http" ||
    (backendPreference === "auto" &&
      isDuckDbHttpConfigured &&
      duckDbHttpHealthStatus !== "online");

  if (shouldMentionDuckDbHttp) {
    return hasDuckDbHttpSessionAuth()
      ? `DuckDB over HTTP is currently unavailable, so this query fell back to DuckDB WASM. DuckDB WASM cannot query external ${sourceType} sources. Check the DuckDB HTTP server in Settings and retry.`
      : `DuckDB over HTTP is not authenticated, so this query fell back to DuckDB WASM. DuckDB WASM cannot query external ${sourceType} sources. Re-enter your DuckDB HTTP auth in Settings and retry.`;
  }

  if (backendPreference === "bridge") {
    return `Bridge is not currently query-ready, so this query fell back to DuckDB WASM. DuckDB WASM cannot query external ${sourceType} sources. Re-authenticate Bridge in Settings or switch runtimes and retry.`;
  }

  return `DuckDB WASM cannot query external ${sourceType} sources. Switch to Bridge or DuckDB over HTTP before running this query.`;
}

const SQL_SAMPLE_SQL = `-- Create a sample table with two columns (col1, col2)
SELECT
    range1 AS col1,
    range2 AS col2
FROM
    (SELECT UNNEST(GENERATE_SERIES(1, 10)) AS range1) t1
CROSS JOIN
    (SELECT UNNEST(GENERATE_SERIES(11, 20)) AS range2) t2;
`;

const _SQL_SAMPLE_LINES: {
  id: string;
  content: ReactNode;
  indent?: boolean;
}[] = [
  {
    id: "select",
    content: <span className="text-purple-600 font-bold">SELECT</span>,
  },
  {
    id: "date-trunc",
    indent: true,
    content: (
      <>
        date_trunc(<span className="text-green-600">'minute'</span>, timestamp,
        5) <span className="text-purple-600 font-bold">AS</span> time_bucket,
      </>
    ),
  },
  {
    id: "count-distinct",
    indent: true,
    content: (
      <>
        count(
        <span className="text-purple-600 font-bold">DISTINCT</span> user_id){" "}
        <span className="text-purple-600 font-bold">AS</span> active_users
      </>
    ),
  },
  {
    id: "from",
    content: <span className="text-purple-600 font-bold">FROM</span>,
  },
  {
    id: "analytics-table",
    indent: true,
    content: <span className="text-amber-600">analytics.page_views</span>,
  },
  {
    id: "where",
    content: <span className="text-purple-600 font-bold">WHERE</span>,
  },
  {
    id: "region",
    indent: true,
    content: (
      <>
        region = <span className="text-green-600">'us-east-1'</span>
      </>
    ),
  },
  {
    id: "group-by",
    content: (
      <>
        <span className="text-purple-600 font-bold">GROUP BY</span> 1
      </>
    ),
  },
  {
    id: "order-by",
    content: (
      <>
        <span className="text-purple-600 font-bold">ORDER BY</span> 1{" "}
        <span className="text-purple-600 font-bold">ASC</span>
        {";"}
      </>
    ),
  },
];

type DuckdbReplProps = {
  className?: string;
  layoutVariant?: "embedded" | "page";
  selectedDbIdentifier?: string;
  catalogContext?: string | null;
  onRunSqlAction?: (params: {
    sql: string;
    dbIdentifier?: string;
    catalogContext?: string | null;
    signal: AbortSignal;
  }) => ReturnType<ExecuteQueryFn>;
  onConsoleApiChangeAction?: (api: SqlConsoleApi | null) => void;
  onQueryChangeAction?: (sql: string) => void;
  inlineResults?: boolean;
  onResultChangeAction?: (
    result: {
      sql: string;
      rows: Record<string, unknown>[];
      columns: { name: string; type?: string }[];
      durationMs: number;
      backend?: SqlBackend;
      dbIdentifier?: string;
      catalogContext?: string | null;
    } | null,
  ) => void;
  showRunControls?: boolean;
  showExplorer?: boolean;
  showCopySnippetButton?: boolean;
  showClearButton?: boolean;
  showSaveQueryButton?: boolean;
  onSaveQueryAction?: (sql: string) => void | Promise<void>;
  isSavingQuery?: boolean;
  chartConfig?: Config | null;
  editorMinHeight?: string;
  editorMaxHeight?: string;
};

const HISTORY_KEY = "bi.repl.history";

export function getDuckdbReplToolbarInsetClassName(
  layoutVariant: DuckdbReplProps["layoutVariant"] = "embedded",
) {
  return layoutVariant === "page" ? "top-2 right-2" : "top-4 right-4";
}

export function createDuckdbReplAutocompleteAction(
  options: {
    connectedEntry?: ConnectedTable;
    effectiveSqlBackend: SqlBackend;
    selectedDb?: string;
    selectedDbIdentifier?: string;
    catalogContext?: string | null;
  },
  deps: {
    createSharedAutocompleteAction?: typeof createSqlAutocompleteAction;
    runBridgeSql?: typeof runBridgeQuery;
    runDuckDbHttpSql?: typeof runDuckDbHttpQuery;
    runWasmSql?: typeof runQuery;
  } = {},
): AutocompleteQueryFn {
  const effectiveDb = options.selectedDb ?? options.selectedDbIdentifier;
  const connectedEntry = options.connectedEntry;
  const createSharedAutocompleteAction =
    deps.createSharedAutocompleteAction ?? createSqlAutocompleteAction;
  const runBridgeSql = deps.runBridgeSql ?? runBridgeQuery;
  const runDuckDbHttpSql = deps.runDuckDbHttpSql ?? runDuckDbHttpQuery;
  const runWasmSql = deps.runWasmSql ?? runQuery;

  if (!connectedEntry?.databasePath || connectedEntry.type === "duckdb") {
    return createSharedAutocompleteAction({
      dbIdentifier: effectiveDb,
      catalogContext: options.catalogContext,
    });
  }

  let isDisabled = false;

  return async ({ sql, signal }) => {
    if (isDisabled) {
      return null;
    }

    if (
      connectedEntry.type === "motherduck" &&
      options.effectiveSqlBackend === "duckdb-wasm"
    ) {
      isDisabled = true;
      return null;
    }

    const connectionConfig: SourceConnectionConfig = {
      type: connectedEntry.type,
      identifier: connectedEntry.databasePath,
      alias: connectedEntry.attachAs || "source",
      readOnly: connectedEntry.readOnly,
      duckdbExtension: connectedEntry.duckdbExtension,
    };
    const plan = buildAttachmentPlan(connectionConfig);

    const runAttached = async (statement: string) => {
      if (options.effectiveSqlBackend === "bridge") {
        return runBridgeSql(statement, signal);
      }
      if (options.effectiveSqlBackend === "duckdb-http") {
        return runDuckDbHttpSql(statement, signal);
      }
      return runWasmSql({ sql: statement, signal });
    };

    try {
      for (const statement of plan.statements) {
        await runAttached(statement);
      }

      await runAttached("LOAD autocomplete;");

      const result = await runWithCatalogContext({
        sql: buildSqlAutocompleteQuery(sql),
        selectedCatalog: plan.alias,
        runQuery: runAttached,
      });

      return parseSqlAutocompleteSuggestion(result.rows[0]);
    } catch {
      isDisabled = true;
      return null;
    } finally {
      try {
        await runAttached(buildDetachStatement(plan.alias, { ifExists: true }));
      } catch {
        // Best-effort detach only.
      }
    }
  };
}

export function DuckdbRepl({
  className,
  layoutVariant = "embedded",
  selectedDbIdentifier,
  catalogContext,
  onRunSqlAction,
  onConsoleApiChangeAction,
  onQueryChangeAction,
  inlineResults = true,
  onResultChangeAction,
  showRunControls = true,
  showExplorer = true,
  showCopySnippetButton = true,
  showClearButton = true,
  showSaveQueryButton = false,
  onSaveQueryAction,
  isSavingQuery = false,
  chartConfig: _chartConfig,
  editorMinHeight = "8rem",
  editorMaxHeight = inlineResults ? "20rem" : "14rem",
}: DuckdbReplProps) {
  const [lastResult, setLastResult] = useState<{
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
    backend?: SqlBackend;
    dbIdentifier?: string;
    catalogContext?: string | null;
  } | null>(null);
  const [internalApi, setInternalApi] = useState<SqlConsoleApi | null>(null);
  const [currentQuery, setCurrentQuery] = useState("");
  const [copiedSqlSnippet, setCopiedSqlSnippet] = useState(false);
  const copySnippetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedDb, setSelectedDb] = useState<string | undefined>(
    selectedDbIdentifier ?? DEFAULT_WASM_DB_IDENTIFIER,
  );
  const [internalCatalogContext, setInternalCatalogContext] = useState<
    string | null
  >(catalogContext ?? null);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(true);
  const [explorerRefreshToken, setExplorerRefreshToken] = useState(0);
  const onResultChangeActionRef = useRef(onResultChangeAction);
  const resolveCurrentSqlBackend = useResolveSqlBackend();
  const effectiveSqlBackend = useResolvedSqlBackend();

  const connectedEntry = useMemo((): ConnectedTable | undefined => {
    if (!selectedDb || isWasmLocalIdentifier(selectedDb)) return undefined;
    const tables = readConnectedTablesFromStorage();
    return tables.find(
      (t) =>
        t.connectionId === selectedDb ||
        t.databasePath === selectedDb ||
        t.attachAs === selectedDb,
    );
  }, [selectedDb]);

  const effectiveCatalogContext =
    catalogContext !== undefined ? catalogContext : internalCatalogContext;
  const autocompleteAction = useMemo(
    () =>
      createDuckdbReplAutocompleteAction({
        connectedEntry,
        effectiveSqlBackend,
        selectedDb,
        selectedDbIdentifier,
        catalogContext: effectiveCatalogContext,
      }),
    [
      connectedEntry,
      effectiveCatalogContext,
      effectiveSqlBackend,
      selectedDb,
      selectedDbIdentifier,
    ],
  );

  const executeQuery: ExecuteQueryFn = async ({ sql, signal }) => {
    const effectiveDb = selectedDb ?? selectedDbIdentifier;

    if (
      connectedEntry?.type === "motherduck" &&
      effectiveSqlBackend === "duckdb-wasm"
    ) {
      throw new Error(
        "MotherDuck requires Bridge or DuckDB over HTTP. Switch the SQL runtime in Settings before running this source.",
      );
    }

    if (
      connectedEntry?.databasePath &&
      connectedEntry.type !== "duckdb" &&
      effectiveSqlBackend === "duckdb-wasm"
    ) {
      throw createQueryWarning(
        getRemoteRuntimeWarning({
          sourceType: connectedEntry.type,
          backendPreference: getSqlBackendPreference(),
          isDuckDbHttpConfigured: hasDuckDbHttpConfig(),
          duckDbHttpHealthStatus: getDuckDbHttpHealthStatus(),
        }),
      );
    }

    // If there's a connected external entry, wrap the query with ATTACH / DETACH
    if (connectedEntry?.databasePath && connectedEntry.type !== "duckdb") {
      const connectionConfig: SourceConnectionConfig = {
        type: connectedEntry.type,
        identifier: connectedEntry.databasePath,
        alias: connectedEntry.attachAs || "source",
        readOnly: connectedEntry.readOnly,
        duckdbExtension: connectedEntry.duckdbExtension,
      };
      const plan = buildAttachmentPlan(connectionConfig);

      const runRemote = async (stmt: string) => {
        if (effectiveSqlBackend === "bridge") {
          await runBridgeQuery(stmt, signal);
        } else if (effectiveSqlBackend === "duckdb-http") {
          await runDuckDbHttpQuery(stmt, signal);
        } else {
          await runQuery({ sql: stmt, signal });
        }
      };

      // INSTALL / LOAD / ATTACH
      for (const stmt of plan.statements) {
        await runRemote(stmt);
      }

      try {
        if (onRunSqlAction) {
          return await onRunSqlAction({
            sql,
            dbIdentifier: effectiveDb,
            catalogContext: plan.alias,
            signal,
          });
        }

        const runAttachedSql = async (statement: string) => {
          if (effectiveSqlBackend === "bridge") {
            return runBridgeQuery(statement, signal);
          }
          if (effectiveSqlBackend === "duckdb-http") {
            return runDuckDbHttpQuery(statement, signal);
          }
          return runQuery({ sql: statement, signal });
        };

        const result = await runWithCatalogContext({
          sql,
          selectedCatalog: plan.alias,
          runQuery: runAttachedSql,
        });

        return {
          ...result,
          backend: effectiveSqlBackend,
          dbIdentifier: effectiveDb,
          catalogContext: plan.alias,
        };
      } finally {
        try {
          await runRemote(buildDetachStatement(plan.alias, { ifExists: true }));
        } catch {
          // Best-effort detach
        }
      }
    }

    // Default path: local WASM or no external connection
    if (onRunSqlAction) {
      return onRunSqlAction({
        sql,
        dbIdentifier: effectiveDb,
        catalogContext: effectiveCatalogContext,
        signal,
      });
    }
    const result = await runQuery({
      sql,
      dbIdentifier: effectiveDb,
      catalogContext: effectiveCatalogContext,
      signal,
    });
    return {
      ...result,
      dbIdentifier:
        (effectiveSqlBackend === "bridge" ||
          effectiveSqlBackend === "duckdb-http") &&
        !isMotherDuckIdentifier(effectiveDb)
          ? undefined
          : effectiveDb,
      catalogContext: effectiveCatalogContext,
    };
  };

  const handleCopySqlSnippet = () => {
    const currentSql = currentQuery.trim();
    const textToCopy = currentSql?.length ? currentSql : SQL_SAMPLE_SQL;
    if (
      !textToCopy ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }
    void navigator.clipboard.writeText(textToCopy);
    setCopiedSqlSnippet(true);
    if (copySnippetTimeoutRef.current) {
      clearTimeout(copySnippetTimeoutRef.current);
    }
    copySnippetTimeoutRef.current = setTimeout(() => {
      setCopiedSqlSnippet(false);
    }, 2000);
  };

  const handleRunSqlFromBanner = () => {
    if (!internalApi) {
      return;
    }
    internalApi.runQuery();
  };

  const currentSql = currentQuery.trim();
  const isSaveQueryDisabled =
    !internalApi ||
    !onSaveQueryAction ||
    isSavingQuery ||
    currentSql.length === 0;
  const toolbarInsetClassName =
    getDuckdbReplToolbarInsetClassName(layoutVariant);

  const handleSaveQuery = () => {
    if (isSaveQueryDisabled || !onSaveQueryAction) {
      return;
    }
    void Promise.resolve(onSaveQueryAction(currentSql));
  };

  const handleQueryChange = useCallback(
    (nextQuery: string) => {
      setCurrentQuery(nextQuery);
      onQueryChangeAction?.(nextQuery);
    },
    [onQueryChangeAction],
  );

  const handleInsertTableName = useCallback(
    (payload: ExplorerInsertPayload) => {
      if (!internalApi) return;
      const current = internalApi.getQuery() ?? "";
      const lastChar = current.length > 0 ? current[current.length - 1] : "";
      const needsSpace = current.length > 0 && !/\s/.test(lastChar);
      internalApi.insertText(`${needsSpace ? " " : ""}${payload.reference}`);
      internalApi.focus();
      if (payload.dbIdentifier) {
        setSelectedDb(payload.dbIdentifier);
      }
      if (catalogContext === undefined) {
        setInternalCatalogContext(payload.catalogContext ?? null);
      }
    },
    [catalogContext, internalApi],
  );

  const handleCancelQuery = async () => {
    const backend = resolveCurrentSqlBackend({
      dbIdentifier: selectedDbIdentifier,
    });

    if (backend !== "bridge") {
      return;
    }

    await cancelBridgeQuery();
  };

  useEffect(() => {
    onResultChangeActionRef.current = onResultChangeAction;
  }, [onResultChangeAction]);

  // Keep parent state in sync with the latest query result regardless of where
  // the result is rendered.
  useEffect(() => {
    onResultChangeActionRef.current?.(lastResult);
  }, [lastResult]);

  useEffect(() => {
    if (internalApi && onConsoleApiChangeAction) {
      onConsoleApiChangeAction(internalApi);
    }
    return () => {
      // Only clear if we're unmounting to avoid null flickering during re-renders
      // Note: This might need adjustment if repl.tsx is conditionally rendered often
    };
  }, [internalApi, onConsoleApiChangeAction]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copySnippetTimeoutRef.current) {
        clearTimeout(copySnippetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedDbIdentifier !== undefined) {
      setSelectedDb(selectedDbIdentifier);
    }
  }, [selectedDbIdentifier]);

  useEffect(() => {
    if (catalogContext !== undefined) {
      setInternalCatalogContext(catalogContext ?? null);
    }
  }, [catalogContext]);

  return (
    <div
      className={cn(
        "flex min-w-0 h-full overflow-hidden border-r border-border",
        className,
      )}
    >
      {/* Table Explorer Sidebar */}
      {showExplorer && (
        <ConnectedDataPanel
          selectedDb={selectedDb}
          onSelect={(dbIdentifier) => {
            setSelectedDb(dbIdentifier);
            setInternalCatalogContext(null);
          }}
          mode="sidebar"
          onInsertTable={handleInsertTableName}
          refreshToken={explorerRefreshToken}
          collapsed={isExplorerCollapsed}
          onToggleCollapse={() => setIsExplorerCollapsed((prev) => !prev)}
          className="shrink-0 bg-background"
          sqlBackend={effectiveSqlBackend}
        />
      )}

      {/* Editor + Results area */}
      <div className="relative flex-1 min-w-0 h-full p-4">
        {/* Toolbar Buttons */}
        <div
          className={cn("absolute z-20 flex gap-2 text-xs", toolbarInsetClassName)}
        >
          {lastResult && showClearButton && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 bg-card text-foreground px-3 py-1.5 rounded text-xs font-bold hover:bg-accent transition-colors h-[26px]"
                  onClick={() => {
                    setLastResult(null);
                    internalApi?.clearResults();
                    internalApi?.setQuery("");
                    if (onResultChangeActionRef.current) {
                      onResultChangeActionRef.current(null);
                    }
                  }}
                >
                  <Eraser className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clear results</p>
              </TooltipContent>
            </Tooltip>
          )}
          {showCopySnippetButton && (
            <button
              type="button"
              className="flex items-center gap-2 bg-card border border-border text-foreground px-3 py-1.5 rounded text-xs font-bold hover:bg-accent transition-colors shadow-sm h-[26px]"
              onClick={handleCopySqlSnippet}
            >
              {copiedSqlSnippet ? (
                <>
                  <svg
                    aria-hidden="true"
                    className="w-3 h-3 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <ClipboardDocumentIcon className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          )}
          {showSaveQueryButton && (
            <button
              type="button"
              className={cn(
                "flex items-center gap-2 bg-card border border-border text-foreground px-3 py-1.5 rounded text-xs font-bold transition-colors shadow-sm h-[26px]",
                isSaveQueryDisabled ? "cursor-not-allowed" : "hover:bg-accent",
              )}
              onClick={handleSaveQuery}
              disabled={isSaveQueryDisabled}
            >
              {isSavingQuery ? "Saving..." : "Save Query"}
            </button>
          )}

          {showRunControls && (
            <button
              type="button"
              disabled={!internalApi}
              onClick={handleRunSqlFromBanner}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold transition-colors shadow-sm h-[26px]",
                internalApi
                  ? "bg-card border border-border text-card-foreground hover:bg-accent"
                  : "bg-card border border-border text-card-foreground cursor-not-allowed",
              )}
            >
              <PlayIcon className="w-3 h-3" />
              Run
            </button>
          )}
        </div>

        {/* SQL Console */}
        <div className="relative z-10 h-full">
          <SqlConsole
            className="h-full w-full"
            historyKey={HISTORY_KEY}
            editorMinHeight={editorMinHeight}
            editorMaxHeight={editorMaxHeight}
            executeQueryAction={executeQuery}
            autocompleteAction={autocompleteAction}
            onApiChangeAction={setInternalApi}
            onQueryChangeAction={handleQueryChange}
            onCancelQueryAction={handleCancelQuery}
            showInlineResults={inlineResults}
            showRunControls={false}
            onSuccessAction={({
              sql,
              rows,
              columns,
              durationMs,
              backend,
              dbIdentifier,
              catalogContext,
            }) => {
              setLastResult({
                sql,
                rows,
                columns,
                durationMs,
                backend,
                dbIdentifier,
                catalogContext,
              });
              setExplorerRefreshToken((prev) => prev + 1);
            }}
          />
        </div>
      </div>
    </div>
  );
}
