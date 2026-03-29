import { tool } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";
import { runQuery } from "@/lib/sql/run-query";
import {
  resolveDbIdentifierForSqlBackend,
  resolveSqlBackend,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import type { CardConfig, Config, Result } from "@/lib/types";
import { generateCardConfig } from "./generate-card-config-tool";
import { generateChartConfig } from "./generate-chart-config-tool";

function normalizeRows(rows: Record<string, unknown>[]): Result[] {
  const normalizeValue = (value: unknown): string | number | boolean | Date => {
    if (value instanceof Date) return value;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }
    if (value === null || value === undefined) return "";
    return JSON.stringify(value);
  };

  return rows.map((row) => {
    const normalized: Result = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = normalizeValue(value);
    }
    return normalized;
  });
}

async function executeSqlForRuntime(
  sql: string,
  databasePath?: string,
): Promise<{
  rows: Result[];
  durationMs: number;
  backend: SqlBackend;
  dbIdentifier?: string;
}> {
  const backend = resolveSqlBackend({ dbIdentifier: databasePath });
  const dbIdentifier = resolveDbIdentifierForSqlBackend(databasePath, backend);
  const response = await runQuery({ sql, dbIdentifier });
  return {
    rows: normalizeRows(response.rows),
    durationMs: response.durationMs,
    backend: response.backend,
    dbIdentifier,
  };
}

export const executeSqlTool = tool({
  description:
    "Execute a SQL query and return the results, returns a maximum of 50 rows.",
  inputSchema: z.object({
    sql: z.string().describe("The SQL query to execute"),
    databasePath: z
      .string()
      .optional()
      .describe(
        "Optional database identifier/path to run the SQL against. Omit to use the selected Query Runtime.",
      ),
    userQuery: z.string().optional().describe(
      "The original user query/question that led to this SQL",
    ),
    generateChart: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to generate chart visualization (default: true)"),
  }),
  execute: async ({ sql, userQuery, generateChart, databasePath }) => {
    const artifactId = nanoid();
    const createdAt = Date.now();

    const debugContext = {
      artifactId,
      databasePath,
    };

    let parsedResults: Result[] = [];
    let executionTime = 0;
    let sqlBackend: SqlBackend | undefined;
    let resolvedDatabasePath: string | undefined;
    try {
      const queryResult = await executeSqlForRuntime(sql, databasePath);
      parsedResults = queryResult.rows;
      executionTime = queryResult.durationMs;
      sqlBackend = queryResult.backend;
      resolvedDatabasePath = queryResult.dbIdentifier;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(errorMessage);
    }

    // Extract columns from first row if available
    const columns =
      parsedResults.length > 0
        ? Object.keys(parsedResults[0]).map((key) => ({
            name: key,
            type: "string",
          }))
        : [];

    // Generate insights
    const insights: string[] = [];
    const rowCount = parsedResults.length;

    if (rowCount > 0) {
      insights.push(
        `Query returned ${rowCount} row${rowCount === 1 ? "" : "s"}`,
      );

      if (rowCount === 50) {
        insights.push(
          "Results limited to 50 rows - there may be more data available",
        );
      }

      // Analyze numeric columns for basic statistics
      const numericColumns = columns.filter((col) => {
        const sampleValue = parsedResults[0]?.[col.name];
        return (
          typeof sampleValue === "number" || !Number.isNaN(Number(sampleValue))
        );
      });

      if (numericColumns.length > 0) {
        insights.push(
          `Found ${numericColumns.length} numeric column${
            numericColumns.length === 1 ? "" : "s"
          } for analysis`,
        );
      }
    } else {
      insights.push("Query executed successfully but returned no results");
    }

    // Determine query type
    const queryType = sql.trim().split(/\s+/)[0].toUpperCase();
    // Determine if data is suitable for charting and generate chart config
    let chartConfig: Config | undefined;
    let cardConfig: CardConfig | undefined;
    let visualType: "table" | "chart" | "card" = "table";

    // Check if result is a single value (1 row, 1 column) - suitable for card display
    const isSingleValue = rowCount === 1 && columns.length === 1;

    const isChartWorthy =
      rowCount > 0 && rowCount <= 500 && queryType === "SELECT";
    const hasNumericData = columns.some((col) => {
      const sampleValue = parsedResults[0]?.[col.name];
      return (
        typeof sampleValue === "number" || !Number.isNaN(Number(sampleValue))
      );
    });

    console.debug(
      "[executeSqlTool] Step 4 (visualizing) started",
      debugContext,
    );

    if (isSingleValue && userQuery) {
      try {
        const singleValue = parsedResults[0]?.[columns[0].name];
        const cardResult = await generateCardConfig(
          singleValue,
          columns[0].name,
          userQuery,
        );
        cardConfig = cardResult.config;
        visualType = "card";
        insights.push("Card visualization generated based on single value");
      } catch (error) {
        console.error("Failed to generate card config:", error);
        visualType = "card";
        insights.push("Card view enabled, but config generation failed");
      }
    } else if (isChartWorthy && hasNumericData && userQuery && generateChart) {
      try {
        const chartResult = await generateChartConfig(parsedResults, userQuery);
        chartConfig = chartResult.config;
        visualType = "chart";
        insights.push("Chart visualization generated based on data analysis");
      } catch (error) {
        console.error("Failed to generate chart config:", error);
        insights.push("Chart generation failed, showing table view");
      }
    } else {
      visualType = "table";
      insights.push(
        "Table view enabled, no chart or card visualization generated",
      );
      console.debug(
        "[executeSqlTool] Table view enabled, no chart or card visualization generated",
        {
          ...debugContext,
        },
      );
    }

    console.debug("[executeSqlTool] Step 4 (visualizing) finished", {
      ...debugContext,
      chartConfig,
      cardConfig,
      visualType,
    });

    // Step 4: Complete with results
    const finalData = {
      title: "SQL Query Results",
      stage: "complete" as const,
      progress: 1 as const,
      query: sql,
      dbIdentifier: resolvedDatabasePath,
      sqlBackend,
      executionTime,
      rowCount,
      columns,
      rows: parsedResults,
      visualType,
      chartConfig,
      cardConfig,
      summary: {
        totalRows: rowCount,
        executionTimeMs: executionTime,
        queryType,
        insights,
      },
    };

    console.debug("[executeSqlTool] Step 5 (complete) finished", {
      ...debugContext,
      executionTimeMs: executionTime,
      rowCount,
      visualType,
      hasChartConfig: Boolean(chartConfig),
      actualRowsInPayload: finalData.rows.length,
    });

    const artifactPart = {
      type: "data-execute-sql" as const,
      data: {
        id: artifactId,
        version: 1,
        status: "complete" as const,
        progress: 1,
        payload: finalData,
        createdAt,
        updatedAt: Date.now(),
      },
    };

    // Return the text summary for the AI model
    return {
      text: `Executed ${queryType} query successfully${
        resolvedDatabasePath ? ` on ${resolvedDatabasePath}` : ""
      } using ${sqlBackend ?? "the selected runtime"}. Retrieved ${rowCount} rows in ${executionTime}ms. ${insights.join(
        ". ",
      )}.`,
      parts: [artifactPart],
    };
  },
});
