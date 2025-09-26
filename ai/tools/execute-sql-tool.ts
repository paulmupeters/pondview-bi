import { tool } from "ai";
import { z } from "zod";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";
import { getCurrentUser } from "@/ai/context";
import { delay } from "@/lib/delay";
import { runDuckDbCli } from "@/lib/duckdb/duckdb-cli";

export const executeSqlTool = tool({
  description:
    "Execute a SQL query and return the results, returns a maximum of 50 rows",
  inputSchema: z.object({
    sql: z.string().describe("The SQL query to execute"),
  }),
  execute: async ({ sql }) => {
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

    await delay(300);

    // Step 2: Processing - execute query
    sqlArtifact.progress = 0.2;
    await sqlArtifact.update({ stage: "processing" });

    const startTime = Date.now();
    const { code, stdout, stderr } = await runDuckDbCli({
      dbPath: `md:my_db?motherduck_token=${process.env.MOTHERDUCK_TOKEN}`,
      args: [sql],
      json: true,
    });

    const executionTime = Date.now() - startTime;

    if (code !== 0) {
      await sqlArtifact.error(stderr);
      throw new Error(stderr);
    }

    await delay(200);

    // Step 3: Analyzing - process results
    await sqlArtifact.update({ stage: "analyzing", progress: 0.6 });

    let parsedResults: Record<string, unknown>[] = [];
    try {
      parsedResults = JSON.parse(stdout);
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
          `Found ${numericColumns.length} numeric column${numericColumns.length === 1 ? "" : "s"} for analysis`,
        );
      }
    } else {
      insights.push("Query executed successfully but returned no results");
    }

    // Determine query type
    const queryType = sql.trim().split(/\s+/)[0].toUpperCase();

    await delay(300);

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
      summary: {
        totalRows: rowCount,
        executionTimeMs: executionTime,
        queryType,
        insights,
      },
    };

    await sqlArtifact.complete(finalData);

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
      text: `Executed ${queryType} query successfully (User: ${user.fullName} - ${user.id}). Retrieved ${rowCount} rows in ${executionTime}ms. ${insights.join(". ")}.`,
    };
  },
});
