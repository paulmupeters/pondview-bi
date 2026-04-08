import { tool } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { CardConfig, Config, Result } from "@/lib/types";
import { generateCardConfig } from "./generate-card-config-tool";
import { generateChartConfig } from "./generate-chart-config-tool";
import { deriveColumns, executeSqlForRuntime } from "./sql-tool-shared";

export const executeFinalSqlTool = tool({
  description:
    "Execute the exact SQL that should become the committed result for the current notebook cell. Use this only after the SQL draft is verified and ready to render.",
  inputSchema: z.object({
    sql: z
      .string()
      .describe("The exact final SQL query to execute for the notebook cell."),
    databasePath: z
      .string()
      .optional()
      .describe(
        "Optional database identifier/path to run the SQL against. Omit to use the selected Query Runtime.",
      ),
    userQuery: z
      .string()
      .optional()
      .describe("The original user question that led to this SQL"),
    generateChart: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to generate chart visualization (default: true)"),
  }),
  execute: async ({ sql, userQuery, generateChart, databasePath }) => {
    const artifactId = nanoid();
    const createdAt = Date.now();
    const debugContext = { artifactId, databasePath };

    let parsedResults: Result[] = [];
    let executionTime = 0;
    let resolvedDatabasePath: string | undefined;
    let sqlBackend: string | undefined;

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

    const columns = deriveColumns(parsedResults);
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

    const queryType = sql.trim().split(/\s+/)[0]?.toUpperCase() || "SELECT";
    let chartConfig: Config | undefined;
    let cardConfig: CardConfig | undefined;
    let visualType: "table" | "chart" | "card" = "table";

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
      "[executeFinalSqlTool] Step 4 (visualizing) started",
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
        "[executeFinalSqlTool] Table view enabled, no chart or card visualization generated",
        debugContext,
      );
    }

    console.debug("[executeFinalSqlTool] Step 4 (visualizing) finished", {
      ...debugContext,
      chartConfig,
      cardConfig,
      visualType,
    });

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

    console.debug("[executeFinalSqlTool] Step 5 (complete) finished", {
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

// Legacy export kept for transitional imports and historical tests.
export const executeSqlTool = executeFinalSqlTool;
