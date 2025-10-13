"use server";

import { generateObject } from "ai";
import { runDuckDbCli } from "@/lib/duckdb/duckdb-cli";
import { configSchema, type Result } from "@/lib/types";

function resolveDbPath(dbIdentifier: string): string {
  const id = dbIdentifier.trim();
  if (!id) return ":memory:";
  if (id.startsWith("md:")) {
    // Attach token if not already present
    const hasToken = /motherduck_token=/i.test(id);
    if (hasToken) return id;
    const token = process.env.MOTHERDUCK_TOKEN ?? "";
    // If there's already a query string, append with & otherwise use ?
    const separator = id.includes("?") ? "&" : "?";
    return `${id}${separator}motherduck_token=${token}`;
  }
  return id;
}

export const getTables = async () => {
  const fullDbPath = `md:my_db?motherduck_token=${process.env.MOTHERDUCK_TOKEN}`;
  // Get list of all tables and their schemas
  const tablesResult = await runDuckDbCli({
    dbPath: fullDbPath,
    args: [
      "-json",
      "-c",
      `
              SELECT 
                table_schema,
                table_name,
                table_type
              FROM information_schema.tables 
              WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
              ORDER BY table_schema, table_name
            `,
    ],
  });
  if (tablesResult.code !== 0) {
    throw new Error(tablesResult.stderr);
  }
  const parsedResult = JSON.parse(tablesResult.stdout);
  const filteredResult = parsedResult.filter(
    (table: { table_schema: string; table_name: string; table_type: string }) =>
      table.table_type === "BASE TABLE"
  );
  console.log(filteredResult);
  return filteredResult;
};

export const getSchemas = async (dbIdentifier: string) => {
  const dbPath = resolveDbPath(dbIdentifier);
  const result = await runDuckDbCli({
    dbPath,
    args: [
      "-json",
      "-c",
      `
        SELECT DISTINCT table_schema
        FROM information_schema.tables
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY 1
      `,
    ],
  });
  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to fetch schemas");
  }
  const parsed = JSON.parse(result.stdout) as Array<{ table_schema: string }>;
  return parsed.map((r) => r.table_schema);
};

export const getTablesForSchema = async (
  dbIdentifier: string,
  schema: string,
  limit = 20
) => {
  const dbPath = resolveDbPath(dbIdentifier);
  const safeSchema = schema.replace(/'/g, "''");
  const result = await runDuckDbCli({
    dbPath,
    args: [
      "-json",
      "-c",
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = '${safeSchema}' AND table_type = 'BASE TABLE'
        ORDER BY table_name
        LIMIT ${
          Number.isFinite(limit) ? Math.max(1, Math.min(1000, limit)) : 20
        }
      `,
    ],
  });
  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to fetch tables for schema");
  }
  const parsed = JSON.parse(result.stdout) as Array<{ table_name: string }>;
  return parsed.map((r) => r.table_name);
};

export const generateChartConfig = async (
  results: Result[],
  userQuery: string,
) => {
  "use server";

  try {
    const { object: config } = await generateObject({
      model: "openai/gpt-5-nano",
      system: "You are a data visualization expert.",
      prompt: `Given the following data from a SQL query result, generate the chart config that best visualises the data and answers the users query.
      For multiple groups use multi-lines.

      Here is an example complete config:
      export const chartConfig = {
        type: "pie",
        xKey: "month",
        yKeys: ["sales", "profit", "expenses"],
        colors: {
          sales: "#4CAF50",    // Green for sales
          profit: "#2196F3",   // Blue for profit
          expenses: "#F44336"  // Red for expenses
        },
        legend: true
      }

      User Query:
      ${userQuery}

      Data:
      ${JSON.stringify(results, null, 2)}`,
      schema: configSchema,
    });

    // Override with shadcn theme colors
    const colors: Record<string, string> = {};
    config.yKeys.forEach((key, index) => {
      colors[key] = `hsl(var(--chart-${index + 1}))`;
    });

    const updatedConfig = { ...config, colors };
    return { config: updatedConfig };
  } catch (e) {
    console.error(e);
    throw new Error("Failed to generate chart suggestion");
  }
};
