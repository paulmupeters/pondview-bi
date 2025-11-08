import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import { DuckdbWasmProvider } from "@/lib/duckdb/duckdb-wasm";

interface ExecuteOptions {
  sql: string;
  signal?: AbortSignal;
}

type QueryResult = Awaited<ReturnType<AsyncDuckDBConnection["query"]>>;

class AsyncTaskQueue {
  private tail: Promise<unknown> = Promise.resolve();

  add<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail
      .catch(() => {
        // Ignore previous error so queue keeps flowing.
        return undefined;
      })
      .then(task);

    this.tail = run
      .then(() => undefined)
      .catch(() => undefined);

    return run;
  }

  async onIdle(): Promise<void> {
    await this.tail.catch(() => undefined);
  }
}

export class DuckdbWasmClient {
  private readonly provider: DuckdbWasmProvider;
  private readonly queue: AsyncTaskQueue;

  constructor(provider: DuckdbWasmProvider = DuckdbWasmProvider.getInstance()) {
    this.provider = provider;
    this.queue = new AsyncTaskQueue();
  }

  isConnected(): boolean {
    return this.provider.isConnected();
  }

  async destroy(): Promise<void> {
    await this.queue.onIdle();
    await this.provider.destroy();
  }

  async withConnection<T>(callback: (connection: AsyncDuckDBConnection) => Promise<T>): Promise<T> {
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
      await this.provider.getCurrentWasm().then(({db}) => db.registerFileBuffer(file.name, fileBytes));
    }
  }

  async insertJSONRows(schema: string, tableName: string, rows: unknown[]): Promise<void> {
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
        insertJSONFromPath: (path: string, options: { schema: string; name: string }) => Promise<void>;
      };
      await connectionWithInsert.insertJSONFromPath(fileName, { 
        schema: schema,
        name: tableName 
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
}

