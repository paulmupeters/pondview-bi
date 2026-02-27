import {
  CheckCircleIcon,
  LinkIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { appendConnectedTable } from "@/lib/connected-tables";
import {
  buildPostgresConnectionString,
  type PostgresUrlComponents,
} from "@/lib/duckdb/path";
import { useTheme } from "@/lib/theme-provider";
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
    label: "MySQL",
    value: "mysql",
    description: "Connect with a MySQL database",
  },
  {
    label: "SQLite",
    value: "sqlite",
    description: "Attach a SQLite database file",
  },
  {
    label: "Apache Iceberg",
    value: "iceberg",
    description: "Connect to Iceberg tables or REST catalogs",
  },
  {
    label: "Delta Lake",
    value: "delta_lake",
    description: "Query Delta Lake tables",
  },
  {
    label: "DuckLake",
    value: "ducklake",
    description: "Connect to a DuckLake catalog",
  },
  {
    label: "HTTP/HTTPS (httpfs)",
    value: "httpfs",
    description: "Query remote files over HTTP/S via httpfs",
  },
  {
    label: "Custom Extension",
    value: "extension",
    description: "Install + attach a DuckDB extension (advanced)",
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
    case "sqlite":
      return "sqlite";
    case "httpfs":
      return "httpfs";
    case "iceberg":
      return "iceberg";
    case "delta_lake":
      return "delta";
    case "ducklake":
      return "ducklake";
    default:
      return undefined;
  }
};

// Removed unused DuckDB preview constants

async function fetchSchemas(dbIdentifier: string): Promise<string[]> {
  const response = await apiFetch(
    `/api/tables?id=${encodeURIComponent(dbIdentifier)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error || "Failed to fetch schemas.");
  }
  const payload = (await response.json()) as { schemas?: string[] };
  return payload.schemas ?? [];
}

async function fetchTablesForSchema(
  dbIdentifier: string,
  schema: string,
  limit = 20,
): Promise<string[]> {
  const response = await apiFetch(
    `/api/tables?id=${encodeURIComponent(dbIdentifier)}&schema=${encodeURIComponent(schema)}&limit=${limit}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error || "Failed to fetch tables for schema.");
  }
  const payload = (await response.json()) as { tables?: string[] };
  return payload.tables ?? [];
}

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
  const [databasePath, setDatabasePath] = useState("");
  const [motherduckToken, setMotherduckToken] = useState("");
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
  // Iceberg-specific fields
  const [icebergEndpoint, setIcebergEndpoint] = useState("");
  const [icebergWarehouse, setIcebergWarehouse] = useState("");
  const [icebergPath, setIcebergPath] = useState("");
  // Delta Lake-specific fields
  const [deltaPath, setDeltaPath] = useState("");
  const [deltaAlias, setDeltaAlias] = useState("");
  // DuckLake-specific fields
  const [ducklakeMetadataPath, setDucklakeMetadataPath] = useState("");
  const [ducklakeDataPath, setDucklakeDataPath] = useState("");
  const [ducklakeAlias, setDucklakeAlias] = useState("");
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

  const resetState = useCallback(() => {
    setSelectedDatabase(null);
    setDatabasePath("");
    setMotherduckToken("");
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
    setIcebergEndpoint("");
    setIcebergWarehouse("");
    setIcebergPath("");
    setDeltaPath("");
    setDeltaAlias("");
    setDucklakeMetadataPath("");
    setDucklakeDataPath("");
    setDucklakeAlias("");
    setCustomExtensionName("");
    setCustomAttachStatement("");
    setCustomAttachAlias("");
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
        const dbType =
          initialSelectedDatabase === "duckdb"
            ? "motherduck"
            : initialSelectedDatabase;
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
      case "mysql":
        return isDarkMode ? "/mysql-icon-dark.svg" : "/mysql-icon-light.svg";
      case "sqlite":
        return "/file.svg";
      case "iceberg":
        return "/sources/Apache_Iceberg_Logo.svg";
      case "delta_lake":
        return "/sources/delta_lake.png";
      case "ducklake":
        return "/sources/DuckLake_Logo-horizontal.svg";
      case "snowflake":
        return "/sources/snowflake.svg";
      case "web":
        return "/globe.svg";
      default:
        return null;
    }
  };

  // Build Postgres connection string from individual fields
  const buildPostgresConnectionStringFromFields = useCallback((): string => {
    const components: PostgresUrlComponents = {
      host: postgresHost.trim() || "localhost",
      port: parseInt(postgresPort.trim() || "5432", 10),
      user: postgresUser.trim() || "postgres",
      password: postgresPassword,
      database: postgresDatabase.trim() || "postgres",
      sslmode: postgresSslMode.trim() || undefined,
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

  // Extract a friendly database name from the database path
  const extractDatabaseName = useCallback(
    (dbType: DatabaseType, dbPath: string): string => {
      if (dbType === "postgres") {
        // For Postgres, use the database name from the connection string
        return postgresDatabase.trim() || "postgres";
      } else if (dbType === "mysql") {
        return mysqlDatabase.trim() || "mysql";
      } else if (dbType === "extension") {
        return (
          customAttachAlias.trim() || customExtensionName.trim() || "extension"
        );
      } else if (dbType === "motherduck") {
        // For MotherDuck, remove "md:" prefix and query parameters
        const withoutPrefix = dbPath.startsWith("md:")
          ? dbPath.slice(3)
          : dbPath;
        const withoutQuery = withoutPrefix.split("?")[0];
        return withoutQuery.trim() || "motherduck";
      } else {
        // For other types, use the path or a default name
        return dbPath.trim() || dbType || "database";
      }
    },
    [postgresDatabase, mysqlDatabase, customAttachAlias, customExtensionName],
  );

  const handleConnectClick = useCallback(async () => {
    // For Postgres, validate required fields
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
    } else if (selectedDatabase === "iceberg") {
      if (
        (!icebergEndpoint.trim() || !icebergWarehouse.trim()) &&
        !icebergPath.trim()
      ) {
        setErrorMessage(
          "Provide either Iceberg endpoint + warehouse or a direct Iceberg path.",
        );
        return;
      }
    } else if (selectedDatabase === "delta_lake") {
      if (!deltaPath.trim()) {
        setErrorMessage("Enter a Delta Lake table path.");
        return;
      }
    } else if (selectedDatabase === "ducklake") {
      if (!ducklakeMetadataPath.trim()) {
        setErrorMessage("Enter a DuckLake metadata path.");
        return;
      }
    } else if (selectedDatabase === "httpfs") {
      if (!databasePath.trim()) {
        setErrorMessage("Enter an HTTP(S) URL to query.");
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

      // Build database path - prepend "md:" for MotherDuck and add token if provided
      // For Postgres, build connection string from individual fields
      // For MySQL, build connection string from individual fields
      let dbPath: string;
      if (selectedDatabase === "postgres") {
        dbPath = buildPostgresConnectionStringFromFields();
      } else if (selectedDatabase === "mysql") {
        dbPath = buildMysqlConnectionStringFromFields();
      } else if (selectedDatabase === "sqlite") {
        dbPath = `sqlite:${sqlitePath.trim()}`;
      } else if (selectedDatabase === "iceberg") {
        // Skip schema discovery for Iceberg (schema-less)
        setSchemas([]);
        setHasConnected(true);
        return;
      } else if (selectedDatabase === "delta_lake") {
        // Skip schema discovery for Delta Lake (schema-less)
        setSchemas([]);
        setHasConnected(true);
        return;
      } else if (selectedDatabase === "ducklake") {
        // Skip schema discovery for DuckLake (schema-less)
        setSchemas([]);
        setHasConnected(true);
        return;
      } else if (selectedDatabase === "httpfs") {
        // Schema-less; httpfs just needs the extension loaded at query time
        setSchemas([]);
        setHasConnected(true);
        return;
      } else if (selectedDatabase === "extension") {
        // Skip schema discovery for custom extensions
        setSchemas([]);
        setHasConnected(true);
        return;
      } else if (selectedDatabase === "motherduck") {
        dbPath = databasePath.trim();
        dbPath = `md:${dbPath}`;
        if (motherduckToken.trim()) {
          const encodedToken = encodeURIComponent(motherduckToken.trim());
          dbPath = `${dbPath}?motherduck_token=${encodedToken}`;
        }
      } else {
        dbPath = databasePath.trim();
      }

      const fetchedSchemas = await fetchSchemas(dbPath);
      setSchemas(fetchedSchemas);
      setHasConnected(true);
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e ?? "");
      setErrorMessage(msg || "Failed to connect or fetch schemas.");
    } finally {
      setIsLoadingSchemas(false);
    }
  }, [
    databasePath,
    motherduckToken,
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
    icebergEndpoint,
    icebergWarehouse,
    icebergPath,
    deltaPath,
    ducklakeMetadataPath,
  ]);

  const handleSchemaSelect = useCallback(
    async (schema: string) => {
      setSelectedSchema(schema);
      setSelectedTables(new Set());
      try {
        setIsLoadingTables(true);
        // Build database path - prepend "md:" for MotherDuck and add token if provided
        // For Postgres, build connection string from individual fields
        // For MySQL, build connection string from individual fields
        let dbPath: string;
        if (selectedDatabase === "postgres") {
          dbPath = buildPostgresConnectionStringFromFields();
        } else if (selectedDatabase === "mysql") {
          dbPath = buildMysqlConnectionStringFromFields();
        } else if (selectedDatabase === "motherduck") {
          dbPath = databasePath.trim();
          dbPath = `md:${dbPath}`;
          if (motherduckToken.trim()) {
            const encodedToken = encodeURIComponent(motherduckToken.trim());
            dbPath = `${dbPath}?motherduck_token=${encodedToken}`;
          }
        } else {
          dbPath = databasePath.trim();
        }
        console.log("Calling getTablesForSchema with:", { dbPath, schema });
        const tables = await fetchTablesForSchema(dbPath, schema, 20);
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
    },
    [
      databasePath,
      motherduckToken,
      selectedDatabase,
      buildPostgresConnectionStringFromFields,
      buildMysqlConnectionStringFromFields,
    ],
  );

  const handleAddTable = useCallback(async () => {
    const requiresSchema =
      selectedDatabase !== "extension" &&
      !!selectedDatabase &&
      !SCHEMALESS_DATABASES.has(selectedDatabase);

    // For Postgres, validate required fields
    if (selectedDatabase === "postgres") {
      if (
        !postgresHost.trim() ||
        !postgresUser.trim() ||
        !postgresDatabase.trim() ||
        (requiresSchema && !selectedSchema.trim())
      ) {
        console.log("handleAddTable: disabled for Postgres");
        return;
      }
    } else if (selectedDatabase === "mysql") {
      if (
        !mysqlHost.trim() ||
        !mysqlUser.trim() ||
        !mysqlDatabase.trim() ||
        (requiresSchema && !selectedSchema.trim())
      ) {
        console.log("handleAddTable: disabled for MySQL");
        return;
      }
    } else if (selectedDatabase === "sqlite") {
      if (!sqlitePath.trim() || !sqliteAlias.trim()) {
        console.log("handleAddTable: disabled for SQLite");
        return;
      }
    } else if (selectedDatabase === "iceberg") {
      if (
        (!icebergEndpoint.trim() || !icebergWarehouse.trim()) &&
        !icebergPath.trim()
      ) {
        console.log("handleAddTable: disabled for Iceberg");
        return;
      }
    } else if (selectedDatabase === "delta_lake") {
      if (!deltaPath.trim() || !deltaAlias.trim()) {
        console.log("handleAddTable: disabled for Delta Lake");
        return;
      }
    } else if (selectedDatabase === "ducklake") {
      if (!ducklakeMetadataPath.trim() || !ducklakeAlias.trim()) {
        console.log("handleAddTable: disabled for DuckLake");
        return;
      }
    } else if (selectedDatabase === "extension") {
      if (
        !customExtensionName.trim() ||
        !customAttachStatement.trim() ||
        !customAttachAlias.trim()
      ) {
        console.log("handleAddTable: disabled for extension");
        return;
      }
    } else if (
      !selectedDatabase ||
      (requiresSchema && !selectedSchema.trim()) ||
      !databasePath.trim()
    ) {
      console.log("handleAddTable: disabled");
      return;
    }
    try {
      // Build database path - prepend "md:" for MotherDuck and add token if provided
      // For Postgres, build connection string from individual fields
      // For MySQL, build connection string from individual fields
      let dbPath: string;
      if (selectedDatabase === "postgres") {
        dbPath = buildPostgresConnectionStringFromFields();
      } else if (selectedDatabase === "mysql") {
        dbPath = buildMysqlConnectionStringFromFields();
      } else if (selectedDatabase === "sqlite") {
        dbPath = `sqlite:${sqlitePath.trim()}`;
      } else if (selectedDatabase === "iceberg") {
        if (icebergPath.trim()) {
          dbPath = `iceberg:${icebergPath.trim()}`;
        } else {
          const warehouse = icebergWarehouse.trim();
          const endpoint = icebergEndpoint.trim();
          dbPath = `iceberg:${warehouse}?endpoint=${encodeURIComponent(endpoint)}`;
        }
      } else if (selectedDatabase === "delta_lake") {
        dbPath = `delta:${deltaPath.trim()}`;
      } else if (selectedDatabase === "ducklake") {
        const metadata = ducklakeMetadataPath.trim();
        const data = ducklakeDataPath.trim();
        dbPath = `ducklake:${metadata}${data ? `?data_path=${encodeURIComponent(data)}` : ""}`;
      } else if (selectedDatabase === "extension") {
        dbPath = customAttachStatement.trim();
      } else if (selectedDatabase === "motherduck") {
        dbPath = databasePath.trim();
        dbPath = `md:${dbPath}`;
        if (motherduckToken.trim()) {
          const encodedToken = encodeURIComponent(motherduckToken.trim());
          dbPath = `${dbPath}?motherduck_token=${encodedToken}`;
        }
      } else {
        dbPath = databasePath.trim();
      }

      const attachAs =
        selectedDatabase === "extension"
          ? customAttachAlias.trim()
          : selectedDatabase === "sqlite"
            ? sqliteAlias.trim()
            : selectedDatabase === "delta_lake"
              ? deltaAlias.trim()
              : selectedDatabase === "ducklake"
                ? ducklakeAlias.trim()
                : selectedDatabase === "iceberg"
                  ? icebergWarehouse.trim() || dbPath
                  : selectedDatabase === "motherduck"
                    ? databasePath.trim() || "motherduck"
                    : selectedDatabase === "postgres"
                      ? postgresDatabase.trim() || "postgres"
                      : selectedDatabase === "mysql"
                        ? mysqlDatabase.trim() || "mysql"
                        : databasePath.trim() || "source";
      // .trim()
      // .replace(/[^A-Za-z0-9_]/g, "_")
      // .replace(/^_+/g, "")
      // .replace(/_+/g, "_");
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
    databasePath,
    motherduckToken,
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
    icebergEndpoint,
    icebergWarehouse,
    icebergPath,
    deltaPath,
    deltaAlias,
    ducklakeMetadataPath,
    ducklakeDataPath,
    ducklakeAlias,
  ]);

  const isAddDisabled = useMemo(() => {
    const requiresSchema =
      selectedDatabase !== "extension" &&
      !!selectedDatabase &&
      !SCHEMALESS_DATABASES.has(selectedDatabase);

    if (!selectedDatabase || !tableDescription.trim()) {
      return true;
    }

    if (requiresSchema && !selectedSchema.trim()) {
      return true;
    }
    // For Postgres, check individual fields
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
    if (selectedDatabase === "iceberg") {
      return (
        (!icebergEndpoint.trim() || !icebergWarehouse.trim()) &&
        !icebergPath.trim()
      );
    }
    if (selectedDatabase === "delta_lake") {
      return !deltaPath.trim() || !deltaAlias.trim();
    }
    if (selectedDatabase === "ducklake") {
      return !ducklakeMetadataPath.trim() || !ducklakeAlias.trim();
    }
    if (selectedDatabase === "extension") {
      return (
        !customExtensionName.trim() ||
        !customAttachStatement.trim() ||
        !customAttachAlias.trim() ||
        !tableDescription.trim()
      );
    }
    // For other databases, check databasePath
    return !databasePath.trim();
  }, [
    databasePath,
    selectedDatabase,
    selectedSchema,
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
    icebergEndpoint,
    icebergWarehouse,
    icebergPath,
    deltaPath,
    deltaAlias,
    ducklakeMetadataPath,
    ducklakeAlias,
  ]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 fixed left-1/2 top-1/2 z-50 w-full max-w-4xl max-h-[90vh] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card shadow-2xl focus:outline-hidden flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
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

          <div className="space-y-6 px-6 py-5 overflow-y-auto flex-1 min-h-0">
            {schemas.length === 0 && (
              <section className="space-y-3">
                <header className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Database Type
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Select a data source to connect. Some options are coming
                    soon.
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
                          setSelectedSchema("");
                          setSelectedTables(new Set());
                          setHasConnected(false);
                          // Reset Postgres fields when switching away
                          if (option.value !== "postgres") {
                            setPostgresHost("");
                            setPostgresPort("5432");
                            setPostgresUser("");
                            setPostgresPassword("");
                            setPostgresDatabase("");
                            setPostgresSslMode("");
                          }
                          // Reset MySQL fields when switching away
                          if (option.value !== "mysql") {
                            setMysqlHost("");
                            setMysqlPort("3306");
                            setMysqlUser("");
                            setMysqlPassword("");
                            setMysqlDatabase("");
                          }
                          // Reset SQLite fields when switching away
                          if (option.value !== "sqlite") {
                            setSqlitePath("");
                            setSqliteAlias("");
                          }
                          // Reset Iceberg fields when switching away
                          if (option.value !== "iceberg") {
                            setIcebergEndpoint("");
                            setIcebergWarehouse("");
                            setIcebergPath("");
                          }
                          // Reset Delta Lake fields when switching away
                          if (option.value !== "delta_lake") {
                            setDeltaPath("");
                            setDeltaAlias("");
                          }
                          // Reset DuckLake fields when switching away
                          if (option.value !== "ducklake") {
                            setDucklakeMetadataPath("");
                            setDucklakeDataPath("");
                            setDucklakeAlias("");
                          }
                          // Reset custom extension fields when switching away
                          if (option.value !== "extension") {
                            setCustomExtensionName("");
                            setCustomAttachStatement("");
                            setCustomAttachAlias("");
                          }
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
                        ? "Postgres Connection"
                        : selectedDatabase === "mysql"
                          ? "MySQL Connection"
                          : selectedDatabase === "sqlite"
                            ? "SQLite Connection"
                            : selectedDatabase === "iceberg"
                              ? "Apache Iceberg Connection"
                              : selectedDatabase === "delta_lake"
                                ? "Delta Lake Connection"
                                : selectedDatabase === "ducklake"
                                  ? "DuckLake Connection"
                                  : selectedDatabase === "httpfs"
                                    ? "HTTP/HTTPS (httpfs)"
                                    : selectedDatabase === "extension"
                                      ? "Custom Extension"
                                      : "Connection"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedDatabase === "motherduck"
                      ? "Provide the name of your MotherDuck database (e.g., my_db)."
                      : selectedDatabase === "postgres"
                        ? "Enter your Postgres connection details."
                        : selectedDatabase === "mysql"
                          ? "Enter your MySQL connection details."
                          : selectedDatabase === "sqlite"
                            ? "Attach a SQLite database file."
                            : selectedDatabase === "iceberg"
                              ? "Provide a REST catalog endpoint + warehouse or a direct Iceberg table path."
                              : selectedDatabase === "delta_lake"
                                ? "Provide the Delta Lake table path (e.g., s3://bucket/table)."
                                : selectedDatabase === "ducklake"
                                  ? "Provide DuckLake metadata path and optional data path."
                                  : selectedDatabase === "httpfs"
                                    ? "Provide an HTTP(S) URL to query (Parquet/CSV/JSON)."
                                    : selectedDatabase === "extension"
                                      ? "Install + load a DuckDB extension, then attach using your custom statement."
                                      : null}
                  </p>
                </header>
                <div className="flex flex-col gap-3">
                  {selectedDatabase === "postgres" ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label
                            htmlFor="postgres-host"
                            className="text-xs font-medium text-foreground"
                          >
                            Host <span className="text-destructive">*</span>
                          </label>
                          <Input
                            id="postgres-host"
                            placeholder="localhost"
                            value={postgresHost}
                            onChange={(event) =>
                              setPostgresHost(event.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <label
                            htmlFor="postgres-port"
                            className="text-xs font-medium text-foreground"
                          >
                            Port
                          </label>
                          <Input
                            id="postgres-port"
                            type="number"
                            placeholder="5432"
                            value={postgresPort}
                            onChange={(event) =>
                              setPostgresPort(event.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label
                            htmlFor="postgres-user"
                            className="text-xs font-medium text-foreground"
                          >
                            Username <span className="text-destructive">*</span>
                          </label>
                          <Input
                            id="postgres-user"
                            placeholder="postgres"
                            value={postgresUser}
                            onChange={(event) =>
                              setPostgresUser(event.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <label
                            htmlFor="postgres-password"
                            className="text-xs font-medium text-foreground"
                          >
                            Password
                          </label>
                          <Input
                            id="postgres-password"
                            type="password"
                            placeholder="password"
                            value={postgresPassword}
                            onChange={(event) =>
                              setPostgresPassword(event.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="postgres-database"
                          className="text-xs font-medium text-foreground"
                        >
                          Database <span className="text-destructive">*</span>
                        </label>
                        <Input
                          id="postgres-database"
                          placeholder="postgres"
                          value={postgresDatabase}
                          onChange={(event) =>
                            setPostgresDatabase(event.target.value)
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-fit"
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
                  ) : selectedDatabase === "mysql" ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label
                            htmlFor="mysql-host"
                            className="text-xs font-medium text-foreground"
                          >
                            Host <span className="text-destructive">*</span>
                          </label>
                          <Input
                            id="mysql-host"
                            placeholder="localhost"
                            value={mysqlHost}
                            onChange={(event) =>
                              setMysqlHost(event.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <label
                            htmlFor="mysql-port"
                            className="text-xs font-medium text-foreground"
                          >
                            Port
                          </label>
                          <Input
                            id="mysql-port"
                            type="number"
                            placeholder="3306"
                            value={mysqlPort}
                            onChange={(event) =>
                              setMysqlPort(event.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label
                            htmlFor="mysql-user"
                            className="text-xs font-medium text-foreground"
                          >
                            Username <span className="text-destructive">*</span>
                          </label>
                          <Input
                            id="mysql-user"
                            placeholder="root"
                            value={mysqlUser}
                            onChange={(event) =>
                              setMysqlUser(event.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <label
                            htmlFor="mysql-password"
                            className="text-xs font-medium text-foreground"
                          >
                            Password
                          </label>
                          <Input
                            id="mysql-password"
                            type="password"
                            placeholder="password"
                            value={mysqlPassword}
                            onChange={(event) =>
                              setMysqlPassword(event.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="mysql-database"
                          className="text-xs font-medium text-foreground"
                        >
                          Database <span className="text-destructive">*</span>
                        </label>
                        <Input
                          id="mysql-database"
                          placeholder="mysql"
                          value={mysqlDatabase}
                          onChange={(event) =>
                            setMysqlDatabase(event.target.value)
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-fit"
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
                  ) : selectedDatabase === "sqlite" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="sqlite-path"
                          className="text-xs font-medium text-foreground"
                        >
                          Database file path{" "}
                          <span className="text-destructive">*</span>
                        </label>
                        <Input
                          id="sqlite-path"
                          placeholder="/path/to/db.sqlite"
                          value={sqlitePath}
                          onChange={(event) =>
                            setSqlitePath(event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="sqlite-alias"
                          className="text-xs font-medium text-foreground"
                        >
                          Attach alias (AS){" "}
                          <span className="text-destructive">*</span>
                        </label>
                        <Input
                          id="sqlite-alias"
                          placeholder="sqlite_db"
                          value={sqliteAlias}
                          onChange={(event) =>
                            setSqliteAlias(event.target.value)
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-fit"
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
                  ) : selectedDatabase === "iceberg" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="iceberg-endpoint"
                          className="text-xs font-medium text-foreground"
                        >
                          REST catalog endpoint
                        </label>
                        <Input
                          id="iceberg-endpoint"
                          placeholder="https://example.com"
                          value={icebergEndpoint}
                          onChange={(event) =>
                            setIcebergEndpoint(event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="iceberg-warehouse"
                          className="text-xs font-medium text-foreground"
                        >
                          Warehouse (alias)
                        </label>
                        <Input
                          id="iceberg-warehouse"
                          placeholder="warehouse"
                          value={icebergWarehouse}
                          onChange={(event) =>
                            setIcebergWarehouse(event.target.value)
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Alternatively, provide a direct Iceberg path below.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="iceberg-path"
                          className="text-xs font-medium text-foreground"
                        >
                          Direct Iceberg path (optional)
                        </label>
                        <Input
                          id="iceberg-path"
                          placeholder="s3://bucket/db/table/metadata/v2.metadata.json"
                          value={icebergPath}
                          onChange={(event) =>
                            setIcebergPath(event.target.value)
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-fit"
                        onClick={handleConnectClick}
                      >
                        <span className="flex items-center gap-2">
                          <LinkIcon className="size-4" />
                          Validate
                        </span>
                      </Button>
                    </div>
                  ) : selectedDatabase === "delta_lake" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="delta-path"
                          className="text-xs font-medium text-foreground"
                        >
                          Delta Lake path{" "}
                          <span className="text-destructive">*</span>
                        </label>
                        <Input
                          id="delta-path"
                          placeholder="s3://bucket/table"
                          value={deltaPath}
                          onChange={(event) => setDeltaPath(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="delta-alias"
                          className="text-xs font-medium text-foreground"
                        >
                          Attach alias (AS){" "}
                          <span className="text-destructive">*</span>
                        </label>
                        <Input
                          id="delta-alias"
                          placeholder="delta_source"
                          value={deltaAlias}
                          onChange={(event) =>
                            setDeltaAlias(event.target.value)
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-fit"
                        onClick={handleConnectClick}
                      >
                        <span className="flex items-center gap-2">
                          <LinkIcon className="size-4" />
                          Validate
                        </span>
                      </Button>
                    </div>
                  ) : selectedDatabase === "ducklake" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="ducklake-metadata"
                          className="text-xs font-medium text-foreground"
                        >
                          Metadata path{" "}
                          <span className="text-destructive">*</span>
                        </label>
                        <Input
                          id="ducklake-metadata"
                          placeholder="ducklake:metadata.ducklake"
                          value={ducklakeMetadataPath}
                          onChange={(event) =>
                            setDucklakeMetadataPath(event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="ducklake-data"
                          className="text-xs font-medium text-foreground"
                        >
                          Data path (optional)
                        </label>
                        <Input
                          id="ducklake-data"
                          placeholder="s3://bucket/data"
                          value={ducklakeDataPath}
                          onChange={(event) =>
                            setDucklakeDataPath(event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="ducklake-alias"
                          className="text-xs font-medium text-foreground"
                        >
                          Attach alias (AS){" "}
                          <span className="text-destructive">*</span>
                        </label>
                        <Input
                          id="ducklake-alias"
                          placeholder="ducklake_source"
                          value={ducklakeAlias}
                          onChange={(event) =>
                            setDucklakeAlias(event.target.value)
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-fit"
                        onClick={handleConnectClick}
                      >
                        <span className="flex items-center gap-2">
                          <LinkIcon className="size-4" />
                          Validate
                        </span>
                      </Button>
                    </div>
                  ) : selectedDatabase === "extension" ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label
                            htmlFor="extension-name"
                            className="text-xs font-medium text-foreground"
                          >
                            Extension name{" "}
                            <span className="text-destructive">*</span>
                          </label>
                          <Input
                            id="extension-name"
                            placeholder="spatial, parquet, etc."
                            value={customExtensionName}
                            onChange={(event) =>
                              setCustomExtensionName(event.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <label
                            htmlFor="extension-alias"
                            className="text-xs font-medium text-foreground"
                          >
                            Attach alias (AS){" "}
                            <span className="text-destructive">*</span>
                          </label>
                          <Input
                            id="extension-alias"
                            placeholder="my_ext"
                            value={customAttachAlias}
                            onChange={(event) =>
                              setCustomAttachAlias(event.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="extension-attach"
                          className="text-xs font-medium text-foreground"
                        >
                          ATTACH statement (without AS){" "}
                          <span className="text-destructive">*</span>
                        </label>
                        <Input
                          id="extension-attach"
                          placeholder="postgresql://... or s3://... etc."
                          value={customAttachStatement}
                          onChange={(event) =>
                            setCustomAttachStatement(event.target.value)
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          We will run: INSTALL/LOAD{" "}
                          {customExtensionName || "<extension>"} and ATTACH{" "}
                          {"<your statement>"} AS{" "}
                          {customAttachAlias || "<alias>"}.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-fit"
                        onClick={handleConnectClick}
                      >
                        <span className="flex items-center gap-2">
                          <LinkIcon className="size-4" />
                          Validate
                        </span>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Input
                        placeholder={
                          selectedDatabase === "motherduck" ? "my_db" : ""
                        }
                        value={databasePath}
                        onChange={(event) =>
                          setDatabasePath(event.target.value)
                        }
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
                  )}
                  {selectedDatabase === "motherduck" && (
                    <div>
                      <Input
                        type="password"
                        placeholder="MotherDuck token"
                        value={motherduckToken}
                        onChange={(event) =>
                          setMotherduckToken(event.target.value)
                        }
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter your MotherDuck token to connect to a different
                        account
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

          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4 shrink-0">
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
