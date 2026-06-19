import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  LinkIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  runBridgeQuery,
  saveBridgeSourceSecret,
} from "@/lib/bridge/pondview-bridge";
import { appendConnectedTable } from "@/lib/connected-tables";
import {
  buildAttachmentPlan,
  buildDetachStatement,
  quoteIdentifier,
  quoteString as quoteSqlString,
} from "@/lib/duckdb/duckdb-attachments";
import {
  buildMotherDuckIdentifier,
  extractMotherDuckDatabaseName,
} from "@/lib/duckdb/motherduck";
import {
  buildPostgresConnectionString,
  type PostgresUrlComponents,
} from "@/lib/duckdb/path";
import { sanitizeSqlErrorMessage } from "@/lib/sql/error-sanitizer";
import { runQuery } from "@/lib/sql/run-query";
import { isHiddenRuntimeSchema } from "@/lib/sql/runtime-table-schemas";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import {
  persistUploadedFile,
  UPLOADED_FILES_SCHEMA,
  validateUploadableFile,
} from "@/lib/uploaded-files";
import { cn } from "@/lib/utils";
import { readXlsxSheetNames } from "@/lib/xlsx-sheets";

type DatabaseType =
  | "local-file"
  | "httpfs"
  | "quack"
  | "motherduck"
  | "postgres"
  | "mysql"
  | "sqlite"
  | null;

const WASM_COMPATIBLE_DATABASES = new Set<DatabaseType>([
  "local-file",
  "httpfs",
]);

const DATABASE_OPTIONS: Array<{
  label: string;
  value: Exclude<DatabaseType, null>;
  description?: string;
}> = [
  {
    label: "Local file",
    value: "local-file",
    description: "Import CSV, Parquet, or XLSX files",
  },
  {
    label: "HTTPFS",
    value: "httpfs",
    description: "Query HTTP(S) and object-store files",
  },
  {
    label: "Quack",
    value: "quack",
    description: "Connect to a remote DuckDB server",
  },
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
];

const resolveDuckdbExtension = (dbType: DatabaseType): string | undefined => {
  switch (dbType) {
    case "httpfs":
      return "httpfs";
    case "motherduck":
      return "motherduck";
    case "quack":
      return "quack";
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
  onConnected?: () => void;
  initialSelectedDatabase?: DatabaseType;
  initialDatabasePath?: string;
  effectiveSqlBackend?: SqlBackend;
};

type MotherDuckConnectionState = "idle" | "auth_pending" | "confirmed";
type PendingSourceConnection = {
  type: string;
  identifier: string;
  alias: string;
  readOnly: boolean;
  duckdbExtension?: string;
  duckdbExtensionRepository?: string;
  attachOptions?: {
    type?: string;
    token?: string;
    disableSsl?: boolean;
  };
  connectionId?: string;
};

const MOTHERDUCK_ALIAS = "motherduck";

function requiresSchemaSelection(dbType: DatabaseType): boolean {
  return dbType !== "motherduck" && dbType !== "local-file" && !!dbType;
}

export function isWasmCompatibleDatabase(dbType: DatabaseType): boolean {
  return WASM_COMPATIBLE_DATABASES.has(dbType);
}

export function shouldSkipExtensionLoadForWasm(dbType: DatabaseType): boolean {
  return dbType === "httpfs";
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
  throw new Error(
    "Cannot run remote SQL: active runtime is DuckDB WASM. Switch to CLI in Settings.",
  );
}

async function runRuntimeSql(
  effectiveSqlBackend: SqlBackend,
  sql: string,
): Promise<Record<string, unknown>[]> {
  if (effectiveSqlBackend === "duckdb-wasm") {
    const result = await runQuery({
      sql,
      backendPreference: "duckdb-wasm",
      dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
    });
    return result.rows;
  }

  return runRemoteSql(effectiveSqlBackend, sql);
}

function getLocalFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  return lastDot < 0 ? "" : name.slice(lastDot).toLowerCase();
}

export function shouldSelectWorksheetBeforeImport(
  fileName: string,
  effectiveSqlBackend: SqlBackend,
): boolean {
  return (
    effectiveSqlBackend === "bridge" &&
    getLocalFileExtension(fileName) === ".xlsx"
  );
}

export function isRemoteDuckdbUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("s3://") ||
    normalized.startsWith("r2://") ||
    normalized.startsWith("gcs://") ||
    normalized.startsWith("gs://") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("https://")
  );
}

function isObjectStoreDuckdbUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("s3://") ||
    normalized.startsWith("r2://") ||
    normalized.startsWith("gcs://") ||
    normalized.startsWith("gs://")
  );
}

function isHttpDuckdbUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://");
}

type RemoteDuckdbHttpAuthMode = "none" | "bearer" | "header";

export function buildRemoteDuckdbSecretStatement(params: {
  url: string;
  s3KeyId?: string;
  s3Secret?: string;
  s3Region?: string;
  s3Endpoint?: string;
  s3SessionToken?: string;
  httpAuthMode?: RemoteDuckdbHttpAuthMode;
  httpBearerToken?: string;
  httpHeaderName?: string;
  httpHeaderValue?: string;
}): string | null {
  const trimmedUrl = params.url.trim();
  const url = trimmedUrl.toLowerCase();
  if (isHttpDuckdbUrl(url)) {
    const authMode = params.httpAuthMode ?? "none";
    if (authMode === "none") {
      return null;
    }

    const parts = ["TYPE http", `SCOPE ${quoteSqlString(trimmedUrl)}`];
    if (authMode === "bearer") {
      const token = params.httpBearerToken?.trim() ?? "";
      if (!token) {
        throw new Error("Enter a bearer token, or set HTTP auth to None.");
      }
      parts.push(`BEARER_TOKEN ${quoteSqlString(token)}`);
    } else {
      const headerName = params.httpHeaderName?.trim() ?? "";
      const headerValue = params.httpHeaderValue?.trim() ?? "";
      if (!headerName || !headerValue) {
        throw new Error(
          "Enter both HTTP header name and value, or set HTTP auth to None.",
        );
      }
      parts.push(
        `EXTRA_HTTP_HEADERS MAP {${quoteSqlString(headerName)}: ${quoteSqlString(headerValue)}}`,
      );
    }

    return `CREATE OR REPLACE SECRET (${parts.join(", ")});`;
  }

  if (!isObjectStoreDuckdbUrl(url)) {
    return null;
  }

  const secretType = url.startsWith("r2://")
    ? "r2"
    : url.startsWith("gcs://") || url.startsWith("gs://")
      ? "gcs"
      : "s3";
  const parts = [`TYPE ${secretType}`];
  const keyId = params.s3KeyId?.trim() ?? "";
  const secret = params.s3Secret?.trim() ?? "";
  const region = params.s3Region?.trim() ?? "";
  const endpoint = params.s3Endpoint?.trim() ?? "";
  const sessionToken = params.s3SessionToken?.trim() ?? "";

  if (keyId || secret) {
    if (!keyId || !secret) {
      throw new Error("Provide both S3 key ID and secret, or neither.");
    }
    parts.push(`KEY_ID ${quoteSqlString(keyId)}`);
    parts.push(`SECRET ${quoteSqlString(secret)}`);
  } else {
    parts.push("PROVIDER credential_chain");
  }

  if (region) {
    parts.push(`REGION ${quoteSqlString(region)}`);
  }
  if (endpoint) {
    parts.push(`ENDPOINT ${quoteSqlString(endpoint)}`);
  }
  if (sessionToken) {
    parts.push(`SESSION_TOKEN ${quoteSqlString(sessionToken)}`);
  }

  return `CREATE OR REPLACE SECRET (${parts.join(", ")});`;
}

export function normalizeQuackUriInput(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const port = parsed.port ? `:${parsed.port}` : "";
    return `quack:${parsed.hostname}${port}`;
  } catch {
    return trimmed;
  }
}

function isQuackUriInput(value: string): boolean {
  return normalizeQuackUriInput(value).toLowerCase().startsWith("quack:");
}

export function resolveQuackDisableSsl(uriInput: string): boolean | undefined {
  const normalized = uriInput.trim().toLowerCase();
  if (normalized.startsWith("https://")) {
    return false;
  }
  if (normalized.startsWith("http://")) {
    return true;
  }
  if (normalized.startsWith("quack:")) {
    return true;
  }

  return undefined;
}

function buildDuckdbRemoteAlias(value: string): string {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    const fileName = parsed.pathname.split("/").filter(Boolean).pop();
    return (fileName ?? "remote").replace(/\.duckdb$/i, "") || "remote";
  } catch {
    const fileName = trimmed.split(/[/?#]/)[0]?.split("/").pop();
    return (fileName ?? "remote").replace(/\.duckdb$/i, "") || "remote";
  }
}

function buildQuackAlias(value: string): string {
  const normalized = normalizeQuackUriInput(value)
    .replace(/^quack:\/\//i, "")
    .replace(/^quack:/i, "");
  const host = normalized.startsWith("[")
    ? normalized.slice(1, normalized.indexOf("]"))
    : normalized.split(/[/:]/)[0];
  return (host || "quack").replace(/[^A-Za-z0-9_]/g, "_") || "quack";
}

function usesGlobalInformationSchema(sourceType: DatabaseType): boolean {
  return sourceType === "httpfs";
}

export function buildSchemaIntrospectionSql(params: {
  sourceType: DatabaseType;
  alias: string;
}): string {
  if (params.sourceType === "quack") {
    const remoteSql =
      "SELECT DISTINCT table_schema FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog') ORDER BY 1";
    return `SELECT table_schema FROM ${quoteIdentifier(params.alias)}.query(${quoteSqlString(remoteSql)})`;
  }

  if (usesGlobalInformationSchema(params.sourceType)) {
    return `SELECT DISTINCT table_schema FROM information_schema.tables WHERE table_catalog = ${quoteSqlString(params.alias)} AND table_schema NOT IN ('information_schema', 'pg_catalog') ORDER BY 1`;
  }

  return `SELECT DISTINCT table_schema FROM ${quoteIdentifier(params.alias)}.information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog') ORDER BY 1`;
}

export function buildTablePreviewSql(params: {
  sourceType: DatabaseType;
  alias: string;
  schema: string;
  limit?: number;
}): string {
  const safeSchema = quoteSqlString(params.schema);
  const limitClause =
    typeof params.limit === "number" ? ` LIMIT ${params.limit}` : "";
  if (params.sourceType === "quack") {
    const remoteSql = `SELECT table_name FROM information_schema.tables WHERE table_schema = ${safeSchema} AND table_type = 'BASE TABLE' ORDER BY table_name${limitClause}`;
    return `SELECT table_name FROM ${quoteIdentifier(params.alias)}.query(${quoteSqlString(remoteSql)})`;
  }

  if (usesGlobalInformationSchema(params.sourceType)) {
    return `SELECT table_name FROM information_schema.tables WHERE table_catalog = ${quoteSqlString(params.alias)} AND table_schema = ${safeSchema} AND table_type = 'BASE TABLE' ORDER BY table_name${limitClause}`;
  }

  return `SELECT table_name FROM ${quoteIdentifier(params.alias)}.information_schema.tables WHERE table_schema = ${safeSchema} AND table_type = 'BASE TABLE' ORDER BY table_name${limitClause}`;
}

export function ConnectDataDialog({
  open,
  onOpenChange,
  onConnected,
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
  // HTTPFS remote file fields
  const [remoteDuckdbUrl, setRemoteDuckdbUrl] = useState("");
  const [remoteDuckdbAlias, setRemoteDuckdbAlias] = useState("");
  const [remoteDuckdbS3Region, setRemoteDuckdbS3Region] = useState("");
  const [remoteDuckdbS3Endpoint, setRemoteDuckdbS3Endpoint] = useState("");
  const [remoteDuckdbS3KeyId, setRemoteDuckdbS3KeyId] = useState("");
  const [remoteDuckdbS3Secret, setRemoteDuckdbS3Secret] = useState("");
  const [remoteDuckdbS3SessionToken, setRemoteDuckdbS3SessionToken] =
    useState("");
  const [remoteDuckdbHttpAuthMode, setRemoteDuckdbHttpAuthMode] =
    useState<RemoteDuckdbHttpAuthMode>("none");
  const [remoteDuckdbHttpBearerToken, setRemoteDuckdbHttpBearerToken] =
    useState("");
  const [remoteDuckdbHttpHeaderName, setRemoteDuckdbHttpHeaderName] =
    useState("");
  const [remoteDuckdbHttpHeaderValue, setRemoteDuckdbHttpHeaderValue] =
    useState("");
  // Quack remote DuckDB fields
  const [quackUri, setQuackUri] = useState("");
  const [quackAlias, setQuackAlias] = useState("");
  const [quackToken, setQuackToken] = useState("");
  // Local file import fields
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localXlsxSheets, setLocalXlsxSheets] = useState<string[]>([]);
  const [localXlsxSheet, setLocalXlsxSheet] = useState("");
  const [isReadingLocalFile, setIsReadingLocalFile] = useState(false);
  const [isImportingLocalFile, setIsImportingLocalFile] = useState(false);
  const [localImportMessage, setLocalImportMessage] = useState<string | null>(
    null,
  );
  const [schemas, setSchemas] = useState<string[]>([]);
  const [schemaTablesForPersistence, setSchemaTablesForPersistence] = useState<
    string[]
  >([]);
  const [selectedSchema, setSelectedSchema] = useState<string>("");
  const [schemaTablesPreview, setSchemaTablesPreview] = useState<string[]>([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [hasConnected, setHasConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const motherDuckAttachPromiseRef = useRef<Promise<void> | null>(null);
  const pendingSourceRef = useRef<PendingSourceConnection | null>(null);

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
    setRemoteDuckdbUrl("");
    setRemoteDuckdbAlias("");
    setRemoteDuckdbS3Region("");
    setRemoteDuckdbS3Endpoint("");
    setRemoteDuckdbS3KeyId("");
    setRemoteDuckdbS3Secret("");
    setRemoteDuckdbS3SessionToken("");
    setRemoteDuckdbHttpAuthMode("none");
    setRemoteDuckdbHttpBearerToken("");
    setRemoteDuckdbHttpHeaderName("");
    setRemoteDuckdbHttpHeaderValue("");
    setQuackUri("");
    setQuackAlias("");
    setQuackToken("");
    setLocalFile(null);
    setLocalXlsxSheets([]);
    setLocalXlsxSheet("");
    setIsReadingLocalFile(false);
    setIsImportingLocalFile(false);
    setLocalImportMessage(null);
    setSchemas([]);
    setSelectedSchema("");
    setSchemaTablesPreview([]);
    setSchemaTablesForPersistence([]);
    setHasConnected(false);
    setErrorMessage(null);
    motherDuckAttachPromiseRef.current = null;
    pendingSourceRef.current = null;
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

  const buildRemoteDuckdbConnection = useCallback(() => {
    const identifier = remoteDuckdbUrl.trim();
    return {
      type: "httpfs",
      identifier,
      alias:
        remoteDuckdbAlias.trim() ||
        buildDuckdbRemoteAlias(identifier) ||
        "remote",
      readOnly: true,
      duckdbExtension: "httpfs",
    };
  }, [remoteDuckdbUrl, remoteDuckdbAlias]);

  const buildQuackConnection = useCallback((): PendingSourceConnection => {
    const identifier = normalizeQuackUriInput(quackUri);
    return {
      type: "quack",
      identifier,
      alias: quackAlias.trim() || buildQuackAlias(identifier),
      readOnly: false,
      duckdbExtension: "quack",
      attachOptions: {
        type: "quack",
        token: quackToken.trim() || undefined,
        disableSsl: resolveQuackDisableSsl(quackUri),
      },
    };
  }, [quackUri, quackAlias, quackToken]);

  const buildSourceConnectionId = useCallback(
    (type: string, alias: string): string =>
      `${type}:${alias.trim() || "source"}`.replace(/[^A-Za-z0-9:_-]/g, "_"),
    [],
  );

  const prepareConnectionForRuntime = useCallback(
    async (
      connection: PendingSourceConnection,
    ): Promise<PendingSourceConnection> => {
      if (effectiveSqlBackend !== "bridge") {
        return connection;
      }

      const connectionId = buildSourceConnectionId(
        connection.type,
        connection.alias,
      );
      await saveBridgeSourceSecret(connectionId, {
        type: connection.type,
        identifier: connection.identifier,
        alias: connection.alias,
        readonly: connection.readOnly,
        duckdbExtension: connection.duckdbExtension,
        duckdbExtensionRepository: connection.duckdbExtensionRepository,
        attachOptions: connection.attachOptions,
      });
      return {
        ...connection,
        identifier: connectionId,
        connectionId,
        attachOptions: undefined,
      };
    },
    [buildSourceConnectionId, effectiveSqlBackend],
  );

  const buildRemoteDuckdbSecretStatementFromState = useCallback(():
    | string
    | null => {
    return buildRemoteDuckdbSecretStatement({
      url: remoteDuckdbUrl,
      s3KeyId: remoteDuckdbS3KeyId,
      s3Secret: remoteDuckdbS3Secret,
      s3Region: remoteDuckdbS3Region,
      s3Endpoint: remoteDuckdbS3Endpoint,
      s3SessionToken: remoteDuckdbS3SessionToken,
      httpAuthMode: remoteDuckdbHttpAuthMode,
      httpBearerToken: remoteDuckdbHttpBearerToken,
      httpHeaderName: remoteDuckdbHttpHeaderName,
      httpHeaderValue: remoteDuckdbHttpHeaderValue,
    });
  }, [
    remoteDuckdbUrl,
    remoteDuckdbS3KeyId,
    remoteDuckdbS3Secret,
    remoteDuckdbS3Region,
    remoteDuckdbS3Endpoint,
    remoteDuckdbS3SessionToken,
    remoteDuckdbHttpAuthMode,
    remoteDuckdbHttpBearerToken,
    remoteDuckdbHttpHeaderName,
    remoteDuckdbHttpHeaderValue,
  ]);

  const shouldCreateRemoteDuckdbSecret = useCallback((): boolean => {
    if (!isWasmActive) {
      return true;
    }

    return Boolean(
      remoteDuckdbS3KeyId.trim() ||
        remoteDuckdbS3Secret.trim() ||
        remoteDuckdbS3Region.trim() ||
        remoteDuckdbS3Endpoint.trim() ||
        remoteDuckdbS3SessionToken.trim() ||
        remoteDuckdbHttpAuthMode !== "none" ||
        remoteDuckdbHttpBearerToken.trim() ||
        remoteDuckdbHttpHeaderName.trim() ||
        remoteDuckdbHttpHeaderValue.trim(),
    );
  }, [
    isWasmActive,
    remoteDuckdbS3KeyId,
    remoteDuckdbS3Secret,
    remoteDuckdbS3Region,
    remoteDuckdbS3Endpoint,
    remoteDuckdbS3SessionToken,
    remoteDuckdbHttpAuthMode,
    remoteDuckdbHttpBearerToken,
    remoteDuckdbHttpHeaderName,
    remoteDuckdbHttpHeaderValue,
  ]);

  const buildCurrentSourceConnection =
    useCallback((): PendingSourceConnection => {
      if (selectedDatabase === "httpfs") {
        return buildRemoteDuckdbConnection();
      }
      if (selectedDatabase === "quack") {
        return buildQuackConnection();
      }

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
      return {
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
    }, [
      selectedDatabase,
      buildRemoteDuckdbConnection,
      buildQuackConnection,
      buildPostgresConnectionStringFromFields,
      buildMysqlConnectionStringFromFields,
      sqlitePath,
      databasePath,
      postgresDatabase,
      mysqlDatabase,
      sqliteAlias,
    ]);

  const buildSourceTypeForIntrospection = useCallback(
    (): DatabaseType => selectedDatabase,
    [selectedDatabase],
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
      setSchemaTablesForPersistence(tableNames);
      setHasConnected(true);
      setMotherDuckConnectionState("confirmed");
    } catch (e: unknown) {
      const msg = sanitizeSqlErrorMessage(
        e instanceof Error ? e.message : String(e ?? ""),
      );
      setErrorMessage(
        msg || "Failed to confirm MotherDuck authentication or load tables.",
      );
    } finally {
      setIsLoadingTables(false);
    }
  }, [isWasmActive, effectiveSqlBackend, runMotherDuckAttachSequence]);

  const handleLocalFileChange = useCallback(
    async (file: File | null) => {
      setLocalFile(file);
      setLocalXlsxSheets([]);
      setLocalXlsxSheet("");
      setLocalImportMessage(null);
      setHasConnected(false);
      setErrorMessage(null);

      if (!file) {
        return;
      }

      const validationError = validateUploadableFile(file);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }

      if (!shouldSelectWorksheetBeforeImport(file.name, effectiveSqlBackend)) {
        return;
      }

      try {
        setIsReadingLocalFile(true);
        const sheetNames = await readXlsxSheetNames(file);
        if (sheetNames.length === 0) {
          setErrorMessage("No worksheets were found in this XLSX file.");
          return;
        }
        setLocalXlsxSheets(sheetNames);
        setLocalXlsxSheet(sheetNames[0] ?? "");
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to read worksheets from this XLSX file.",
        );
      } finally {
        setIsReadingLocalFile(false);
      }
    },
    [effectiveSqlBackend],
  );

  const handleImportLocalFile = useCallback(async () => {
    if (!localFile || isImportingLocalFile || isReadingLocalFile) {
      return;
    }

    const needsSheet = shouldSelectWorksheetBeforeImport(
      localFile.name,
      effectiveSqlBackend,
    );
    if (needsSheet && !localXlsxSheet) {
      setErrorMessage("Select a worksheet before importing this XLSX file.");
      return;
    }

    try {
      setIsImportingLocalFile(true);
      setErrorMessage(null);
      setLocalImportMessage(null);
      const uploadedFile = await persistUploadedFile(localFile, {
        backend: effectiveSqlBackend,
        xlsxSheet: needsSheet ? localXlsxSheet : undefined,
      });
      const tableRef =
        uploadedFile.schemaName && uploadedFile.tableName
          ? `${uploadedFile.schemaName}.${uploadedFile.tableName}`
          : UPLOADED_FILES_SCHEMA;
      setHasConnected(true);
      setLocalImportMessage(
        uploadedFile.importStatus === "imported"
          ? `Imported ${uploadedFile.originalName} as ${tableRef}.`
          : `Stored ${uploadedFile.originalName}. ${uploadedFile.importError ?? ""}`.trim(),
      );
      onConnected?.();
    } catch (error) {
      setErrorMessage(
        sanitizeSqlErrorMessage(
          error instanceof Error ? error.message : String(error ?? ""),
        ) || "Failed to import file.",
      );
    } finally {
      setIsImportingLocalFile(false);
    }
  }, [
    effectiveSqlBackend,
    isImportingLocalFile,
    isReadingLocalFile,
    localFile,
    localXlsxSheet,
    onConnected,
  ]);

  const handleConnectClick = useCallback(async () => {
    if (selectedDatabase === "local-file") {
      await handleImportLocalFile();
      return;
    }
    if (isWasmActive && !isWasmCompatibleDatabase(selectedDatabase)) return;

    // Field validation
    if (selectedDatabase === "httpfs") {
      if (!remoteDuckdbUrl.trim()) {
        setErrorMessage("Enter a remote file URL.");
        return;
      }
      if (!isRemoteDuckdbUrl(remoteDuckdbUrl)) {
        setErrorMessage(
          "Use an s3://, r2://, gcs://, gs://, http://, or https:// URL.",
        );
        return;
      }
    } else if (selectedDatabase === "quack") {
      if (!quackUri.trim()) {
        setErrorMessage("Enter a Quack URI.");
        return;
      }
      if (!isQuackUriInput(quackUri)) {
        setErrorMessage(
          "Use a Quack URI such as quack:localhost:9494, or an HTTP(S) endpoint URL.",
        );
        return;
      }
    } else if (selectedDatabase === "postgres") {
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
    } else if (selectedDatabase === "motherduck" && !databasePath.trim()) {
      setErrorMessage("Enter a database identifier before connecting.");
      return;
    }

    try {
      setIsLoadingSchemas(true);
      setErrorMessage(null);

      if (selectedDatabase === "motherduck") {
        setSchemas([]);
        setSelectedSchema("");
        setSchemaTablesPreview([]);
        setSchemaTablesForPersistence([]);
        setHasConnected(false);
        setMotherDuckConnectionState("auth_pending");

        const attachPromise = runMotherDuckAttachSequence(databasePath);
        motherDuckAttachPromiseRef.current = attachPromise;
        void attachPromise
          .catch((e: unknown) => {
            const msg = sanitizeSqlErrorMessage(
              e instanceof Error ? e.message : String(e ?? ""),
            );
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
      }

      const rawConnection = buildCurrentSourceConnection();
      const connection = await prepareConnectionForRuntime(rawConnection);
      pendingSourceRef.current = connection;

      const plan = buildAttachmentPlan(connection, {
        skipExtensionLoad:
          isWasmActive && shouldSkipExtensionLoadForWasm(selectedDatabase),
      });

      // Execute INSTALL/LOAD/ATTACH
      const secretStatement =
        selectedDatabase === "httpfs" && shouldCreateRemoteDuckdbSecret()
          ? buildRemoteDuckdbSecretStatementFromState()
          : null;
      if (secretStatement) {
        await runRuntimeSql(effectiveSqlBackend, secretStatement);
      }
      for (const stmt of plan.statements) {
        await runRuntimeSql(effectiveSqlBackend, stmt);
      }

      // Introspect schemas from the attached alias
      const schemaRows = await runRuntimeSql(
        effectiveSqlBackend,
        buildSchemaIntrospectionSql({
          sourceType: buildSourceTypeForIntrospection(),
          alias: plan.alias,
        }),
      );
      const fetchedSchemas = schemaRows
        .map((r) => String(r.table_schema ?? ""))
        .filter((schema) => !isHiddenRuntimeSchema(schema))
        .filter(Boolean);
      setSchemas(fetchedSchemas);
      setHasConnected(true);

      // Detach to keep the remote runtime clean; re-attach happens on each interaction
      try {
        await runRuntimeSql(
          effectiveSqlBackend,
          buildDetachStatement(plan.alias, { ifExists: true }),
        );
      } catch {
        // Best-effort detach; ignore errors
      }
    } catch (e: unknown) {
      const msg = sanitizeSqlErrorMessage(
        e instanceof Error ? e.message : String(e ?? ""),
      );
      setErrorMessage(msg || "Failed to connect or fetch schemas.");
    } finally {
      setIsLoadingSchemas(false);
    }
  }, [
    isWasmActive,
    databasePath,
    selectedDatabase,
    remoteDuckdbUrl,
    buildCurrentSourceConnection,
    buildSourceTypeForIntrospection,
    buildRemoteDuckdbSecretStatementFromState,
    shouldCreateRemoteDuckdbSecret,
    quackUri,
    postgresHost,
    postgresUser,
    postgresDatabase,
    mysqlHost,
    mysqlUser,
    mysqlDatabase,
    sqlitePath,
    effectiveSqlBackend,
    prepareConnectionForRuntime,
    runMotherDuckAttachSequence,
    handleImportLocalFile,
  ]);

  const handleSchemaSelect = useCallback(
    async (schema: string) => {
      if (isWasmActive && !isWasmCompatibleDatabase(selectedDatabase)) return;
      setSelectedSchema(schema);
      try {
        setIsLoadingTables(true);

        const rawConnection = buildCurrentSourceConnection();
        const connection = await prepareConnectionForRuntime(rawConnection);
        pendingSourceRef.current = connection;
        const plan = buildAttachmentPlan(connection, {
          skipExtensionLoad:
            isWasmActive && shouldSkipExtensionLoadForWasm(selectedDatabase),
        });

        const secretStatement =
          selectedDatabase === "httpfs" && shouldCreateRemoteDuckdbSecret()
            ? buildRemoteDuckdbSecretStatementFromState()
            : null;
        if (secretStatement) {
          await runRuntimeSql(effectiveSqlBackend, secretStatement);
        }
        for (const stmt of plan.statements) {
          await runRuntimeSql(effectiveSqlBackend, stmt);
        }

        const tableRows = await runRuntimeSql(
          effectiveSqlBackend,
          buildTablePreviewSql({
            sourceType: buildSourceTypeForIntrospection(),
            alias: plan.alias,
            schema,
            limit: 20,
          }),
        );
        const allTableRows = await runRuntimeSql(
          effectiveSqlBackend,
          buildTablePreviewSql({
            sourceType: buildSourceTypeForIntrospection(),
            alias: plan.alias,
            schema,
          }),
        );
        setSchemaTablesPreview(
          tableRows.map((r) => String(r.table_name ?? "")).filter(Boolean),
        );
        setSchemaTablesForPersistence(
          allTableRows.map((r) => String(r.table_name ?? "")).filter(Boolean),
        );

        try {
          await runRuntimeSql(
            effectiveSqlBackend,
            buildDetachStatement(plan.alias, { ifExists: true }),
          );
        } catch {
          // Best-effort
        }
      } catch (e: unknown) {
        setSchemaTablesPreview([]);
        setSchemaTablesForPersistence([]);
        const msg = sanitizeSqlErrorMessage(
          e instanceof Error ? e.message : String(e ?? ""),
        );
        setErrorMessage(`Failed to load tables: ${msg}`);
      } finally {
        setIsLoadingTables(false);
      }
    },
    [
      isWasmActive,
      selectedDatabase,
      buildCurrentSourceConnection,
      buildSourceTypeForIntrospection,
      buildRemoteDuckdbSecretStatementFromState,
      shouldCreateRemoteDuckdbSecret,
      effectiveSqlBackend,
      prepareConnectionForRuntime,
    ],
  );

  const handleAddTable = useCallback(async () => {
    if (isWasmActive && !isWasmCompatibleDatabase(selectedDatabase)) return;
    if (!hasConnected || !selectedDatabase) {
      return;
    }

    try {
      if (selectedDatabase !== "motherduck") {
        const rawConnection = buildCurrentSourceConnection();
        const connection = await prepareConnectionForRuntime(rawConnection);
        pendingSourceRef.current = connection;

        const plan = buildAttachmentPlan(connection, {
          skipExtensionLoad:
            isWasmActive && shouldSkipExtensionLoadForWasm(selectedDatabase),
        });
        try {
          await runRuntimeSql(
            effectiveSqlBackend,
            buildDetachStatement(plan.alias, { ifExists: true }),
          );
        } catch {
          // Best-effort cleanup before the final attach.
        }

        const secretStatement =
          selectedDatabase === "httpfs" && shouldCreateRemoteDuckdbSecret()
            ? buildRemoteDuckdbSecretStatementFromState()
            : null;
        if (secretStatement) {
          await runRuntimeSql(effectiveSqlBackend, secretStatement);
        }
        for (const stmt of plan.statements) {
          await runRuntimeSql(effectiveSqlBackend, stmt);
        }
      }

      const source = pendingSourceRef.current;
      if (source) {
        await appendConnectedTable({
          type: source.type,
          connectionId:
            source.connectionId ??
            (effectiveSqlBackend === "bridge" ? source.identifier : undefined),
          databaseName:
            selectedDatabase === "postgres"
              ? postgresDatabase.trim()
              : selectedDatabase === "mysql"
                ? mysqlDatabase.trim()
                : selectedDatabase === "sqlite"
                  ? sqlitePath.trim()
                  : selectedDatabase === "httpfs"
                    ? remoteDuckdbUrl.trim()
                    : selectedDatabase === "quack"
                      ? normalizeQuackUriInput(quackUri)
                      : databasePath.trim(),
          schema: selectedSchema || undefined,
          tables: schemaTablesForPersistence,
          attachAs: source.alias,
          readOnly: source.readOnly,
          duckdbExtension: source.duckdbExtension,
          duckdbExtensionRepository: source.duckdbExtensionRepository,
        });
      }

      onConnected?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to attach data source", error);
      setErrorMessage(
        sanitizeSqlErrorMessage(
          error instanceof Error ? error.message : String(error ?? ""),
        ) || "Failed to attach data source. Please try again.",
      );
    }
  }, [
    hasConnected,
    isWasmActive,
    databasePath,
    remoteDuckdbUrl,
    buildCurrentSourceConnection,
    buildRemoteDuckdbSecretStatementFromState,
    shouldCreateRemoteDuckdbSecret,
    quackUri,
    onConnected,
    onOpenChange,
    selectedDatabase,
    postgresDatabase,
    mysqlDatabase,
    sqlitePath,
    effectiveSqlBackend,
    prepareConnectionForRuntime,
    selectedSchema,
    schemaTablesForPersistence,
  ]);

  const isAddDisabled = useMemo(() => {
    return (
      !hasConnected ||
      selectedDatabase === "local-file" ||
      (requiresSchemaSelection(selectedDatabase) && !selectedSchema)
    );
  }, [hasConnected, selectedDatabase, selectedSchema]);

  const isConnectDisabled = useMemo(() => {
    if (!selectedDatabase) return true;
    if (selectedDatabase === "local-file") {
      const needsSheet =
        localFile &&
        shouldSelectWorksheetBeforeImport(localFile.name, effectiveSqlBackend);
      return (
        !localFile ||
        isReadingLocalFile ||
        isImportingLocalFile ||
        Boolean(needsSheet && !localXlsxSheet)
      );
    }
    if (isWasmActive && !isWasmCompatibleDatabase(selectedDatabase)) {
      return true;
    }

    if (selectedDatabase === "httpfs") {
      if (!remoteDuckdbUrl.trim()) return true;
      if (!isRemoteDuckdbUrl(remoteDuckdbUrl)) return true;
      return false;
    }
    if (selectedDatabase === "quack") {
      return !isQuackUriInput(quackUri);
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
      return !sqlitePath.trim();
    }
    return !databasePath.trim();
  }, [
    isWasmActive,
    selectedDatabase,
    remoteDuckdbUrl,
    quackUri,
    postgresHost,
    postgresUser,
    postgresDatabase,
    mysqlHost,
    mysqlUser,
    mysqlDatabase,
    sqlitePath,
    databasePath,
    localFile,
    localXlsxSheet,
    isReadingLocalFile,
    isImportingLocalFile,
    effectiveSqlBackend,
  ]);

  const availableDatabaseOptions = useMemo(
    () =>
      isWasmActive
        ? DATABASE_OPTIONS.filter((option) =>
            isWasmCompatibleDatabase(option.value),
          )
        : DATABASE_OPTIONS,
    [isWasmActive],
  );

  const renderDatabaseSelector = () => (
    <div className="grid grid-cols-1 gap-2">
      {availableDatabaseOptions.map((opt) => {
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
              setSchemaTablesForPersistence([]);
              setLocalFile(null);
              setLocalXlsxSheets([]);
              setLocalXlsxSheet("");
              setLocalImportMessage(null);
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

    if (selectedDatabase === "local-file") {
      const needsSheet =
        localFile &&
        shouldSelectWorksheetBeforeImport(localFile.name, effectiveSqlBackend);
      return (
        <div className="space-y-3">
          <label
            htmlFor="connect-local-file"
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-accent/30 hover:text-foreground"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            <span>{localFile ? localFile.name : "Choose a local file"}</span>
          </label>
          <input
            id="connect-local-file"
            type="file"
            accept=".csv,.parquet,.xlsx,.xls"
            className="sr-only"
            onChange={(event) => {
              void handleLocalFileChange(event.target.files?.[0] ?? null);
            }}
          />
          <p className="text-xs text-muted-foreground">
            CSV and Parquet import as DuckDB tables in WASM and Bridge. XLSX
            imports as a selected worksheet in Bridge, and is stored only in
            WASM.
          </p>
          {isReadingLocalFile ? (
            <p className="text-xs text-muted-foreground">
              Reading workbook sheets…
            </p>
          ) : null}
          {needsSheet && localXlsxSheets.length > 0 ? (
            <div className="space-y-2">
              <label
                htmlFor="connect-local-file-sheet"
                className="text-xs font-medium text-foreground"
              >
                Worksheet
              </label>
              <select
                id="connect-local-file-sheet"
                value={localXlsxSheet}
                onChange={(event) => setLocalXlsxSheet(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                {localXlsxSheets.map((sheet) => (
                  <option key={sheet} value={sheet}>
                    {sheet}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {localImportMessage ? (
            <div className="flex items-start gap-2 text-xs text-green-600 dark:text-green-400">
              <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{localImportMessage}</span>
            </div>
          ) : null}
          {localImportMessage ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full"
            >
              Done
            </Button>
          ) : null}
        </div>
      );
    }

    if (selectedDatabase === "quack") {
      return (
        <div className="space-y-3">
          <Input
            placeholder="quack:localhost:9494 or http://localhost:9494"
            value={quackUri}
            onChange={(e) => setQuackUri(e.target.value)}
          />
          <Input
            placeholder="Attach as alias (optional)"
            value={quackAlias}
            onChange={(e) => setQuackAlias(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Authentication token (optional)"
            value={quackToken}
            onChange={(e) => setQuackToken(e.target.value)}
          />
        </div>
      );
    }

    if (selectedDatabase === "httpfs") {
      return (
        <div className="space-y-3">
          <Input
            placeholder="s3://, r2://, gcs://, gs://, or https:// URL"
            value={remoteDuckdbUrl}
            onChange={(e) => setRemoteDuckdbUrl(e.target.value)}
          />
          <Input
            placeholder="Attach as alias (optional)"
            value={remoteDuckdbAlias}
            onChange={(e) => setRemoteDuckdbAlias(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            HTTPFS sources query remote files through DuckDB secrets on the
            active Bridge runtime.
          </p>
          {remoteDuckdbUrl.trim() && isObjectStoreDuckdbUrl(remoteDuckdbUrl) ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-medium text-foreground">
                Object-store credentials
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Region (optional)"
                  value={remoteDuckdbS3Region}
                  onChange={(e) => setRemoteDuckdbS3Region(e.target.value)}
                />
                <Input
                  placeholder="Endpoint (optional)"
                  value={remoteDuckdbS3Endpoint}
                  onChange={(e) => setRemoteDuckdbS3Endpoint(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Key ID (optional)"
                  value={remoteDuckdbS3KeyId}
                  onChange={(e) => setRemoteDuckdbS3KeyId(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Secret (optional)"
                  value={remoteDuckdbS3Secret}
                  onChange={(e) => setRemoteDuckdbS3Secret(e.target.value)}
                />
              </div>
              <Input
                type="password"
                placeholder="Session token (optional)"
                value={remoteDuckdbS3SessionToken}
                onChange={(e) => setRemoteDuckdbS3SessionToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave key and secret blank to use the runtime credential chain.
              </p>
            </div>
          ) : null}
          {remoteDuckdbUrl.trim() && isHttpDuckdbUrl(remoteDuckdbUrl) ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-medium text-foreground">HTTP auth</p>
              <select
                value={remoteDuckdbHttpAuthMode}
                onChange={(e) =>
                  setRemoteDuckdbHttpAuthMode(
                    e.target.value as RemoteDuckdbHttpAuthMode,
                  )
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="none">None</option>
                <option value="bearer">Bearer token</option>
                <option value="header">Custom header</option>
              </select>
              {remoteDuckdbHttpAuthMode === "bearer" ? (
                <Input
                  type="password"
                  placeholder="Bearer token"
                  value={remoteDuckdbHttpBearerToken}
                  onChange={(e) =>
                    setRemoteDuckdbHttpBearerToken(e.target.value)
                  }
                />
              ) : null}
              {remoteDuckdbHttpAuthMode === "header" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Header name"
                    value={remoteDuckdbHttpHeaderName}
                    onChange={(e) =>
                      setRemoteDuckdbHttpHeaderName(e.target.value)
                    }
                  />
                  <Input
                    type="password"
                    placeholder="Header value"
                    value={remoteDuckdbHttpHeaderValue}
                    onChange={(e) =>
                      setRemoteDuckdbHttpHeaderValue(e.target.value)
                    }
                  />
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Use this for authenticated HTTPS object URLs, signed gateways,
                or proxy headers. S3 access keys still require an s3://, r2://,
                gcs://, or gs:// URL.
              </p>
            </div>
          ) : null}
        </div>
      );
    }

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
                  <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto rounded border border-border bg-muted/20 p-2 text-xs">
                    {schemaTablesPreview.map((t) => (
                      <div
                        key={t}
                        className="rounded border border-border px-2 py-1.5 text-foreground"
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No tables found in this MotherDuck database.
                  </p>
                )}
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
              <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto rounded border border-border bg-muted/20 p-2 text-xs">
                {schemaTablesPreview.map((t) => (
                  <div
                    key={t}
                    className="rounded border border-border px-2 py-1.5 text-foreground"
                  >
                    {t}
                  </div>
                ))}
              </div>
            ) : !isLoadingTables ? (
              <p className="text-xs text-muted-foreground">
                No tables found in this schema.
              </p>
            ) : null}
          </div>
        )}
      </div>
    );
  };

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
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                aria-label="Close"
              >
                <XMarkIcon className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-5">
            {/* Step 1: Source type */}
            {!selectedDatabase && (
              <div className="space-y-3">{renderDatabaseSelector()}</div>
            )}

            {/* Selected source + connection form */}
            {selectedDatabase && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold capitalize">
                    {DATABASE_OPTIONS.find((o) => o.value === selectedDatabase)
                      ?.label ?? selectedDatabase}
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
                      setSchemaTablesForPersistence([]);
                      setLocalFile(null);
                      setLocalXlsxSheets([]);
                      setLocalXlsxSheet("");
                      setLocalImportMessage(null);
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
                      {selectedDatabase === "local-file"
                        ? isImportingLocalFile
                          ? "Importing…"
                          : "Import"
                        : isLoadingSchemas
                          ? "Connecting…"
                          : "Connect"}
                    </Button>
                  )}

                {hasConnected &&
                  selectedDatabase !== "motherduck" &&
                  selectedDatabase !== "local-file" && (
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

          {/* Footer (only shown in enabled state and when something is selected) */}
          {hasConnected && selectedDatabase !== "local-file" && (
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
                Attach Schema
              </Button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
