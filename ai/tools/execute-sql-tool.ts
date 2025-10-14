import { tool } from "ai";
import { z } from "zod";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";
import { getCurrentUser } from "@/ai/context";
import { delay } from "@/lib/delay";
import { runDuckDbCli } from "@/lib/duckdb/duckdb-cli";
import type { Config, Result } from "@/lib/types";
import { generateChartConfig } from "./generate-chart-config-tool";

export const executeSqlTool = tool({
  description:
    "Execute a SQL query and return the results, returns a maximum of 50 rows.",
  inputSchema: z.object({
    sql: z.string().describe("The SQL query to execute"),
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
  execute: async ({ sql, userQuery, generateChart }) => {
    // Get current user context
    const user = getCurrentUser();

    // Step 1: Create with loading state
    const sqlArtifact = ExecuteSqlArtifact.stream({
      stage: "loading",
      title: "SQL Query Results",
      query: sql,
      progress: 0,
      columns: [],
      rows: [],
    });
    const debugContext = {
      artifactId: sqlArtifact.id,
      userId: user.id,
    };

    console.debug("[executeSqlTool] Step 1 (loading) initialized", {
      ...debugContext,
      query: sql,
    });

    // Step 2: Processing - execute query
    await sqlArtifact.update({ stage: "processing", progress: 0.2 });
    await delay(1000);

    console.debug("[executeSqlTool] Step 2 (processing) started", debugContext);

    const startTime = Date.now();
    const { code, stdout, stderr } = await runDuckDbCli({
      dbPath: `md:my_db?motherduck_token=${process.env.MOTHERDUCK_TOKEN}`,
      args: [sql],
      json: true,
    });

    console.debug("[executeSqlTool] Step 2 (processing) finished", {
      ...debugContext,
      exitCode: code,
    });

    const executionTime = Date.now() - startTime;

    if (code !== 0) {
      await sqlArtifact.error(stderr);
      throw new Error(stderr);
    }
    // Step 3: Analyzing - process results
    await sqlArtifact.update({ stage: "analyzing", progress: 0.6 });
    await delay(1000);

    console.debug("[executeSqlTool] Step 3 (analyzing) started", debugContext);

    let parsedResults: Result[] = [];
    try {
      const rawResults = JSON.parse(stdout) as Record<string, unknown>[];

      const normalizeValue = (
        value: unknown
      ): string | number | boolean | Date => {
        if (value instanceof Date) {
          return value;
        }
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          return value;
        }
        if (value === null || value === undefined) {
          return "";
        }
        return JSON.stringify(value);
      };

      parsedResults = rawResults.map((row) => {
        const normalizedRow: Record<string, string | number | boolean | Date> =
          {};
        for (const [key, value] of Object.entries(row)) {
          normalizedRow[key] = normalizeValue(value);
        }
        return normalizedRow;
      });
    } catch {
      await sqlArtifact.error("Failed to parse SQL results");
      throw new Error("Failed to parse SQL results");
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
        `Query returned ${rowCount} row${rowCount === 1 ? "" : "s"}`
      );

      if (rowCount === 50) {
        insights.push(
          "Results limited to 50 rows - there may be more data available"
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
          } for analysis`
        );
      }
    } else {
      insights.push("Query executed successfully but returned no results");
    }

    // Determine query type
    const queryType = sql.trim().split(/\s+/)[0].toUpperCase();
    // Determine if data is suitable for charting and generate chart config
    let chartConfig: Config | undefined;
    let visualType: "table" | "chart" = "table";

    const isChartWorthy =
      rowCount > 0 && rowCount <= 50 && queryType === "SELECT";
    const hasNumericData = columns.some((col) => {
      const sampleValue = parsedResults[0]?.[col.name];
      return (
        typeof sampleValue === "number" || !Number.isNaN(Number(sampleValue))
      );
    });
    sqlArtifact.update({ stage: "visualizing", progress: 0.8 });
    console.debug(
      "[executeSqlTool] Step 4 (visualizing) started",
      debugContext
    );

    if (isChartWorthy && hasNumericData && userQuery && generateChart) {
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
    }

    // Step 4: Complete with results
    const finalData = {
      title: "SQL Query Results",
      stage: "complete" as const,
      progress: 1,
      query: sql,
      executionTime,
      rowCount,
      columns,
      rows: parsedResults,
      visualType,
      chartConfig,
      summary: {
        totalRows: rowCount,
        executionTimeMs: executionTime,
        queryType,
        insights,
      },
    };

    await sqlArtifact.complete(finalData);

    console.debug("[executeSqlTool] Step 5 (complete) finished", {
      ...debugContext,
      executionTimeMs: executionTime,
      rowCount,
      visualType,
      hasChartConfig: Boolean(chartConfig),
    });

    // Return the artifact data in the format expected by the AI SDK
    return {
      parts: [
        {
          type: `data-artifact-${ExecuteSqlArtifact.id}`,
          data: {
            id: sqlArtifact.id,
            version: 1,
            status: "complete" as const,
            progress: 1,
            payload: finalData,
            createdAt: Date.now(),
          },
        },
      ],
      text: `Executed ${queryType} query successfully (User: ${
        user.fullName
      } - ${
        user.id
      }). Retrieved ${rowCount} rows in ${executionTime}ms. ${insights.join(
        ". "
      )}.`,
    };
  },
});
