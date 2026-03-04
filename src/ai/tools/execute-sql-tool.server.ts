import { tool } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getContext, getCurrentUser } from "@/ai/context";
import { runSqlNormalized } from "@/lib/db/router";
import { delay } from "@/lib/delay";
import type { CardConfig, Config, Result } from "@/lib/types";
import { generateCardConfig } from "./generate-card-config-tool";
import { generateChartConfig } from "./generate-chart-config-tool";

export const executeSqlToolServer = tool({
  description:
    "Execute a SQL query and return the results, returns a maximum of 50 rows.",
  inputSchema: z.object({
    sql: z.string().describe("The SQL query to execute"),
    databasePath: z
      .string()
      .describe(
        "Database identifier/path to run the SQL against (e.g. md:my_db)",
      )
      .default("md:my_db"),
    userQuery: z
      .string()
      .optional()
      .describe("The original user query/question that led to this SQL"),
    generateChart: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to generate chart visualization (default: true)"),
  }),
  execute: async ({ sql, userQuery, generateChart, databasePath }) => {
    // Get current user context
    const user = getCurrentUser();
    const { writer } = getContext();
    const artifactId = nanoid();
    const createdAt = Date.now();

    // Helper to write data part updates
    const writeArtifact = (
      status: "loading" | "streaming" | "complete" | "error",
      progress: number,
      payload: Record<string, unknown>,
      error?: string,
    ) => {
      writer.write({
        type: "data-execute-sql",
        id: artifactId,
        data: {
          id: artifactId,
          version: 1,
          status,
          progress,
          error,
          payload,
          createdAt,
          updatedAt: Date.now(),
        },
      });
    };

    const debugContext = {
      artifactId,
      userId: user.id,
      databasePath,
    };

    // Step 1: Loading state
    writeArtifact("loading", 0, {
      stage: "loading",
      title: "SQL Query Results",
      query: sql,
      progress: 0,
      columns: [],
      rows: [],
    });

    console.debug("[executeSqlTool] Step 1 (loading) initialized", {
      ...debugContext,
      query: sql,
    });

    // Step 2: Processing - execute query
    writeArtifact("streaming", 0.2, {
      stage: "processing",
      query: sql,
      progress: 0.2,
    });
    await delay(2000);

    console.debug("[executeSqlTool] Step 2 (processing) started", debugContext);

    const startTime = Date.now();
    let parsedResults: Result[] = [];
    try {
      parsedResults = await runSqlNormalized(databasePath, sql);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      writeArtifact("error", 0, { stage: "error", query: sql }, errorMessage);
      throw new Error(errorMessage);
    }

    console.debug("[executeSqlTool] Step 2 (processing) finished", {
      ...debugContext,
    });

    const executionTime = Date.now() - startTime;

    // Step 3: Analyzing - process results
    writeArtifact("streaming", 0.6, {
      stage: "analyzing",
      query: sql,
      progress: 0.6,
    });
    await delay(2500);

    console.debug("[executeSqlTool] Step 3 (analyzing) started", debugContext);

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
    writeArtifact("streaming", 0.8, {
      stage: "visualizing",
      query: sql,
      progress: 0.8,
    });
    console.debug(
      "[executeSqlTool] Step 4 (visualizing) started",
      debugContext,
    );

    if (isSingleValue && userQuery) {
      try {
        // Add delay to avoid rate limit errors
        await delay(100);
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
        // Add delay to avoid rate limit errors
        await delay(100);
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
      progress: 1,
      query: sql,
      dbIdentifier: databasePath,
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

    writeArtifact("complete", 1, finalData);

    console.debug("[executeSqlTool] Step 5 (complete) finished", {
      ...debugContext,
      executionTimeMs: executionTime,
      rowCount,
      visualType,
      hasChartConfig: Boolean(chartConfig),
      actualRowsInPayload: finalData.rows.length,
    });

    // Return the text summary for the AI model
    return {
      text: `Executed ${queryType} query successfully (User: ${
        user.fullName
      } - ${
        user.id
      }) on ${databasePath}. Retrieved ${rowCount} rows in ${executionTime}ms. ${insights.join(
        ". ",
      )}.`,
    };
  },
});
