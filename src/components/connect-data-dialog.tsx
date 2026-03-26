import {
  CheckCircleIcon,
  LinkIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runBridgeQuery } from "@/lib/bridge/pondview-bridge";
import { appendConnectedTable } from "@/lib/connected-tables";
import {
  buildAttachmentPlan,
  buildDetachStatement,
} from "@/lib/duckdb/duckdb-attachments";
import { runDuckDbHttpQuery } from "@/lib/duckdb/duckdb-http-browser";
import {
  buildMotherDuckIdentifier,
  extractMotherDuckDatabaseName,
} from "@/lib/duckdb/motherduck";
import {
  buildPostgresConnectionString,
  type PostgresUrlComponents,
} from "@/lib/duckdb/path";
import { isHiddenRuntimeSchema } from "@/lib/sql/runtime-table-schemas";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import { cn } from "@/lib/utils";

type DatabaseType =
  | "duckdb"
  | "motherduck"
  | "postgres"
  | "mysql"
  | "sqlite"
  | "httpfs"
  | "extension"
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

const SCHEMALESS_DATABASES = new Set<DatabaseType>([
  "extension",
  "iceberg",
  "delta_lake",
  "ducklake",
  "httpfs",
]);

const DATABASE_OPTIONS: Array<{
  label: string;
  value: Exclude<DatabaseType, null>;
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
    label: "MySQL",
    value: "mysql",
    description: "Connect with a MySQL database",
  },
  {
    label: "SQLite",
    value: "sqlite",
    description: "Attach a SQLite database file",
  },
  // {
  //   label: "Custom Extension",
  //   value: "extension",
  //   description: "Install + attach a DuckDB extension (advanced)",
  // },
];

const resolveDuckdbExtension = (dbType: DatabaseType): string | undefined => {
  switch (dbType) {
    case "motherduck":
      return "motherduck";
    case "postgres":
      return "postgres";
    case "mysql":
      return "mysql";
    case "sqlite":
      return "sqlite";
    default:
      return undefined;
  }
};

type ConnectDataDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSelectedDatabase?: DatabaseType;
  initialDatabasePath?: string;
  effectiveSqlBackend?: SqlBackend;
};

type MotherDuckConnectionState = "idle" | "auth_pending" | "confirmed";

const MOTHERDUCK_ALIAS = "motherduck";

function requiresSchemaSelection(dbType: DatabaseType): boolean {
  return (
    dbType !== "extension" &&
    dbType !== "motherduck" &&
    !!dbType &&
    !SCHEMALESS_DATABASES.has(dbType)
  );
}

function extractMotherDuckTableNames(
  rows: Record<string, unknown>[],
): string[] {
  return rows
    .map((row) => {
      const explicitName = row.name ?? row.table_name;
      if (explicitName !== undefined && explicitName !== null) {
        return String(explicitName);
      }
      const firstValue = Object.values(row)[0];
      return firstValue === undefined || firstValue === null
        ? ""
        : String(firstValue);
    })
    .filter(Boolean);
}

async function runRemoteSql(
  effectiveSqlBackend: SqlBackend,
  sql: string,
): Promise<Record<string, unknown>[]> {
  if (effectiveSqlBackend === "bridge") {
    const result = await runBridgeQuery(sql);
    return result.rows;
  }
  if (effectiveSqlBackend === "duckdb-http") {
    const result = await runDuckDbHttpQuery(sql);
    return result.rows;
  }
  throw new Error(
    "Cannot run remote SQL: active runtime is DuckDB WASM. Switch to Bridge or DuckDB over HTTP in Settings.",
  );
}

export function ConnectDataDialog({
  open,
  onOpenChange,
  initialSelectedDatabase,
  initialDatabasePath,
  effectiveSqlBackend = "duckdb-wasm",
}: ConnectDataDialogProps) {
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseType>(null);
  const [databasePath, setDatabasePath] = useState("");
  const [motherDuckConnectionState, setMotherDuckConnectionState] =
    useState<MotherDuckConnectionState>("idle");
  // Postgres-specific connection fields
  const [postgresHost, setPostgresHost] = useState("");
  const [postgresPort, setPostgresPort] = useState("5432");
  const [postgresUser, setPostgresUser] = useState("");
  const [postgresPassword, setPostgresPassword] = useState("");
  const [postgresDatabase, setPostgresDatabase] = useState("");
  const [postgresSslMode, setPostgresSslMode] = useState<string>("");
  // MySQL-specific connection fields
  const [mysqlHost, setMysqlHost] = useState("");
  const [mysqlPort, setMysqlPort] = useState("3306");
  const [mysqlUser, setMysqlUser] = useState("");
  const [mysqlPassword, setMysqlPassword] = useState("");
  const [mysqlDatabase, setMysqlDatabase] = useState("");
  // SQLite-specific fields
  const [sqlitePath, setSqlitePath] = useState("");
  const [sqliteAlias, setSqliteAlias] = useState("");
  // Custom extension fields
  const [customExtensionName, setCustomExtensionName] = useState("");
  const [customAttachStatement, setCustomAttachStatement] = useState("");
  const [customAttachAlias, setCustomAttachAlias] = useState("");
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<string>("");
  const [schemaTablesPreview, setSchemaTablesPreview] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [tableDescription, setTableDescription] = useState("");
  const [hasConnected, setHasConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const motherDuckAttachPromiseRef = useRef<Promise<void> | null>(null);

  const isWasmActive = effectiveSqlBackend === "duckdb-wasm";

  const resetState = useCallback(() => {
    setSelectedDatabase(null);
    setDatabasePath("");
    setMotherDuckConnectionState("idle");
    setPostgresHost("");
    setPostgresPort("5432");
    setPostgresUser("");
    setPostgresPassword("");
    setPostgresDatabase("");
    setPostgresSslMode("");
    setMysqlHost("");
    setMysqlPort("3306");
    setMysqlUser("");
    setMysqlPassword("");
    setMysqlDatabase("");
    setSqlitePath("");
    setSqliteAlias("");
    setCustomExtensionName("");
    setCustomAttachStatement("");
    setCustomAttachAlias("");
    setSchemas([]);
    setSelectedSchema("");
    setSchemaTablesPreview([]);
    setSelectedTables(new Set());
    setTableDescription("");
    setHasConnected(false);
    setErrorMessage(null);
    motherDuckAttachPromiseRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  useEffect(() => {
    if (open && initialSelectedDatabase) {
      setSelectedDatabase(initialSelectedDatabase);
    }
    if (open && initialDatabasePath) {
      setDatabasePath(
        initialSelectedDatabase === "motherduck"
          ? extractMotherDuckDatabaseName(initialDatabasePath)
          : initialDatabasePath,
      );
    }
  }, [open, initialSelectedDatabase, initialDatabasePath]);

  const buildMotherDuckDbIdentifier = useCallback(
    (databaseName = databasePath): string =>
      buildMotherDuckIdentifier(databaseName),
    [databasePath],
  );

  const buildMotherDuckConnection = useCallback(
    (databaseName = databasePath) => ({
      type: "motherduck",
      identifier: buildMotherDuckDbIdentifier(databaseName),
      alias: MOTHERDUCK_ALIAS,
      readOnly: false,
      duckdbExtension: "motherduck",
    }),
    [databasePath, buildMotherDuckDbIdentifier],
  );

  const buildPostgresConnectionStringFromFields = useCallback((): string => {
    const host = postgresHost.trim() || "localhost";
    const port = parseInt(postgresPort.trim() || "5432", 10);
    const user = postgresUser.trim() || "postgres";
    const password = postgresPassword;
    const database = postgresDatabase.trim() || "postgres";
    const sslmode = postgresSslMode.trim() as PostgresUrlComponents["sslmode"];

    const components: PostgresUrlComponents = {
      host,
      port,
      user,
      password,
      database,
      sslmode: sslmode || undefined,
    };
    return buildPostgresConnectionString(components);
  }, [
    postgresHost,
    postgresPort,
    postgresUser,
    postgresPassword,
    postgresDatabase,
    postgresSslMode,
  ]);

  const buildMysqlConnectionStringFromFields = useCallback((): string => {
    const host = mysqlHost.trim() || "localhost";
    const port = parseInt(mysqlPort.trim() || "3306", 10);
    const user = mysqlUser.trim() || "root";
    const password = mysqlPassword;
    const database = mysqlDatabase.trim() || "mysql";
    const authPart =
      user || password
        ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}@`
        : "";
    return `mysql://${authPart}${host}:${port}/${database}`;
  }, [mysqlHost, mysqlPort, mysqlUser, mysqlPassword, mysqlDatabase]);

  const extractDatabaseName = useCallback(
    (dbType: DatabaseType, dbPath: string): string => {
      if (dbType === "postgres") {
        return postgresDatabase.trim() || "postgres";
      }
      if (dbType === "mysql") {
        return mysqlDatabase.trim() || "mysql";
      }
      if (dbType === "extension") {
        return (
          customAttachAlias.trim() || customExtensionName.trim() || "extension"
        );
      }
      if (dbType === "motherduck") {
        return extractMotherDuckDatabaseName(dbPath) || "motherduck";
      }
      return dbPath.trim() || dbType || "database";
    },
    [postgresDatabase, mysqlDatabase, customAttachAlias, customExtensionName],
  );

  const runMotherDuckAttachSequence = useCallback(
    async (databaseName = databasePath): Promise<void> => {
      const connection = buildMotherDuckConnection(databaseName);
      const plan = buildAttachmentPlan(connection);

      try {
        await runRemoteSql(
          effectiveSqlBackend,
          buildDetachStatement(plan.alias, { ifExists: true }),
        );
      } catch {
        // Best-effort cleanup of any existing alias before reattaching.
      }

      for (const statement of plan.statements) {
        await runRemoteSql(effectiveSqlBackend, statement);
      }
    },
    [databasePath, buildMotherDuckConnection, effectiveSqlBackend],
  );

  const handleConfirmMotherDuckClick = useCallback(async () => {
    if (isWasmActive) return;

    try {
      setIsLoadingTables(true);
      setErrorMessage(null);

      if (motherDuckAttachPromiseRef.current) {
        await motherDuckAttachPromiseRef.current;
      } else {
        await runMotherDuckAttachSequence();
      }

      const rows = await runRemoteSql(
        effectiveSqlBackend,
        `SHOW TABLES FROM ${MOTHERDUCK_ALIAS};`,
      );
      const tableNames = extractMotherDuckTableNames(rows);
      setSchemaTablesPreview(tableNames);
      setSelectedTables(new Set());
      setHasConnected(true);
      setMotherDuckConnectionState("confirmed");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      setErrorMessage(
        msg || "Failed to confirm MotherDuck authentication or load tables.",
      );
    } finally {
      setIsLoadingTables(false);
    }
  }, [isWasmActive, effectiveSqlBackend, runMotherDuckAttachSequence]);

  const handleConnectClick = useCallback(async () => {
    if (isWasmActive) return;

    // Field validation
    if (selectedDatabase === "postgres") {
      if (
        !postgresHost.trim() ||
        !postgresUser.trim() ||
        !postgresDatabase.trim()
      ) {
        setErrorMessage(
          "Please fill in all required Postgres connection fields (Host, Username, Database).",
        );
        return;
      }
    } else if (selectedDatabase === "mysql") {
      if (!mysqlHost.trim() || !mysqlUser.trim() || !mysqlDatabase.trim()) {
        setErrorMessage(
          "Please fill in all required MySQL connection fields (Host, Username, Database).",
        );
        return;
      }
    } else if (selectedDatabase === "sqlite") {
      if (!sqlitePath.trim()) {
        setErrorMessage("Enter a SQLite database file path.");
        return;
      }
    } else if (selectedDatabase === "extension") {
      if (
        !customExtensionName.trim() ||
        !customAttachStatement.trim() ||
        !customAttachAlias.trim()
      ) {
        setErrorMessage(
          "Provide extension name, ATTACH statement, and AS alias.",
        );
        return;
      }
    } else if (!databasePath.trim()) {
      setErrorMessage("Enter a database identifier before connecting.");
      return;
    }

    try {
      setIsLoadingSchemas(true);
      setErrorMessage(null);

      let dbPath: string;
      if (selectedDatabase === "postgres") {
        dbPath = buildPostgresConnectionStringFromFields();
      } else if (selectedDatabase === "mysql") {
        dbPath = buildMysqlConnectionStringFromFields();
      } else if (selectedDatabase === "sqlite") {
        dbPath = `sqlite:${sqlitePath.trim()}`;
      } else if (selectedDatabase === "extension") {
        // Skip schema discovery for custom extensions
        setSchemas([]);
        setHasConnected(true);
        return;
      } else if (selectedDatabase === "motherduck") {
        setSchemas([]);
        setSelectedSchema("");
        setSchemaTablesPreview([]);
        setSelectedTables(new Set());
        setHasConnected(false);
        setMotherDuckConnectionState("auth_pending");

        const attachPromise = runMotherDuckAttachSequence(databasePath);
        motherDuckAttachPromiseRef.current = attachPromise;
        void attachPromise
          .catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e ?? "");
            setMotherDuckConnectionState("idle");
            setErrorMessage(
              msg || "Failed to initialize MotherDuck authentication flow.",
            );
          })
          .finally(() => {
            if (motherDuckAttachPromiseRef.current === attachPromise) {
              motherDuckAttachPromiseRef.current = null;
            }
          });
        return;
      } else {
        dbPath = databasePath.trim();
      }

      // Build a SourceConnectionConfig and use buildAttachmentPlan for INSTALL/LOAD/ATTACH
      const extension = resolveDuckdbExtension(selectedDatabase);
      const connection = {
        type: selectedDatabase ?? "duckdb",
        identifier: dbPath,
        alias:
          selectedDatabase === "postgres"
            ? postgresDatabase.trim() || "source"
            : selectedDatabase === "mysql"
              ? mysqlDatabase.trim() || "source"
              : selectedDatabase === "sqlite"
                ? sqliteAlias.trim() || "source"
                : "source",
        readOnly: true,
        duckdbExtension: extension,
      };

      const plan = buildAttachmentPlan(connection);

      // Execute INSTALL/LOAD/ATTACH
      for (const stmt of plan.statements) {
        await runRemoteSql(effectiveSqlBackend, stmt);
      }

      // Introspect schemas from the attached alias
      const schemaRows = await runRemoteSql(
        effectiveSqlBackend,
        `SELECT DISTINCT table_schema FROM ${plan.alias}.information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog') ORDER BY 1`,
      );
      const fetchedSchemas = schemaRows
        .map((r) => String(r.table_schema ?? ""))
        .filter((schema) => !isHiddenRuntimeSchema(schema))
        .filter(Boolean);
      setSchemas(fetchedSchemas);
      setHasConnected(true);

      // Detach to keep the remote runtime clean; re-attach happens on each interaction
      try {
        await runRemoteSql(
          effectiveSqlBackend,
          buildDetachStatement(plan.alias, { ifExists: true }),
        );
      } catch {
        // Best-effort detach; ignore errors
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      setErrorMessage(msg || "Failed to connect or fetch schemas.");
    } finally {
      setIsLoadingSchemas(false);
    }
  }, [
    isWasmActive,
    databasePath,
    selectedDatabase,
    postgresHost,
    postgresUser,
    postgresDatabase,
    buildPostgresConnectionStringFromFields,
    mysqlHost,
    mysqlUser,
    mysqlDatabase,
    buildMysqlConnectionStringFromFields,
    customExtensionName,
    customAttachStatement,
    customAttachAlias,
    sqlitePath,
    sqliteAlias,
    effectiveSqlBackend,
    runMotherDuckAttachSequence,
  ]);

  const handleSchemaSelect = useCallback(
    async (schema: string) => {
      if (isWasmActive) return;
      setSelectedSchema(schema);
      setSelectedTables(new Set());
      try {
        setIsLoadingTables(true);

        let dbPath: string;
        if (selectedDatabase === "postgres") {
          dbPath = buildPostgresConnectionStringFromFields();
        } else if (selectedDatabase === "mysql") {
          dbPath = buildMysqlConnectionStringFromFields();
        } else if (selectedDatabase === "sqlite") {
          dbPath = `sqlite:${sqlitePath.trim()}`;
        } else {
          dbPath = databasePath.trim();
        }

        const extension = resolveDuckdbExtension(selectedDatabase);
        const connection = {
          type: selectedDatabase ?? "duckdb",
          identifier: dbPath,
          alias:
            selectedDatabase === "postgres"
              ? postgresDatabase.trim() || "source"
              : selectedDatabase === "mysql"
                ? mysqlDatabase.trim() || "source"
                : selectedDatabase === "sqlite"
                  ? sqliteAlias.trim() || "source"
                  : "source",
          readOnly: true,
          duckdbExtension: extension,
        };
        const plan = buildAttachmentPlan(connection);

        for (const stmt of plan.statements) {
          await runRemoteSql(effectiveSqlBackend, stmt);
        }

        const safeSchema = schema.replace(/'/g, "''");
        const tableRows = await runRemoteSql(
          effectiveSqlBackend,
          `SELECT table_name FROM ${plan.alias}.information_schema.tables WHERE table_schema = '${safeSchema}' AND table_type = 'BASE TABLE' ORDER BY table_name LIMIT 20`,
        );
        setSchemaTablesPreview(
          tableRows.map((r) => String(r.table_name ?? "")).filter(Boolean),
        );

        try {
          await runRemoteSql(
            effectiveSqlBackend,
            buildDetachStatement(plan.alias, { ifExists: true }),
          );
        } catch {
          // Best-effort
        }
      } catch (e: unknown) {
        setSchemaTablesPreview([]);
        const msg = e instanceof Error ? e.message : String(e ?? "");
        setErrorMessage(`Failed to load tables: ${msg}`);
      } finally {
        setIsLoadingTables(false);
      }
    },
    [
      isWasmActive,
      databasePath,
      selectedDatabase,
      buildPostgresConnectionStringFromFields,
      buildMysqlConnectionStringFromFields,
      postgresDatabase,
      mysqlDatabase,
      sqliteAlias,
      sqlitePath,
      effectiveSqlBackend,
    ],
  );

  const handleAddTable = useCallback(async () => {
    if (isWasmActive) return;

    const requiresSchema = requiresSchemaSelection(selectedDatabase);

    if (selectedDatabase === "postgres") {
      if (
        !postgresHost.trim() ||
        !postgresUser.trim() ||
        !postgresDatabase.trim() ||
        (requiresSchema && !selectedSchema.trim())
      ) {
        return;
      }
    } else if (selectedDatabase === "mysql") {
      if (
        !mysqlHost.trim() ||
        !mysqlUser.trim() ||
        !mysqlDatabase.trim() ||
        (requiresSchema && !selectedSchema.trim())
      ) {
        return;
      }
    } else if (selectedDatabase === "sqlite") {
      if (!sqlitePath.trim() || !sqliteAlias.trim()) return;
    } else if (selectedDatabase === "extension") {
      if (
        !customExtensionName.trim() ||
        !customAttachStatement.trim() ||
        !customAttachAlias.trim()
      )
        return;
    } else if (
      !selectedDatabase ||
      (requiresSchema && !selectedSchema.trim()) ||
      !databasePath.trim()
    ) {
      return;
    }

    try {
      let dbPath: string;
      if (selectedDatabase === "postgres") {
        dbPath = buildPostgresConnectionStringFromFields();
      } else if (selectedDatabase === "mysql") {
        dbPath = buildMysqlConnectionStringFromFields();
      } else if (selectedDatabase === "sqlite") {
        dbPath = `sqlite:${sqlitePath.trim()}`;
      } else if (selectedDatabase === "extension") {
        dbPath = customAttachStatement.trim();
      } else if (selectedDatabase === "motherduck") {
        dbPath = buildMotherDuckDbIdentifier();
      } else {
        dbPath = databasePath.trim();
      }

      const attachAs =
        selectedDatabase === "extension"
          ? customAttachAlias.trim()
          : selectedDatabase === "sqlite"
            ? sqliteAlias.trim()
            : selectedDatabase === "motherduck"
              ? MOTHERDUCK_ALIAS
              : selectedDatabase === "postgres"
                ? postgresDatabase.trim() || "postgres"
                : selectedDatabase === "mysql"
                  ? mysqlDatabase.trim() || "mysql"
                  : databasePath.trim() || "source";

      const sanitizedAlias =
        attachAs && !/^[0-9]/.test(attachAs)
          ? attachAs
          : attachAs
            ? `_${attachAs}`
            : "source";

      const connectionType = selectedDatabase ?? "motherduck";
      const duckdbExtension =
        connectionType === "extension"
          ? customExtensionName.trim()
          : connectionType === "motherduck"
            ? "motherduck"
            : resolveDuckdbExtension(connectionType);

      const databaseName = extractDatabaseName(selectedDatabase, dbPath);
      const entrySchema =
        connectionType === "extension" || !requiresSchema ? "" : selectedSchema;
      const entryTables =
        connectionType === "extension" || !requiresSchema
          ? []
          : Array.from(selectedTables);

      const newEntry = {
        type: connectionType,
        databasePath: dbPath,
        databaseName,
        schema: entrySchema,
        tables: entryTables,
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
    isWasmActive,
    databasePath,
    onOpenChange,
    selectedDatabase,
    selectedSchema,
    selectedTables,
    tableDescription,
    postgresHost,
    postgresUser,
    postgresDatabase,
    buildPostgresConnectionStringFromFields,
    extractDatabaseName,
    buildMysqlConnectionStringFromFields,
    mysqlHost,
    mysqlUser,
    mysqlDatabase,
    customExtensionName,
    customAttachStatement,
    customAttachAlias,
    sqlitePath,
    sqliteAlias,
    buildMotherDuckDbIdentifier,
  ]);

  const isAddDisabled = useMemo(() => {
    if (isWasmActive) return true;
    const requiresSchema = requiresSchemaSelection(selectedDatabase);

    if (!selectedDatabase || !tableDescription.trim()) return true;
    if (requiresSchema && !selectedSchema.trim()) return true;
    if (selectedDatabase === "motherduck") {
      return selectedTables.size === 0 || !tableDescription.trim();
    }

    if (selectedDatabase === "postgres") {
      return (
        !postgresHost.trim() || !postgresUser.trim() || !postgresDatabase.trim()
      );
    }
    if (selectedDatabase === "mysql") {
      return !mysqlHost.trim() || !mysqlUser.trim() || !mysqlDatabase.trim();
    }
    if (selectedDatabase === "sqlite") {
      return !sqlitePath.trim() || !sqliteAlias.trim();
    }
    if (selectedDatabase === "extension") {
      return (
        !customExtensionName.trim() ||
        !customAttachStatement.trim() ||
        !customAttachAlias.trim() ||
        !tableDescription.trim()
      );
    }
    return !databasePath.trim();
  }, [
    isWasmActive,
    databasePath,
    selectedDatabase,
    selectedSchema,
    selectedTables,
    tableDescription,
    postgresHost,
    postgresUser,
    postgresDatabase,
    mysqlHost,
    mysqlUser,
    mysqlDatabase,
    customExtensionName,
    customAttachStatement,
    customAttachAlias,
    sqlitePath,
    sqliteAlias,
  ]);

  const isConnectDisabled = useMemo(() => {
    if (isWasmActive) return true;
    if (!selectedDatabase) return true;

    if (selectedDatabase === "postgres") {
      return (
        !postgresHost.trim() || !postgresUser.trim() || !postgresDatabase.trim()
      );
    }
    if (selectedDatabase === "mysql") {
      return !mysqlHost.trim() || !mysqlUser.trim() || !mysqlDatabase.trim();
    }
    if (selectedDatabase === "sqlite") {
      return !sqlitePath.trim();
    }
    if (selectedDatabase === "extension") {
      return (
        !customExtensionName.trim() ||
        !customAttachStatement.trim() ||
        !customAttachAlias.trim()
      );
    }
    return !databasePath.trim();
  }, [
    isWasmActive,
    selectedDatabase,
    postgresHost,
    postgresUser,
    postgresDatabase,
    mysqlHost,
    mysqlUser,
    mysqlDatabase,
    customExtensionName,
    customAttachStatement,
    customAttachAlias,
    sqlitePath,
    databasePath,
  ]);

  const renderDatabaseSelector = () => (
    <div className="grid grid-cols-1 gap-2">
      {DATABASE_OPTIONS.map((opt) => {
        const isSelected = selectedDatabase === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setSelectedDatabase(opt.value);
              setMotherDuckConnectionState("idle");
              setHasConnected(false);
              setSchemas([]);
              setSelectedSchema("");
              setSchemaTablesPreview([]);
              setSelectedTables(new Set());
              setErrorMessage(null);
              motherDuckAttachPromiseRef.current = null;
            }}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
              isSelected
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-accent/30 hover:text-foreground",
            )}
          >
            <LinkIcon className="h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium text-foreground">{opt.label}</p>
              {opt.description && (
                <p className="text-xs text-muted-foreground">
                  {opt.description}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );

  const renderConnectionForm = () => {
    if (!selectedDatabase) return null;

    if (selectedDatabase === "postgres") {
      return (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Postgres Connection</h3>
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <Input
              placeholder="Host (e.g. localhost or db.example.com)"
              value={postgresHost}
              onChange={(e) => setPostgresHost(e.target.value)}
            />
            <Input
              placeholder="Port"
              value={postgresPort}
              onChange={(e) => setPostgresPort(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Username"
              value={postgresUser}
              onChange={(e) => setPostgresUser(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Password"
              value={postgresPassword}
              onChange={(e) => setPostgresPassword(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Database name"
              value={postgresDatabase}
              onChange={(e) => setPostgresDatabase(e.target.value)}
            />
            <Input
              placeholder="SSL mode (optional)"
              value={postgresSslMode}
              onChange={(e) => setPostgresSslMode(e.target.value)}
            />
          </div>
        </div>
      );
    }

    if (selectedDatabase === "mysql") {
      return (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">MySQL Connection</h3>
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <Input
              placeholder="Host"
              value={mysqlHost}
              onChange={(e) => setMysqlHost(e.target.value)}
            />
            <Input
              placeholder="Port"
              value={mysqlPort}
              onChange={(e) => setMysqlPort(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Username"
              value={mysqlUser}
              onChange={(e) => setMysqlUser(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Password"
              value={mysqlPassword}
              onChange={(e) => setMysqlPassword(e.target.value)}
            />
          </div>
          <Input
            placeholder="Database name"
            value={mysqlDatabase}
            onChange={(e) => setMysqlDatabase(e.target.value)}
          />
        </div>
      );
    }

    if (selectedDatabase === "sqlite") {
      return (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">SQLite Database</h3>
          <Input
            placeholder="Path to .db or .sqlite file (e.g. /data/app.db)"
            value={sqlitePath}
            onChange={(e) => setSqlitePath(e.target.value)}
          />
          <Input
            placeholder="Attach as alias (e.g. mydb)"
            value={sqliteAlias}
            onChange={(e) => setSqliteAlias(e.target.value)}
          />
        </div>
      );
    }

    if (selectedDatabase === "motherduck") {
      return (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">MotherDuck</h3>
          <Input
            placeholder="Database name (e.g. my_db)"
            value={databasePath}
            onChange={(e) => setDatabasePath(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            This flow attaches <code>md:&lt;database&gt;</code> on the remote
            DuckDB runtime and relies on MotherDuck&apos;s interactive login in
            that shell. After starting the connection, check your DuckDB CLI or
            server logs for the authentication link, finish login, then return
            here and confirm.
          </p>
          <p className="text-xs text-muted-foreground">
            If you want the login to persist across restarts, save your access
            token as <code>motherduck_token</code> in the environment used to
            launch DuckDB, for example with{" "}
            <code>export motherduck_token=&apos;&lt;token&gt;&apos;</code>, or
            by adding it to <code>~/.zprofile</code>,{" "}
            <code>~/.bash_profile</code>, or a local <code>.env</code> file.
            Restart the app/runtime after setting it.
          </p>
        </div>
      );
    }

    if (selectedDatabase === "extension") {
      return (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Custom Extension</h3>
          <Input
            placeholder="Extension name (e.g. httpfs)"
            value={customExtensionName}
            onChange={(e) => setCustomExtensionName(e.target.value)}
          />
          <Input
            placeholder="ATTACH statement (e.g. ATTACH '...' AS myalias (TYPE httpfs))"
            value={customAttachStatement}
            onChange={(e) => setCustomAttachStatement(e.target.value)}
          />
          <Input
            placeholder="Alias (e.g. myalias)"
            value={customAttachAlias}
            onChange={(e) => setCustomAttachAlias(e.target.value)}
          />
        </div>
      );
    }

    return null;
  };

  const renderSchemaAndTableSelection = () => {
    if (selectedDatabase === "motherduck") {
      return (
        <div className="space-y-4">
          {motherDuckConnectionState === "auth_pending" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <h3 className="text-sm font-semibold">Finish MotherDuck Login</h3>
              <p className="text-sm text-muted-foreground">
                The remote DuckDB shell should now be attempting to attach
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
                  {buildMotherDuckDbIdentifier()}
                </code>
                as{" "}
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
                  {MOTHERDUCK_ALIAS}
                </code>
                .
              </p>
              <p className="text-sm text-muted-foreground">
                Check that shell for the MotherDuck login URL, sign in there,
                and then click Confirm below to load tables from the attached
                database.
              </p>
              <p className="text-xs text-muted-foreground">
                For persistent auth, store your token as{" "}
                <code>motherduck_token</code> in the environment used to start
                DuckDB, then restart the app/runtime before reconnecting.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={handleConfirmMotherDuckClick}
                disabled={isLoadingTables}
                className="w-full"
              >
                {isLoadingTables ? "Confirming…" : "Confirm"}
              </Button>
            </div>
          )}

          {motherDuckConnectionState === "confirmed" && (
            <>
              <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                <CheckCircleIcon className="h-4 w-4" />
                MotherDuck attached as <code>{MOTHERDUCK_ALIAS}</code>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Tables in &ldquo;{MOTHERDUCK_ALIAS}&rdquo;
                </h3>
                {schemaTablesPreview.length > 0 ? (
                  <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                    {schemaTablesPreview.map((t) => {
                      const isChecked = selectedTables.has(t);
                      return (
                        <label
                          key={t}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors",
                            isChecked
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-muted/20 text-muted-foreground hover:bg-accent/30",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-3 w-3"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedTables((prev) => {
                                const next = new Set(prev);
                                if (next.has(t)) {
                                  next.delete(t);
                                } else {
                                  next.add(t);
                                }
                                return next;
                              });
                            }}
                          />
                          {t}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No tables found in this MotherDuck database.
                  </p>
                )}
              </div>

              {schemaTablesPreview.length > 1 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() =>
                      setSelectedTables(new Set(schemaTablesPreview))
                    }
                  >
                    Select all
                  </button>
                  <span className="text-xs text-muted-foreground">·</span>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setSelectedTables(new Set())}
                  >
                    Deselect all
                  </button>
                </div>
              )}

              <div className="space-y-1">
                <label
                  className="block text-sm font-medium"
                  htmlFor="table-description"
                >
                  Description{" "}
                  <span className="text-muted-foreground">(required)</span>
                </label>
                <Input
                  id="table-description"
                  placeholder="Brief description of this data source"
                  value={tableDescription}
                  onChange={(e) => setTableDescription(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      );
    }

    if (!hasConnected) return null;
    const requiresSchema = requiresSchemaSelection(selectedDatabase);

    return (
      <div className="space-y-4">
        {requiresSchema && schemas.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Select Schema</h3>
            <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
              {schemas.map((schema) => {
                const isSelected = selectedSchema === schema;
                return (
                  <button
                    key={schema}
                    type="button"
                    onClick={() => handleSchemaSelect(schema)}
                    className={cn(
                      "rounded border px-2 py-1.5 text-left text-xs transition-colors",
                      isSelected
                        ? "border-primary bg-primary/10 font-medium text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:bg-accent/30 hover:text-foreground",
                    )}
                  >
                    {schema}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {requiresSchema && schemas.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No schemas found for this database.
          </p>
        )}

        {selectedSchema && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              Tables in &ldquo;{selectedSchema}&rdquo;
              {isLoadingTables && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Loading…
                </span>
              )}
            </h3>
            {schemaTablesPreview.length > 0 ? (
              <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                {schemaTablesPreview.map((t) => {
                  const isChecked = selectedTables.has(t);
                  return (
                    <label
                      key={t}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors",
                        isChecked
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-muted/20 text-muted-foreground hover:bg-accent/30",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedTables((prev) => {
                            const next = new Set(prev);
                            if (next.has(t)) {
                              next.delete(t);
                            } else {
                              next.add(t);
                            }
                            return next;
                          });
                        }}
                      />
                      {t}
                    </label>
                  );
                })}
              </div>
            ) : !isLoadingTables ? (
              <p className="text-xs text-muted-foreground">
                No tables found in this schema.
              </p>
            ) : null}
          </div>
        )}

        {/* Select all / deselect all */}
        {schemaTablesPreview.length > 1 && (
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setSelectedTables(new Set(schemaTablesPreview))}
            >
              Select all
            </button>
            <span className="text-xs text-muted-foreground">·</span>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setSelectedTables(new Set())}
            >
              Deselect all
            </button>
          </div>
        )}

        <div className="space-y-1">
          <label
            className="block text-sm font-medium"
            htmlFor="table-description"
          >
            Description{" "}
            <span className="text-muted-foreground">(required)</span>
          </label>
          <Input
            id="table-description"
            placeholder="Brief description of this data source"
            value={tableDescription}
            onChange={(e) => setTableDescription(e.target.value)}
          />
        </div>
      </div>
    );
  };

  const runtimeLabel =
    effectiveSqlBackend === "bridge"
      ? "Bridge"
      : effectiveSqlBackend === "duckdb-http"
        ? "DuckDB over HTTP"
        : "DuckDB WASM";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card shadow-2xl focus:outline-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-foreground">
                Connect Data Source
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {isWasmActive
                  ? "Switch to a remote runtime to enable source connections."
                  : `Using ${runtimeLabel} — DuckDB extensions handle the connection.`}
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

          {/* WASM disabled state */}
          {isWasmActive ? (
            <div className="space-y-3 px-6 py-5">
              <p className="text-sm text-muted-foreground">
                Source connections via DuckDB extensions require a remote
                runtime (Bridge or DuckDB over HTTP). The current active runtime
                is <strong>DuckDB WASM</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                Go to <strong>Settings → Query Runtime</strong> and switch to
                Bridge or DuckDB over HTTP to enable this flow.
              </p>
              <div className="flex justify-end border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-5">
              {/* Step 1: Source type */}
              {!selectedDatabase && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Choose a data source to connect. The selected DuckDB
                    extension will be installed and loaded on the active
                    runtime.
                  </p>
                  {renderDatabaseSelector()}
                </div>
              )}

              {/* Selected source + connection form */}
              {selectedDatabase && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize">
                      {DATABASE_OPTIONS.find(
                        (o) => o.value === selectedDatabase,
                      )?.label ?? selectedDatabase}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSelectedDatabase(null);
                        setMotherDuckConnectionState("idle");
                        setHasConnected(false);
                        setSchemas([]);
                        setSelectedSchema("");
                        setSchemaTablesPreview([]);
                        setSelectedTables(new Set());
                        setErrorMessage(null);
                        motherDuckAttachPromiseRef.current = null;
                      }}
                    >
                      ← Back
                    </button>
                  </div>

                  {renderConnectionForm()}

                  {errorMessage && (
                    <p className="text-sm text-destructive">{errorMessage}</p>
                  )}

                  {selectedDatabase === "motherduck" &&
                    renderSchemaAndTableSelection()}

                  {!hasConnected &&
                    !(
                      selectedDatabase === "motherduck" &&
                      motherDuckConnectionState !== "idle"
                    ) && (
                      <Button
                        type="button"
                        disabled={isConnectDisabled || isLoadingSchemas}
                        onClick={handleConnectClick}
                        className="w-full"
                      >
                        {isLoadingSchemas ? "Connecting…" : "Connect"}
                      </Button>
                    )}

                  {hasConnected && selectedDatabase !== "motherduck" && (
                    <>
                      <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                        <CheckCircleIcon className="h-4 w-4" />
                        Connected
                      </div>
                      {renderSchemaAndTableSelection()}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer (only shown in enabled state and when something is selected) */}
          {!isWasmActive && hasConnected && (
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isAddDisabled}
                onClick={handleAddTable}
              >
                Add Source
              </Button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
