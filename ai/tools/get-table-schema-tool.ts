import { tool } from "ai";
import { z } from "zod";
import { runDuckDbCli } from "@/lib/duckdb/duckdb-cli";

export const getTableSchemaTool = tool({
  description: "Get the schema of a table, including column names and types",
  inputSchema: z.object({
    table: z.string().describe("The table name to get schema for"),
  }),
  execute: async ({ table }) => {
    const sql = `DESCRIBE ${table}`;

    const { code, stdout, stderr } = await runDuckDbCli({
      dbPath: `md:my_db?motherduck_token=${process.env.MOTHERDUCK_TOKEN}`,
      args: [sql],
      json: true,
    });

    if (code !== 0) {
      throw new Error(stderr);
    }

    const results = JSON.parse(stdout) as Array<{
      column_name: string;
      column_type: string;
      null: string;
      key: string;
      default: string | null;
      extra: string | null;
    }>;

    return {
      table,
      columns: results.map((col) => ({
        name: col.column_name,
        type: col.column_type,
        nullable: col.null === "YES",
        key: col.key,
        default: col.default,
        extra: col.extra,
      })),
    };
  },
});
