import {
  DuckDBDataProtocol,
  type AsyncDuckDBConnection,
} from "@duckdb/duckdb-wasm";

import { DuckdbWasmProvider } from "@/lib/duckdb/duckdb-wasm";
import { RequestQueue } from "@/lib/duckdb/request-queue";

interface ExecuteOptions {
  sql: string;
  signal?: AbortSignal;
}

interface ImportBrowserFileOptions {
  file: File;
  registeredName: string;
  schema: string;
  tableName: string;
  format: "csv" | "parquet";
}

type QueryResult = Awaited<ReturnType<AsyncDuckDBConnection["query"]>>;

export class DuckdbWasmClient {
  private readonly provider: DuckdbWasmProvider;
  private readonly queue: RequestQueue;

  constructor(provider: DuckdbWasmProvider = DuckdbWasmProvider.getInstance()) {
    this.provider = provider;
    this.queue = new RequestQueue(1);
  }

  isConnected(): boolean {
    return this.provider.isConnected();
  }

  async destroy(): Promise<void> {
    await this.queue.onIdle();
    await this.provider.destroy();
  }

  async withConnection<T>(
    callback: (connection: AsyncDuckDBConnection) => Promise<T>,
  ): Promise<T> {
    const { con } = await this.provider.getCurrentWasm();
    return callback(con);
  }

  async execute(options: ExecuteOptions): Promise<QueryResult> {
    const task = async () => {
      const { con } = await this.provider.getCurrentWasm();
      const connection = con as AsyncDuckDBConnection & {
        interrupt?: () => void;
      };
      const abort = () => connection.interrupt?.();

      if (options.signal) {
        if (options.signal.aborted) {
          abort();
          throw new DOMException("The operation was aborted.", "AbortError");
        }
        options.signal.addEventListener("abort", abort, { once: true });
      }

      try {
        const result = await connection.query(options.sql);
        return result;
      } finally {
        if (options.signal) {
          options.signal.removeEventListener("abort", abort);
        }
      }
    };

    return this.queue.add(task);
  }

  async mountFilesOnWasm(files: File[]): Promise<void> {
    for (const file of files) {
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      await this.provider
        .getCurrentWasm()
        .then(({ db }) => db.registerFileBuffer(file.name, fileBytes));
    }
  }

  async registerBrowserFile(registeredName: string, file: File): Promise<void> {
    const task = async () => {
      const { db } = await this.provider.getCurrentWasm();
      const database = db as typeof db & {
        registerFileHandle: (
          name: string,
          handle: File,
          protocol: DuckDBDataProtocol,
          directIO: boolean,
        ) => Promise<void>;
      };

      await database.registerFileHandle(
        registeredName,
        file,
        DuckDBDataProtocol.BROWSER_FILEREADER,
        true,
      );
    };

    return this.queue.add(task);
  }

  async unregisterBrowserFile(registeredName: string): Promise<void> {
    const task = async () => {
      const { db } = await this.provider.getCurrentWasm();
      const database = db as typeof db & {
        dropFile?: (name: string) => Promise<void>;
      };

      await database.dropFile?.(registeredName);
    };

    return this.queue.add(task);
  }

  async importBrowserFile(options: ImportBrowserFileOptions): Promise<void> {
    const task = async () => {
      const { db, con } = await this.provider.getCurrentWasm();
      const database = db as typeof db & {
        registerFileHandle: (
          name: string,
          handle: File,
          protocol: DuckDBDataProtocol,
          directIO: boolean,
        ) => Promise<void>;
      };
      await database.registerFileHandle(
        options.registeredName,
        options.file,
        DuckDBDataProtocol.BROWSER_FILEREADER,
        true,
      );

      const schemaSql = `CREATE SCHEMA IF NOT EXISTS ${this.quoteIdentifier(options.schema)}`;
      await con.query(schemaSql);

      const sourceSql =
        options.format === "csv"
          ? `read_csv_auto('${this.escapeSqlString(options.registeredName)}')`
          : `read_parquet('${this.escapeSqlString(options.registeredName)}')`;

      const createTableSql = `CREATE OR REPLACE TABLE ${this.quoteIdentifier(options.schema)}.${this.quoteIdentifier(options.tableName)} AS SELECT * FROM ${sourceSql}`;
      await con.query(createTableSql);
    };

    return this.queue.add(task);
  }

  async insertJSONRows(
    schema: string,
    tableName: string,
    rows: unknown[],
  ): Promise<void> {
    console.log("insertJSONRows: ", schema, tableName, rows);
    const task = async () => {
      const { db, con } = await this.provider.getCurrentWasm();

      // Create schema if it doesn't exist
      const schemaSql = `CREATE SCHEMA IF NOT EXISTS ${this.quoteIdentifier(schema)}`;
      await con.query(schemaSql);

      // Register JSON file
      const fileName = `${schema}_${tableName}.json`;
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(rows));
      await db.registerFileBuffer(fileName, payload);

      // Insert into DuckDB-Wasm from the registered JSON file in the specified schema
      // See DuckDB-Wasm data ingestion docs: https://raw.githubusercontent.com/duckdb/duckdb-web/refs/heads/main/docs/stable/clients/wasm/data_ingestion.md
      const connectionWithInsert = con as AsyncDuckDBConnection & {
        insertJSONFromPath: (
          path: string,
          options: { schema: string; name: string },
        ) => Promise<void>;
      };
      await connectionWithInsert.insertJSONFromPath(fileName, {
        schema: schema,
        name: tableName,
      });
    };

    return this.queue.add(task);
  }

  async dropTable(schema: string, tableName: string): Promise<void> {
    const task = async () => {
      const { con } = await this.provider.getCurrentWasm();
      const dropSql = `DROP TABLE IF EXISTS ${this.quoteIdentifier(schema)}.${this.quoteIdentifier(tableName)}`;
      await con.query(dropSql);
    };

    return this.queue.add(task);
  }

  private quoteIdentifier(identifier: string): string {
    return '"' + identifier.replace(/"/g, '""') + '"';
  }

  private escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
  }
}
